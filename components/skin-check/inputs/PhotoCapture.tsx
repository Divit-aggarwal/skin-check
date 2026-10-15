"use client";

import { useCallback, useEffect, useReducer, useRef, useState, type ChangeEvent } from "react";
import { AlertCircle, Camera, Check, RotateCcw, ScanFace } from "lucide-react";
import { CAPTURE_COPY as K, GATE_COPY as G, GUIDED_COPY, cameraView, gateRows, type GuidedFallback } from "../captureStates";
import { GuidedCapture, type GuidedPhotos } from "./GuidedCapture";
import { uploadSides } from "./sideUploads";
import { threeAngleUi } from "@/lib/ui-flags";
import { liveGateChecks } from "@/lib/capture-quality/live";
import type { CheckResult } from "@/lib/capture-quality/types";
import type { SideAngle } from "@/lib/feature-contracts/check-photos";
import { useCameraStream } from "@/hooks/useCameraStream";
import { useAuth } from "@/lib/auth-context";
import { isAuthError, isUploadError, isUploadTooLarge, runSkinScan, UPLOAD_TOO_LARGE_MESSAGE } from "@/lib/api";
import { OVERLAY_CATEGORIES } from "@/lib/skin-check-skus";
import { preloadFaceMesh } from "@/components/mesh/landmarks";
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
import { btnPrimary, btnSecondary, card, eyebrow } from "@/components/ui/page";
import { TintCard } from "@/components/ui/kit";
import type { PhotoCaptureStep } from "@/types/skin-check";
import type { CaptureMethod, SkinScanState } from "@/types/skin-scan";

// Optional: the storefront's Terms page, absolute (this app is on its own
// subdomain). Unset, the checkbox still gates the scan and the label has no link.
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

// Chosen by device: capture="user" opens the camera on phones only, so a
// laptop uses getUserMedia and a canvas instead of a plain file picker.
function isMobileCaptureDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData && typeof uaData.mobile === "boolean") return uaData.mobile;
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// R3: the checkbox shows PROCESSING_CONSENT_COPY exactly, with the terms label as a link.
const [PROCESSING_TERMS_BEFORE, PROCESSING_TERMS_AFTER] = PROCESSING_CONSENT_COPY.split(PROCESSING_CONSENT_TERMS_LABEL);

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

