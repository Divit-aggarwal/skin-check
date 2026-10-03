"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ChangeEvent } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useAuth } from "@/lib/auth-context";
import { isAuthError, isUploadError, runSkinScan } from "@/lib/api";
import { OVERLAY_CATEGORIES } from "@/lib/skin-check-skus";
import {
  IMAGE_RETENTION_CONSENT_COPY,
  IMAGE_RETENTION_CONSENT_VERSION,
  PROCESSING_CONSENT_COPY,
  PROCESSING_CONSENT_TERMS_LABEL,
  PROCESSING_CONSENT_VERSION,
  PRIVACY_POLICY_LINK_TEXT,
  PRIVACY_POLICY_URL,
} from "@/lib/consent";
import { saveDraftScan } from "@/lib/skin-check-draft";
import { frameFromBlob } from "@/lib/capture-quality/frame";
import { canAnalyze, canOverride, captureFlowReducer, initialCaptureFlow, runCaptureGate } from "@/lib/capture-quality/gate";
import { isRetakeError, RETAKE_COPY, retakeReasonFromServerCode } from "@/lib/capture-quality/retake";
import { Button } from "@/components/ui/button";
import type { PhotoCaptureStep } from "@/types/skin-check";
import type { CaptureMethod, SkinScanState } from "@/types/skin-scan";

// Optional — the storefront's real Terms & Conditions page. Left unset, the
// checkbox still gates the scan; the label just doesn't link anywhere ("do
// not invent a final legal URL" — PART 12 of the redesign brief). This app
// is mounted on its own subdomain (PROJECT_CONTEXT.md), so a relative path
// like "/terms" would 404 rather than reach the storefront.
const TERMS_URL = process.env.NEXT_PUBLIC_TERMS_URL;

interface PhotoCaptureProps {
  step: PhotoCaptureStep;
  /** Stable id for this scan attempt — half of the S3 key for the original. */
  scanId: string;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  scan: SkinScanState;
  /** `forScanId` lets the flow drop a response from a superseded attempt. */
  onScanChange: (scan: SkinScanState, forScanId?: string) => void;
}

// capture="user" on a file input only actually opens the device camera on
// mobile browsers — on desktop it's ignored and degrades to a plain file
// picker, which is a worse UX than the existing getUserMedia+canvas live
// preview. So the two capture paths are chosen by device, not by feature
// support: mobile gets the native file input (real camera file, EXIF
// intact); desktop keeps getUserMedia+canvas (no higher-fidelity source
// exists there to fall back to).
function isMobileCaptureDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === "boolean") return uaData.mobile;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Downscales a full-res camera File to ~maxDimension on its long edge, for
// the CV call only — the original File's bytes are stored untouched
// elsewhere (see originalBlobRef below). Never upscales.
//
// imageOrientation: "from-image" is required here. createImageBitmap's
// default ignores EXIF Orientation and decodes raw, un-rotated pixels — a
// native camera File shot in portrait (Orientation 6/8) would then produce a
// sideways CV frame while the preview <img>, which honors EXIF by default,
// shows upright. Landmark detection either fails outright (NO_FACE_DETECTED)
// or, worse, succeeds against the wrong pixels and silently mislabels which
// region is which. The stored original (originalBlobRef) is the untouched
// File itself, not this bitmap, so its EXIF tag is never altered.
// R3: the checkbox shows PROCESSING_CONSENT_COPY exactly, with the terms label as a link.
const [PROCESSING_TERMS_BEFORE, PROCESSING_TERMS_AFTER] = PROCESSING_CONSENT_COPY.split(PROCESSING_CONSENT_TERMS_LABEL);

async function downscaleToJpeg(file: Blob, maxDimension: number, quality: number): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Could not get a 2D canvas context.");
    ctx.drawImage(bitmap, 0, 0, width, height);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas toBlob failed."))),
        "image/jpeg",
        quality
      );
    });
  } finally {
    bitmap.close();
  }
}

