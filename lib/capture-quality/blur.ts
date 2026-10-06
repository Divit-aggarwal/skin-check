import type { CaptureMethod } from "@/types/skin-scan";
import { frameProblem, lumaOf } from "./luma";
import { CAPTURE_QUALITY_SETTINGS, type CaptureQualitySettings } from "./settings";
import { notMeasured, type CheckResult, type Frame } from "./types";

/**
 * Sharpness: variance of the 3x3 Laplacian [0 1 0; 1 -4 1; 0 1 0] on luma,
 * over interior pixels. Scale depends on image size, so each capture path
 * has its own minimum.
 */
export function checkBlur(frame: Frame | null, captureMethod: CaptureMethod, settings: CaptureQualitySettings = CAPTURE_QUALITY_SETTINGS): CheckResult {
  const problem = frameProblem(frame);
  if (problem) return notMeasured("blur", problem);
  const { width, height } = frame!;
  if (width < 3 || height < 3) return notMeasured("blur", "frame_empty");
  const l = lumaOf(frame!);
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const lap = l[i - 1]! + l[i + 1]! + l[i - width]! + l[i + width]! - 4 * l[i]!;
      n++;
      sum += lap;
      sumSq += lap * lap;
    }
  }
  const mean = sum / n;
  const laplacianVar = Math.max(0, sumSq / n - mean * mean);
  const min = settings[captureMethod === "native" ? "blur.laplacianVarMin.native" : "blur.laplacianVarMin.canvas"].value;
  const fail = laplacianVar < min;
  return { id: "blur", status: fail ? "fail" : "pass", measured: { laplacianVar }, retakeReason: fail ? "blurry" : null };
}
