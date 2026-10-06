// Every capture-quality threshold, named. ALL are provisional placeholders:
// no real-device data exists yet. The R05 exposure sweep replaces them, as a
// settings-only change plus a new CAPTURE_QUALITY_SETTINGS_VERSION.

export interface QualitySetting {
  id: string;
  value: number;
  unit: string;
  status: "provisional";
  source: string;
}

export const CAPTURE_QUALITY_SETTINGS_VERSION = "cq-settings-0-provisional";

const s = (id: string, value: number, unit: string, source: string): QualitySetting => ({ id, value, unit, status: "provisional", source });

const R05 = "replace after the R05 real-device sweep";

export const CAPTURE_QUALITY_SETTINGS = {
  "exposure.clipLowLuma": s("exposure.clipLowLuma", 10, "8-bit luma",
    `placeholder: near-black, below the shadow floor of a lit face; ${R05}`),
  "exposure.clipHighLuma": s("exposure.clipHighLuma", 245, "8-bit luma",
    `placeholder: near-white; Phase 0 saw highlight clipping break native a* at +1 EV (PHASE_0_RESULTS §3); ${R05}`),
  "exposure.clipLowFracMax": s("exposure.clipLowFracMax", 0.25, "fraction of pixels",
    `placeholder: dark hair and background are allowed, a crushed frame is not; ${R05}`),
  "exposure.clipHighFracMax": s("exposure.clipHighFracMax", 0.1, "fraction of pixels",
    `placeholder: blown highlights corrupt colour fields (PHASE_0_RESULTS §3, +1 EV); ${R05}`),
  "exposure.meanLumaMin": s("exposure.meanLumaMin", 50, "8-bit luma",
    `placeholder: roughly -1 EV below a mid-grey scene; Phase 0 exposure levels were ±0.5 / ±1 EV; ${R05}`),
  "exposure.meanLumaMax": s("exposure.meanLumaMax", 210, "8-bit luma",
    `placeholder: roughly +1 EV above a mid-grey scene; Phase 0 exposure levels were ±0.5 / ±1 EV; ${R05}`),
  "blur.laplacianVarMin.native": s("blur.laplacianVarMin.native", 60, "variance",
    `placeholder for the ~1280 px phone JPEG; a flat or heavily blurred synthetic frame is far below it; ${R05}`),
  "blur.laplacianVarMin.canvas": s("blur.laplacianVarMin.canvas", 30, "variance",
    `placeholder for the webcam canvas frame, which is softer than a phone camera; ${R05}`),
  "resolution.minShortSidePx": s("resolution.minShortSidePx", 360, "px",
    `placeholder: a 640x360 webcam must pass (useCameraStream asks for 1280x720 ideal); the engine itself refuses below 64 px (compose.py MIN_IMAGE_DIMENSION_PX); ${R05}`),
  "gate.retakesBeforeOverride": s("gate.retakesBeforeOverride", 2, "retakes",
    `placeholder (O-4 = soft block): retakes before "Use this photo anyway" appears; ${R05}`),
} as const satisfies Record<string, QualitySetting>;

export type SettingId = keyof typeof CAPTURE_QUALITY_SETTINGS;
export type CaptureQualitySettings = Record<SettingId, QualitySetting>;
