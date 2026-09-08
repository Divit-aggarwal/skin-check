"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { useCameraStream } from "@/hooks/useCameraStream";
import { getSkinScanResult } from "@/lib/api";
import { OVERLAY_CATEGORIES } from "@/lib/skin-check-skus";
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
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  scan: SkinScanState;
  onScanChange: (scan: SkinScanState) => void;
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
export function PhotoCapture({ step, value, onChange, onCommit, scan, onScanChange }: PhotoCaptureProps) {
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

  // Required data-collection consent (PART 11-15 of the redesign brief) —
  // gates the scan request itself, not just the button's disabled look.
  // Local, session-scoped state: re-mounting this step (e.g. navigating
  // away and back) resets it, and retaking a photo resets it explicitly
  // below, so consent never silently carries over to a different image.
  const [hasConsented, setHasConsented] = useState(false);

  useEffect(() => {
    // Native capture is driven entirely by the hidden <input type="file">
    // below — no getUserMedia stream to request or tear down.
    if (isMobile) return;
    if (value !== "done") requestCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }, [videoRef, stopCamera]);

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
    setPreviewUrl(URL.createObjectURL(file));
  }, []);

  const handleRetake = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    capturedBlobRef.current = null;
    originalBlobRef.current = null;
    setHasConsented(false);
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
    if (!hasConsented) return;
    const blob = capturedBlobRef.current;
    const original = originalBlobRef.current;
    if (!blob || !original) return;
    const captureMethod: CaptureMethod = isMobile ? "native" : "canvas";

    // Unlock the next section immediately. The scan runs in the background
    // while the user answers the remaining sections; by the time they reach
    // the results step it has almost always resolved. Awaiting here would
    // park them on this step for the scan's full duration — which is the
    // exact dead time moving capture earlier was meant to eliminate.
    onChange("done");
    onCommit();

    onScanChange({ status: "loading" });
    // Request every traversable category's overlay in this one call — the
    // skin-scan service accepts a comma-separated `overlays` list and
    // generates all of them in one pipeline run (measured well under its own
    // 25s timeout even for all 7 categories), so the results screen's
    // category switcher has every heatmap already in hand with no per-click
    // follow-up request. Deliberately not gated on `answers.primary_concerns`
    // (usually still unanswered here — skin-photo is section 2, your-skin is
    // section 3) since we want all of them regardless.
    void getSkinScanResult(blob, OVERLAY_CATEGORIES)
      .then((result) =>
        onScanChange({ status: "success", result, photo: blob, original, captureMethod })
      )
      .catch((err) => {
        console.error("Skin scan failed:", err);
        onScanChange({
          status: "error",
          message:
            "We couldn't analyze your photo just now — you can still see your results without it.",
          photo: blob,
          original,
          captureMethod,
        });
      });
  }, [hasConsented, onChange, onCommit, onScanChange, isMobile]);

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
            {scan.status === "loading" ? "Analyzing your photo…" : "Photo saved for this scan."}
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
              onChange={(e) => setHasConsented(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-text/30 text-blush focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
            />
            <span>
              I agree to the{" "}
              {TERMS_URL ? (
                <a
                  href={TERMS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline underline-offset-2 hover:text-text"
                >
                  Terms &amp; Conditions
                </a>
              ) : (
                <span className="underline underline-offset-2">Terms &amp; Conditions</span>
              )}{" "}
              and consent to my photo being collected and processed for this skin analysis.
            </span>
          </label>

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
              disabled={scan.status === "loading" || !hasConsented}
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
