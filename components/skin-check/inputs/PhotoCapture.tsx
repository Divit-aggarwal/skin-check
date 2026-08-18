"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, RotateCcw } from "lucide-react";
import { useCameraStream } from "@/hooks/useCameraStream";
import { getSkinScanResult } from "@/lib/api";
import { Button } from "@/components/ui/button";
import type { PhotoCaptureStep } from "@/types/skin-check";
import type { SkinScanState } from "@/types/skin-scan";

interface PhotoCaptureProps {
  step: PhotoCaptureStep;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  scan: SkinScanState;
  onScanChange: (scan: SkinScanState) => void;
}

// Inline capture, not the full-screen ScanCapture used by the old post-login
// /scan route — this step has to accumulate on the same scrolling page like
// every other /skin-check step (CLAUDE.md-adjacent product spec for this
// flow), not break into a full-screen slide.
export function PhotoCapture({ step, value, onChange, onCommit, scan, onScanChange }: PhotoCaptureProps) {
  const { videoRef, status, error, requestCamera, stopCamera } = useCameraStream();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const capturedBlobRef = useRef<Blob | null>(null);
  const hasCaptured = previewUrl !== null;

  useEffect(() => {
    if (value !== "done") requestCamera();
    return () => stopCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        capturedBlobRef.current = blob;
        setPreviewUrl(URL.createObjectURL(blob));
        stopCamera();
      },
      "image/jpeg",
      0.92
    );
  }, [videoRef, stopCamera]);

  const handleRetake = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    capturedBlobRef.current = null;
    requestCamera();
  }, [requestCamera]);

  const handleConfirm = useCallback(async () => {
    const blob = capturedBlobRef.current;
    if (!blob) return;

    onScanChange({ status: "loading" });
    try {
      const result = await getSkinScanResult(blob);
      onScanChange({ status: "success", result, photo: blob });
    } catch (err) {
      console.error("Skin scan failed:", err);
      onScanChange({
        status: "error",
        message: "We couldn't analyze your photo just now — you can still see your results without it.",
        photo: blob,
      });
    }
    onChange("done");
    onCommit();
  }, [onChange, onCommit, onScanChange]);

  if (value === "done") {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-[#1A1A1A]/10 bg-white px-4 py-3">
        {previewUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- transient object URL, not a static asset
          <img src={previewUrl} alt="Captured photo" className="h-12 w-12 rounded-xl object-cover" />
        )}
        <p className="text-sm text-[#1A1A1A]/70">
          {scan.status === "loading" ? "Analyzing your photo…" : "Photo captured."}
        </p>
      </div>
    );
  }

  if (status === "denied" || status === "unavailable") {
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-[#1A1A1A]/10 bg-white p-4">
        <p className="text-sm text-[#1A1A1A]/70">
          {error ?? "Camera access is needed for this step."}
        </p>
        <Button type="button" variant="outlineLight" size="sm" onClick={requestCamera}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] w-full max-w-[280px] overflow-hidden rounded-2xl bg-black">
        {!hasCaptured && (
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
        <canvas ref={canvasRef} className="hidden" />
        {status === "requesting" && !hasCaptured && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          </div>
        )}
      </div>

      <p className="max-w-[85%] text-xs text-[#1A1A1A]/45">{step.note}</p>

      <div className="flex gap-2">
        {!hasCaptured ? (
          <Button
            type="button"
            variant="magenta"
            size="sm"
            disabled={status !== "active"}
            onClick={handleCapture}
            className="gap-2"
          >
            <Camera className="h-4 w-4" />
            Capture
          </Button>
        ) : (
          <>
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
              variant="magenta"
              size="sm"
              disabled={scan.status === "loading"}
              onClick={handleConfirm}
            >
              {scan.status === "loading" ? "Analyzing…" : "Use this photo"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
