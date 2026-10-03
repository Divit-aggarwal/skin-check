import { frameProblem, lumaOf } from "./luma";
import { CAPTURE_QUALITY_SETTINGS, type CaptureQualitySettings } from "./settings";
import { notMeasured, type CheckResult, type Frame } from "./types";

/**
 * Exposure: fraction of crushed-black and blown-white pixels, and mean luma.
 * Built first: Phase 0 found exposure the dominant risk (0.5 EV moves native
 * L* by 5.9-9.0). Passing means "not obviously broken", never "comparable".
 */
export function checkExposure(frame: Frame | null, settings: CaptureQualitySettings = CAPTURE_QUALITY_SETTINGS): CheckResult {
  const problem = frameProblem(frame);
  if (problem) return notMeasured("exposure", problem);
  const luma = lumaOf(frame!);
  const lowLuma = settings["exposure.clipLowLuma"].value;
  const highLuma = settings["exposure.clipHighLuma"].value;
  let low = 0;
  let high = 0;
  let sum = 0;
  for (let i = 0; i < luma.length; i++) {
    const v = luma[i]!;
    if (v <= lowLuma) low++;
    if (v >= highLuma) high++;
    sum += v;
  }
  const clipLowFrac = low / luma.length;
  const clipHighFrac = high / luma.length;
  const meanLuma = sum / luma.length;
  const dark = clipLowFrac > settings["exposure.clipLowFracMax"].value || meanLuma < settings["exposure.meanLumaMin"].value;
  const bright = clipHighFrac > settings["exposure.clipHighFracMax"].value || meanLuma > settings["exposure.meanLumaMax"].value;
  // Both: the larger clip fraction names it; a tie goes to too_dark.
  const retakeReason = dark && bright ? (clipHighFrac > clipLowFrac ? "too_bright" : "too_dark") : dark ? "too_dark" : bright ? "too_bright" : null;
  return {
    id: "exposure",
    status: retakeReason ? "fail" : "pass",
    measured: { clipLowFrac, clipHighFrac, meanLuma },
    retakeReason,
  };
}