export function PhotoCapture({ step, scanId, value, onChange, onCommit, scan, onScanChange }: PhotoCaptureProps) {
  // The camera and the request are gated on the user, not on section order.
  const { user, loading: authLoading } = useAuth();
  // Computed once — the device type doesn't change mid-session.
  const [isMobile] = useState(isMobileCaptureDevice);
  const { videoRef, status, requestCamera, stopCamera } = useCameraStream();
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
  // C10/C11, threeAngleUi(): "on" shows the guided three-photo capture; a fallback reason shows today's
  // one-photo capture with that reason; "off" (flag off) is today's capture, unchanged.
  const [guided, setGuided] = useState<"on" | "off" | GuidedFallback>(() => (threeAngleUi() ? "on" : "off"));
  // The two cheek photos (guided capture only) and each one's own gate result. Stored, never analysed.
  const [sides, setSides] = useState<Record<SideAngle, { blob: Blob; url: string; retake: string | null }> | null>(null);
  // The guided capture is a canvas frame on every device; today's paths keep their own method.
  const captureMethodRef = useRef<CaptureMethod>(isMobile ? "native" : "canvas");

  // The retake loop (C01) and both consents in one reducer
  // (lib/capture-quality/gate.ts): a retake clears the gate result and both
  // consents together, so consent never carries over to another image.
  // `hasConsented` (required) gates the analysis request itself.
  // `hasRetentionConsent` (optional, separate) only decides whether the
  // original is kept in private S3. Neither is written to the draft.
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
  // G16: the laptop no longer asks for the camera when the step appears; it
  // asks on "Open camera", so the user knows what the browser's prompt is
  // for. No prompt without a verified user either: the button only renders
  // past the !user guard below. The stream still stops when the step goes.
  // Native capture is driven entirely by the hidden <input type="file">.
  useEffect(() => {
    if (isMobile) return;
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);
  const takeRef = useRef<HTMLButtonElement>(null);
  // Ready: focus moves to "Take photo", so a keyboard user is one key away.
  useEffect(() => {
    if (!isMobile && status === "active" && previewUrl === null) takeRef.current?.focus();
  }, [isMobile, status, previewUrl]);

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
  // `live`: distance, framing and pose measured on the stream at the shutter (guided capture only).
  const startGate = useCallback((blob: Blob, captureMethod: CaptureMethod, live?: Record<"distance" | "framing" | "pose", CheckResult>) => {
    const photoId = ++photoSeqRef.current;
    captureMethodRef.current = captureMethod;
    dispatch({ type: "captured", photoId });
    void frameFromBlob(blob).then((frame) =>
      dispatch({
        type: "gateResult",
        photoId,
        // Without live checks (flag off, or today's capture) the call is today's.
        quality: live ? runCaptureGate(frame, { captureMethod, retakeCount: 0 }, undefined, live) : runCaptureGate(frame, { captureMethod, retakeCount: 0 }),
      })
    );
  }, []);

  const handleGuidedDone = useCallback(
    ({ front, left, right, frontFace }: GuidedPhotos) => {
      capturedBlobRef.current = front;
      originalBlobRef.current = front;
      startGate(front, "canvas", liveGateChecks(frontFace));
      setPreviewUrl(URL.createObjectURL(front));
      const side = (blob: Blob) => ({ blob, url: URL.createObjectURL(blob), retake: null });
      setSides({ left: side(left), right: side(right) });
      // The after-capture gate runs on each cheek photo too; its result is shown, never blocks (they are not read).
      for (const angle of ["left", "right"] as const) {
        const blob = angle === "left" ? left : right;
        void frameFromBlob(blob).then((frame) => {
          const q = runCaptureGate(frame, { captureMethod: "canvas", retakeCount: 0 });
          const reason = q.verdict === "retake" ? RETAKE_COPY[q.retakeReasons[0]!] : null;
          setSides((prev) => (prev && prev[angle].blob === blob ? { ...prev, [angle]: { ...prev[angle], retake: reason } } : prev));
        });
      }
    },
    [startGate]
  );

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
    if (guided === "on") {
      // ponytail: a retake starts all three photos again; per-angle retake if users ask for it.
      setSides((prev) => {
        if (prev) for (const a of ["left", "right"] as const) URL.revokeObjectURL(prev[a].url);
        return null;
      });
    } else if (isMobile) {
      fileInputRef.current?.click();
    } else {
      requestCamera();
    }
  }, [guided, isMobile, requestCamera]);

  // handleRetake, plus reopening a committed step and clearing its old scan result.
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
    const captureMethod: CaptureMethod = captureMethodRef.current;
    const quality = flow.quality ?? undefined;
    // C10: the cheek photos upload beside the front (same retention consent) and are never sent for reading.
    const sidesDone = sides ? uploadSides(user.uid, scanId, { left: sides.left.blob, right: sides.right.blob }, hasRetentionConsent) : Promise.resolve(undefined);

    // Move on now; the scan runs in the background.
    onChange("done");
    onCommit();

    onScanChange({ status: "loading", photo: blob });
    // TD-37 (2): the mesh files start loading now, so the scanning view can draw it.
    preloadFaceMesh();
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
    // The original goes to private S3 first; the analysis starts only after
    // that succeeded (runSkinScan owns both, so a retry runs the same order).

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
      .then(async ({ result, originalStored }) => {
        const sideImages = await sidesDone;
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
            ...(sideImages ? { sideImages } : {}),
          },
          scanId
        );
      })
      .catch(async (err) => {
        const sideImages = await sidesDone;
        console.error("Skin scan failed:", err);
        // The engine refused the photo for a reason a retake fixes (O-5).
        const retakeReason = isRetakeError(err) ? retakeReasonFromServerCode(err.code) ?? undefined : undefined;
        onScanChange({
          status: "error",
          // A refused session, not a photo problem: a refresh restores sign-in.
          message: retakeReason
            ? RETAKE_COPY[retakeReason]
            : isAuthError(err)
            ? "Your session expired before we could read your photo. Refresh the page to sign in again, then retry."
            : isUploadTooLarge(err)
            ? UPLOAD_TOO_LARGE_MESSAGE
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
          ...(sideImages ? { sideImages } : {}),
        }, scanId);
      });
  }, [flow, hasRetentionConsent, onChange, onCommit, onScanChange, user, scanId, sides]);

  // Firebase hasn't reported yet — holding the frame is the difference
  // between "we don't know" and "you're signed out" (failure case 6).
  if (authLoading) {
    return <div className="h-40 w-full max-w-[280px] animate-pulse rounded-card bg-brand-50" />;
  }

  // Unreachable through the normal flow — the "verify" section sits directly
  // above this one and can't be completed without a Firebase user. Kept as
  // the hard stop for every other way in: a restored draft that resumed past
  // the verify section, a signOut in another tab, an expired session.
  if (!user) {
    return (
      <div className={`${card} flex flex-col gap-2`}>
        <p className="text-sm text-brand-muted">
          Verify your phone number before taking your photo.
        </p>
        <p className="text-xs text-brand-muted">
          Tap back to the Verify step to continue.
        </p>
      </div>
    );
  }

  if (value === "done") {
    const thumbSrc = previewUrl ?? donePreviewUrl;
    return (
      <div className={`${card} flex flex-col gap-3 sm:flex-row sm:items-center`}>
        <div className="flex items-center gap-3">
          {thumbSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- transient object URL, not a static asset
            <img src={thumbSrc} alt="Captured photo" className="size-14 rounded-tile object-cover" />
          )}
          <p className="text-sm text-brand-muted">
            {scan.status === "loading"
              ? "Analyzing your photo…"
              : scan.status === "error" && scan.retakeReason
                ? RETAKE_COPY[scan.retakeReason]
                : "Photo saved for this check."}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRetakeFromDone}
          className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline sm:ml-auto"
        >
          <RotateCcw aria-hidden className="h-4 w-4" />
          {K.retake}
        </button>
      </div>
    );
  }

  if (guided === "on" && !hasCaptured) return <GuidedCapture onDone={handleGuidedDone} onFallback={setGuided} />;

  const view = cameraView(isMobile, status, hasCaptured);
  const blocked = view === "refused" || view === "unavailable" || view === "failed";
  const openCamera = () => {
    if (isMobile) fileInputRef.current?.click();
    else void requestCamera();
  };
  const howToAllow = (
    <ul className="flex flex-col gap-2">
      {K.how.map((h) => (
        <li key={h.device}>
          <span className="font-semibold">{h.device}: </span>
          {h.steps}
        </li>
      ))}
    </ul>
  );

  return (
    <div className="flex flex-col gap-4">
      {guided !== "on" && guided !== "off" && (
        <p role="note" className="flex max-w-md items-start gap-2 rounded-tile bg-brand-50 px-4 py-3 text-sm text-brand-text">
          <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-text-muted" />
          {GUIDED_COPY.fallback[guided]}
        </p>
      )}
      {/* The video stays mounted on the laptop from "start" to "ready": the
          stream attaches to it while the browser asks (useCameraStream). */}
      {/* A phone has no live preview, so its start box is small: "Open camera" stays above the fold at 390px. */}
      {/* The guided capture shows its three photos below instead. */}
      <div className={`relative w-full self-center overflow-hidden rounded-card bg-brand-900 ${isMobile && !hasCaptured ? "aspect-square max-w-[200px]" : "aspect-[3/4] max-w-[320px]"}${sides ? " hidden" : ""}`}>
        {!isMobile && !hasCaptured && (
          <video
            ref={videoRef}
            aria-label={K.previewLabel}
            aria-hidden={view !== "ready"}
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
        {(view === "start" || blocked) && (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center">
            <Camera className="h-10 w-10 text-white/60" />
          </div>
        )}
        {/* Framing guide (mockup 07): corners only, no live checks (C11). */}
        {(view === "start" || view === "ready" || blocked) && (
          <div aria-hidden className="pointer-events-none absolute inset-[14%]">
            <span className="absolute left-0 top-0 size-7 rounded-tl-lg border-l-2 border-t-2 border-white/80" />
            <span className="absolute right-0 top-0 size-7 rounded-tr-lg border-r-2 border-t-2 border-white/80" />
            <span className="absolute bottom-0 left-0 size-7 rounded-bl-lg border-b-2 border-l-2 border-white/80" />
            <span className="absolute bottom-0 right-0 size-7 rounded-br-lg border-b-2 border-r-2 border-white/80" />
          </div>
        )}
        {view === "loading" && (
          <div aria-hidden className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white motion-reduce:animate-none" />
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

      <TintCard icon={ScanFace} title={G.frameTitle} body={step.note} className="max-w-md" />

      {/* Loading is announced here; "ready" is heard through the focus move to Take photo (its description). */}
      <div role="status" className="max-w-sm text-sm">
        {view === "loading" && <p>{K.loading}</p>}
      </div>
      {view === "ready" && (
        <p id="camera-ready" className="max-w-sm text-sm text-brand-ink">
          {K.ready}
        </p>
      )}

      {blocked && (
        <div className={`${card} flex max-w-md flex-col gap-3 text-brand-text`}>
          {/* Only the title is announced; the how-to is read on demand. */}
          <p role="alert" className="flex items-start gap-2 font-semibold">
            <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-error" />
            <span>{view === "refused" ? K.refusedTitle : view === "unavailable" ? K.unavailable : K.failed}</span>
          </p>
          {view === "refused" && (
            <div className="flex flex-col gap-2 text-sm">
              <p className="font-semibold">{K.howTitle}</p>
              {howToAllow}
            </div>
          )}
          <button type="button" onClick={openCamera} className={`${btnSecondary} w-fit`}>
            <Camera aria-hidden className="h-4 w-4" />
            {K.tryAgain}
          </button>
        </div>
      )}

      {view === "start" && (
        <div className="flex max-w-md flex-col gap-2">
          <button type="button" onClick={openCamera} className={`${btnPrimary} w-full sm:w-fit`} aria-describedby="camera-next">
            <Camera aria-hidden className="h-5 w-5" />
            {K.open}
          </button>
          <p id="camera-next" className="text-sm text-brand-muted">
            {isMobile ? K.nextPhone : K.nextLaptop}
          </p>
          {isMobile && (
            <details className="text-sm text-brand-ink">
              <summary className="inline-flex min-h-11 cursor-pointer items-center font-medium text-brand-forest underline-offset-4 hover:underline">
                {K.phoneHelp}
              </summary>
              <div className="pb-2 pt-1">{howToAllow}</div>
            </details>
          )}
        </div>
      )}

      {view === "ready" && (
        // The shutter (mockup 07): a round button, named by its hidden text.
        <button
          ref={takeRef}
          type="button"
          onClick={handleCapture}
          aria-describedby="camera-ready"
          className="grid size-[76px] place-items-center self-center rounded-full border-4 border-brand-700 bg-brand-surface transition-colors duration-fast hover:bg-brand-50"
        >
          <span aria-hidden className="size-14 rounded-full bg-brand-700" />
          <span className="sr-only">{K.take}</span>
        </button>
      )}

      {hasCaptured && (
        <div className="flex flex-col gap-4">
          {sides && (
            <section aria-labelledby="three-photos-title" className="flex max-w-md flex-col gap-2">
              <h2 id="three-photos-title" className={eyebrow}>
                {GUIDED_COPY.review}
              </h2>
              <ul className="grid grid-cols-3 gap-2">
                {[{ url: previewUrl, retake: null }, sides.left, sides.right].map((p, i) => (
                  <li key={GUIDED_COPY.steps[i]} className="flex flex-col gap-1">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the user's own photo, a transient object URL */}
                    <img src={p.url ?? ""} alt={GUIDED_COPY.steps[i]} className="aspect-[3/4] w-full rounded-tile object-cover" />
                    <span className="text-sm font-medium text-brand-text">{GUIDED_COPY.steps[i]}</span>
                    {p.retake && <span className="text-xs text-brand-error">{p.retake}</span>}
                  </li>
                ))}
              </ul>
              <p className="text-sm text-brand-text-muted">{GUIDED_COPY.sidesNote}</p>
            </section>
          )}
          {/* Required consent gate — the scan request below never fires
              until this is checked (PART 13). Unchecked by default, real
              <input type="checkbox">, keyboard- and screen-reader-visible. */}
          <label className="flex max-w-md items-start gap-3 py-1 text-base text-brand-ink">
            <input
              type="checkbox"
              checked={hasConsented}
              onChange={(e) => dispatch({ type: "consent", analysis: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-brand-line accent-brand-action"
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
          <label className="flex max-w-md items-start gap-3 py-1 text-base text-brand-ink">
            <input
              type="checkbox"
              checked={hasRetentionConsent}
              onChange={(e) => dispatch({ type: "consent", retention: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0 rounded border-brand-line accent-brand-action"
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

          {/* Redesign 07: the gate's own result for this photo, words only (no number). */}
          {flow.gate === "done" && gateRows(flow.quality).length > 0 && (
            <section aria-labelledby="photo-check-title" className={`${card} max-w-md`}>
              <h2 id="photo-check-title" className={eyebrow}>
                {G.title}
              </h2>
              <ul className="mt-2 flex flex-col divide-y divide-brand-border">
                {gateRows(flow.quality).map((row) => (
                  <li key={row.id} className="flex min-h-11 items-center justify-between gap-3 text-sm">
                    <span className="text-brand-text">{row.label}</span>
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${row.status === "fail" ? "text-brand-error" : row.status === "pass" ? "text-brand-700" : "text-brand-text-muted"}`}>
                      {row.status === "pass" ? <Check aria-hidden size={16} /> : row.status === "fail" ? <AlertCircle aria-hidden size={16} /> : null}
                      {row.status === "pass" ? G.pass : row.status === "fail" ? G.fail : G.notMeasured}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Gate status (C01). Instruction only: no score or number. */}
          <div aria-live="polite" className="max-w-sm text-sm">
            {flow.gate === "pending" && <p className="text-brand-muted">Checking your photo…</p>}
            {flow.gate === "done" && flow.quality && flow.quality.retakeReasons.length > 0 && (
              <p role="alert" className="flex items-start gap-2 rounded-tile border border-brand-border bg-brand-surface px-4 py-3 text-brand-text">
                <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-brand-error" />
                <span>{RETAKE_COPY[flow.quality.retakeReasons[0]!]}</span>
              </p>
            )}
          </div>
          {canOverride(flow) && (
            <button
              type="button"
              onClick={() => dispatch({ type: "override" })}
              className="inline-flex min-h-11 w-fit items-center text-sm font-medium text-brand-forest underline-offset-4 hover:underline"
            >
              Use this photo anyway
            </button>
          )}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outlineLight"
              size="lg"
              disabled={scan.status === "loading"}
              onClick={handleRetake}
              className="gap-2"
            >
              <RotateCcw aria-hidden className="h-4 w-4" />
              {sides ? GUIDED_COPY.retakeAll : K.retake}
            </Button>
            <Button
              type="button"
              variant="ink"
              size="lg"
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