// Inline capture, not the full-screen ScanCapture used by the old post-login
// /scan route — this step has to accumulate on the same scrolling page like
// every other /skin-check step (CLAUDE.md-adjacent product spec for this
// flow), not break into a full-screen slide.
export function PhotoCapture({ step, scanId, value, onChange, onCommit, scan, onScanChange }: PhotoCaptureProps) {
  // PHASE 1: this step is only reachable after the "verify" section, so a
  // signed-in user is the normal case. Read anyway — ordering alone is a
  // property of the SECTIONS array, and the camera and the CV request are
  // worth gating on the identity itself.
  const { user, loading: authLoading } = useAuth();
  // Computed once — the device type doesn't change mid-session.
  const [isMobile] = useState(isMobileCaptureDevice);
  const { videoRef, status, error, requestCamera, stopCamera } = useCameraStream();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // The blob sent to the CV service — on mobile a ~1280px downscale of
  // originalBlobRef; on desktop the SAME object as originalBlobRef (no
  // higher-fidelity source exists to downscale from).
  const capturedBlobRef = useRef<Blob | null>(null);
  // The bytes that will eventually become scan_images.original_path — the
  // real camera File on mobile, or the getUserMedia+canvas blob on desktop.
  const originalBlobRef = useRef<Blob | null>(null);
  const hasCaptured = previewUrl !== null;

  // The retake loop (C01) and both consent booleans, in one pure reducer
  // (lib/capture-quality/gate.ts) so a retake clears the photo's gate result
  // and both consents in the same transition.
  //
  // Required data-collection consent (PART 11-15 of the redesign brief) —
  // `hasConsented` gates the scan request itself, not just the button's
  // disabled look. Local, session-scoped state: re-mounting this step (e.g.
  // navigating away and back) resets it, and every retake resets it, so
  // consent never silently carries over to a different image.
  // `hasRetentionConsent` is a SEPARATE permission, separate boolean,
  // deliberately never merged with the one above: that one allows this photo
  // to be analyzed, this one allows the original to be RETAINED in private
  // S3. Optional — declining it still gives the user their analysis, it just
  // means nothing is stored. Never written to the draft, so a new scan (or a
  // retake) has to ask again rather than inheriting an answer given for a
  // different image.
  const [flow, dispatch] = useReducer(captureFlowReducer, initialCaptureFlow);
  const { hasConsented, hasRetentionConsent } = flow;
  // Tags each capture so a gate result that arrives after a retake is dropped.
  const photoSeqRef = useRef(0);
  // "Analyze my skin" is only disabled once `scan.status` flips to "loading",
  // which is a re-render away — two taps inside the same tick would both get
  // through and bill two upstream CV jobs for one photo. Reset on retake, so
  // a genuinely new capture can still be analyzed.
  const scanRequestedRef = useRef(false);

  // Keyed on the uid, not the User object: onAuthStateChanged hands out a new
  // object on every hourly token refresh, and depending on that would tear
  // down and re-acquire the camera mid-capture.
  const uid = user?.uid ?? null;
  useEffect(() => {
    // Native capture is driven entirely by the hidden <input type="file">
    // below — no getUserMedia stream to request or tear down.
    if (isMobile) return;
    // No camera permission prompt for someone who hasn't verified a number:
    // the request would be for a photo they aren't allowed to submit.
    if (!uid) return;
    if (value !== "done") requestCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  // The committed-photo summary view (value === "done") can be reached by a
  // fresh remount — going forward a section then back — at which point the
  // capture-time `previewUrl` local state is gone. `scan.photo` is the same
  // blob lifted into useSkinCheckFlow, so it survives the remount; this
  // derives a display URL from it whenever that's the only source left.
  const [donePreviewUrl, setDonePreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    const blob = scan.status === "success" || scan.status === "error" ? scan.photo : null;
    if (!blob) {
      setDonePreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(blob);
    setDonePreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [scan]);

  // Checks the exact bytes the engine will receive (capturedBlobRef), so the
  // result describes the image whose hash becomes inputSha256.
  const startGate = useCallback((blob: Blob, captureMethod: CaptureMethod) => {
    const photoId = ++photoSeqRef.current;
    dispatch({ type: "captured", photoId });
    void frameFromBlob(blob).then((frame) =>
      dispatch({ type: "gateResult", photoId, quality: runCaptureGate(frame, { captureMethod, retakeCount: 0 }) })
    );
  }, []);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        // Desktop has no source higher-fidelity than this canvas frame, so
        // the CV blob and the stored "original" are the same bytes.
        capturedBlobRef.current = blob;
        originalBlobRef.current = blob;
        startGate(blob, "canvas");
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }, [videoRef, stopCamera, startGate]);

  const handleNativeFileChange = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset so selecting the same file again (retake, same photo) still fires onChange.
    e.target.value = "";
    if (!file) return;

    // Store the camera file's bytes verbatim — this is the "original" the
    // locked decision requires (full-res, EXIF intact). Only a downscaled
    // derivative of it goes to the CV service.
    originalBlobRef.current = file;
    const cvBlob = await downscaleToJpeg(file, 1280, 0.92);
    capturedBlobRef.current = cvBlob;
    startGate(cvBlob, "native");
    setPreviewUrl(URL.createObjectURL(file));
  }, [startGate]);

  const handleRetake = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    capturedBlobRef.current = null;
    originalBlobRef.current = null;
    scanRequestedRef.current = false;
    // Clears both consents and the gate result; a late result for the old photo is ignored.
    dispatch({ type: "retake" });
    if (isMobile) {
      fileInputRef.current?.click();
    } else {
      requestCamera();
    }
  }, [isMobile, requestCamera]);

  // Same as handleRetake, plus unwinding an already-committed step: reopens
  // the capture UI (value leaves "done") and clears the stale scan result,
  // so a retake after a completed or failed scan can't leave old data
  // sitting behind the new photo. Reachable from the "done" summary view,
  // including after a remount (PART 8's back-and-restore requirement).
  const handleRetakeFromDone = useCallback(() => {
    handleRetake();
    onChange("");
    onScanChange({ status: "idle" });
  }, [handleRetake, onChange, onScanChange]);

  const handleConfirm = useCallback(() => {
    // Consent AND the gate (O-4 soft block): pending or an un-overridden
    // retake verdict never reaches the request.
    if (!canAnalyze(flow) || scanRequestedRef.current) return;
    // Belt to getSkinScanResult's braces (lib/api.ts throws on the same
    // condition). Here so an unauthenticated tap is a silent no-op rather
    // than a rejected promise rendered as "analysis failed".
    if (!user) return;
    const blob = capturedBlobRef.current;
    const original = originalBlobRef.current;
    if (!blob || !original) return;
    scanRequestedRef.current = true;
    const captureMethod: CaptureMethod = isMobile ? "native" : "canvas";
    const quality = flow.quality ?? undefined;

    // Unlock the next section immediately. The scan runs in the background
    // while the user answers the remaining sections; by the time they reach
    // the results step it has almost always resolved. Awaiting here would
    // park them on this step for the scan's full duration — which is the
    // exact dead time moving capture earlier was meant to eliminate.
    onChange("done");
    onCommit();

    onScanChange({ status: "loading" });
    // Into the draft before the analysis starts, so a refresh mid-scan
    // restores this photo as a retryable scan instead of losing it. Written
    // under-claiming: the upload hasn't happened yet, so originalStored is
    // false until the outcome below rewrites it.
    const retentionConsentVersion = hasRetentionConsent ? IMAGE_RETENTION_CONSENT_VERSION : undefined;
    void saveDraftScan({
      scanId,
      photo: blob,
      result: null,
      captureMethod,
      originalStored: false,
      retentionConsentVersion,
      quality,
    });
    // Request every traversable category's overlay in this one call — the
    // skin-scan service accepts a comma-separated `overlays` list and
    // generates all of them in one pipeline run (measured well under its own
    // 25s timeout even for all 7 categories), so the results screen's
    // category switcher has every heatmap already in hand with no per-click
    // follow-up request. Deliberately not gated on `answers.primary_concerns`
    // (usually still unanswered here — skin-photo is section 2, your-skin is
    // section 3) since we want all of them regardless.
    // PHASE 3 ordering: the original image is PUT to private S3 first and the
    // CV analysis only starts once that succeeded (runSkinScan owns both
    // halves, so the dashboard's retry runs the same sequence).

    void runSkinScan({
      scanId,
      photo: blob,
      captureMethod,
      original,
      retentionConsent: hasRetentionConsent,
      overlays: OVERLAY_CATEGORIES,
      captureQuality: quality,
      // canAnalyze() above requires the processing checkbox.
      processingConsentVersion: PROCESSING_CONSENT_VERSION,
    })
      .then(({ result, originalStored }) =>
        onScanChange(
          {
            status: "success",
            result,
            photo: blob,
            original,
            captureMethod,
            originalStored,
            retentionConsentVersion,
            quality,
            processingConsentVersion: PROCESSING_CONSENT_VERSION,
          },
          scanId
        )
      )
      .catch((err) => {
        console.error("Skin scan failed:", err);
        // The engine refused the photo for a reason a retake fixes (O-5).
        const retakeReason = isRetakeError(err) ? retakeReasonFromServerCode(err.code) ?? undefined : undefined;
        onScanChange({
          status: "error",
          // An expired/refused session is not a photo problem, and telling
          // the user to retake the picture wouldn't fix it. This message is
          // rendered by SkinCheckDashboard (the step commits and advances
          // before the scan resolves), and the results view has no verify
          // step to send them to — so it points at the one action that does
          // work there: a refresh, which re-runs Firebase auth restoration.
          message: retakeReason
            ? RETAKE_COPY[retakeReason]
            : isAuthError(err)
            ? "Your session expired before we could read your photo. Refresh the page to sign in again, then retry."
            : isUploadError(err)
              // Upload failed, so the analysis never ran — retrying is the
              // fix, and the retry starts from the upload again.
              ? "We couldn't save your photo just now. Check your connection and retry."
              : "We couldn't analyze your photo just now — you can still see your results without it.",
          photo: blob,
          original,
          captureMethod,
          // Anything that isn't an upload error means the upload phase
          // already completed — the object IS in S3 and only the analysis
          // failed (case B), so the record must not claim otherwise.
          originalStored: !isUploadError(err) && Boolean(original) && hasRetentionConsent,
          retentionConsentVersion,
          quality,
          retakeReason,
          processingConsentVersion: PROCESSING_CONSENT_VERSION,
        }, scanId);
      });
  }, [flow, hasRetentionConsent, onChange, onCommit, onScanChange, isMobile, user, scanId]);

  // Firebase hasn't reported yet — holding the frame is the difference
  // between "we don't know" and "you're signed out" (failure case 6).
  if (authLoading) {
    return <div className="h-40 w-full max-w-[280px] animate-pulse rounded-lg bg-canvas" />;
  }

  // Unreachable through the normal flow — the "verify" section sits directly
  // above this one and can't be completed without a Firebase user. Kept as
  // the hard stop for every other way in: a restored draft that resumed past
  // the verify section, a signOut in another tab, an expired session.
  if (!user) {
    return (
      <div className="flex flex-col gap-2 rounded-lg border border-text/10 bg-white p-4">
        <p className="text-sm text-text/70">
          Verify your phone number before taking your photo.
        </p>
        <p className="text-xs text-text/45">
          Tap back to the Verify step to continue.
        </p>
      </div>
    );
  }

  if (value === "done") {
    const thumbSrc = previewUrl ?? donePreviewUrl;
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-text/10 bg-white p-4 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3">
          {thumbSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- transient object URL, not a static asset
            <img src={thumbSrc} alt="Captured photo" className="h-14 w-14 rounded-md object-cover" />
          )}
          <p className="text-sm text-text/70">
            {scan.status === "loading"
              ? "Analyzing your photo…"
              : scan.status === "error" && scan.retakeReason
                ? RETAKE_COPY[scan.retakeReason]
                : "Photo saved for this scan."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRetakeFromDone}
          className="text-sm font-medium text-text underline underline-offset-4 hover:text-blush sm:ml-auto"
        >
          Retake photo
        </button>
      </div>
    );
  }

  if (status === "denied" || status === "unavailable") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-text/10 bg-white p-4">
        <p className="text-sm text-text/70">{error ?? "Camera access is needed for this step."}</p>
        <Button type="button" variant="outlineLight" size="sm" onClick={requestCamera}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-lg bg-black">
        {!isMobile && !hasCaptured && (
          <video
            ref={videoRef}
            className="absolute inset-0 h-full w-full object-cover"
            playsInline
            muted
            autoPlay
          />
        )}
        {hasCaptured && (
          // eslint-disable-next-line @next/next/no-img-element -- transient object URL, not a static asset
          <img src={previewUrl} alt="Captured photo preview" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {!isMobile && <canvas ref={canvasRef} className="hidden" />}
        {!isMobile && status === "requesting" && !hasCaptured && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
        {isMobile && !hasCaptured && (
          <div className="absolute inset-0 flex items-center justify-center">
            <Camera className="h-10 w-10 text-white/40" />
          </div>
        )}
      </div>

      {isMobile && (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleNativeFileChange}
          className="hidden"
        />
      )}

      <p className="max-w-sm text-xs text-text/45">{step.note}</p>

      {!hasCaptured ? (
        <Button
          type="button"
          variant="ink"
          size="sm"
          disabled={!isMobile && status !== "active"}
          onClick={isMobile ? () => fileInputRef.current?.click() : handleCapture}
          className="w-fit gap-2"
        >
          <Camera className="h-4 w-4" />
          Capture
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Required consent gate — the scan request below never fires
              until this is checked (PART 13). Unchecked by default, real
              <input type="checkbox">, keyboard- and screen-reader-visible. */}
          <label className="flex max-w-sm items-start gap-2.5 text-sm text-text/70">
            <input
              type="checkbox"
              checked={hasConsented}
              onChange={(e) => dispatch({ type: "consent", analysis: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-text/30 text-blush focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
            />
            <span>
              {PROCESSING_TERMS_BEFORE}
              {TERMS_URL ? (
                <a
                  href={TERMS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-text"
                >
                  {PROCESSING_CONSENT_TERMS_LABEL}
                </a>
              ) : (
                <span className="underline underline-offset-2">{PROCESSING_CONSENT_TERMS_LABEL}</span>
              )}
              {PROCESSING_TERMS_AFTER}
            </span>
          </label>

          {/* Image RETENTION consent — a second, independent checkbox. Optional:
              leaving it unchecked still runs the analysis, it just means the
              original is never uploaded (runSkinScan skips the S3 step). Never
              pre-checked, never inferred from the box above or from continuing
              the questionnaire. */}
          <label className="flex max-w-sm items-start gap-2.5 text-sm text-text/70">
            <input
              type="checkbox"
              checked={hasRetentionConsent}
              onChange={(e) => dispatch({ type: "consent", retention: e.target.checked })}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-text/30 text-blush focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
            />
            <span>
              {IMAGE_RETENTION_CONSENT_COPY}{" "}
              <a
                href={PRIVACY_POLICY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-text"
              >
                {PRIVACY_POLICY_LINK_TEXT}
              </a>
            </span>
          </label>

          {/* Gate status (C01). Instruction only: no score or number. */}
          <div aria-live="polite" className="max-w-sm text-sm">
            {flow.gate === "pending" && <p className="text-text/60">Checking your photo…</p>}
            {flow.gate === "done" && flow.quality && flow.quality.retakeReasons.length > 0 && (
              <p className="text-text/80">{RETAKE_COPY[flow.quality.retakeReasons[0]!]}</p>
            )}
          </div>
          {canOverride(flow) && (
            <button
              type="button"
              onClick={() => dispatch({ type: "override" })}
              className="w-fit text-sm font-medium text-text underline underline-offset-4 hover:text-blush"
            >
              Use this photo anyway
            </button>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outlineLight"
              size="sm"
              disabled={scan.status === "loading"}
              onClick={handleRetake}
              className="gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Retake
            </Button>
            <Button
              type="button"
              variant="ink"
              size="sm"
              disabled={scan.status === "loading" || !canAnalyze(flow)}
              onClick={handleConfirm}
            >
              {scan.status === "loading" ? "Analyzing…" : "Analyze my skin"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
