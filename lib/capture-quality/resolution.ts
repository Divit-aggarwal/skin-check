import { frameProblem } from "./luma";
import { CAPTURE_QUALITY_SETTINGS, type CaptureQualitySettings } from "./settings";
import { notMeasured, type CheckResult, type Frame } from "./types";

/** Short side of the exact image the engine will receive. */
export function checkResolution(frame: Frame | null, settings: CaptureQualitySettings = CAPTURE_QUALITY_SETTINGS): CheckResult {
  const problem = frameProblem(frame);
  if (problem) return notMeasured("resolution", problem);
  const { width, height } = frame!;
  const shortSide = Math.min(width, height);
  const fail = shortSide < settings["resolution.minShortSidePx"].value;
  return { id: "resolution", status: fail ? "fail" : "pass", measured: { width, height, shortSide }, retakeReason: fail ? "too_small" : null };
}
