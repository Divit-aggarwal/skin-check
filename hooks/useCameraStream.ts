"use client";

import { useState, useRef, useCallback, useEffect } from "react";

type CameraStatus =
  | "idle"
  | "requesting"
  | "active"
  | "denied"
  | "unavailable"
  | "error";

interface UseCameraStreamResult {
  videoRef: React.RefObject<HTMLVideoElement>;
  status: CameraStatus;
  error: string | null;
  requestCamera: () => Promise<void>;
  stopCamera: () => void;
}

export function useCameraStream(): UseCameraStreamResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<CameraStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setStatus("idle");
  }, []);

  const requestCamera = useCallback(async () => {
    setError(null);
    setStatus("requesting");

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      setError("Camera not available in this browser.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().catch(console.error);
          setStatus("active");
        };
      }
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setStatus("denied");
        setError(
          "Camera access was blocked. Allow camera in your browser settings and try again."
        );
      } else if (name === "NotFoundError") {
        setStatus("unavailable");
        setError("No camera found on this device.");
      } else {
        setStatus("error");
        setError("Could not start camera. Try reloading the page.");
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { videoRef, status, error, requestCamera, stopCamera };
}
