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

// 1: adds the live checks (C11, "live.*"); exposure, blur and resolution values are unchanged.
export const CAPTURE_QUALITY_SETTINGS_VERSION = "cq-settings-1-provisional";

const s = (id: string, value: number, unit: string, source: string): QualitySetting => ({ id, value, unit, status: "provisional", source });

const R05 = "replace after the R05 real-device sweep";
const C09 = "calibration knob for the live checks; replace after C09 real-device calibration";

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
  // C11 live checks on the camera stream (face landmarks, normalised to the frame: 0..1).
  "live.fps": s("live.fps", 5, "frames per second",
    `placeholder: often enough to feel live, light on a low-cost phone; ${C09}`),
  "live.visibleFracMin": s("live.visibleFracMin", 0.97, "fraction of landmarks",
    `placeholder: share of the 478 landmarks inside the frame for the "face in view" check; ${C09}`),
  "live.centreMaxOffset": s("live.centreMaxOffset", 0.12, "fraction of frame",
    `placeholder: face-box centre within this distance of the frame centre, both axes; ${C09}`),
  "live.widthMinFrac": s("live.widthMinFrac", 0.35, "fraction of frame width",
    `placeholder: face-box width below this is too far; ${C09}`),
  "live.widthMaxFrac": s("live.widthMaxFrac", 0.8, "fraction of frame width",
    `placeholder: face-box width above this is too close; ${C09}`),
  "live.frontYawMax": s("live.frontYawMax", 0.1, "nose offset (-0.5..0.5)",
    `placeholder: front photo, nose this close to the middle of the face; ${C09}`),
  "live.sideYawMin": s("live.sideYawMin", 0.15, "nose offset (-0.5..0.5)",
    `placeholder: a cheek photo needs the head turned at least this far; ${C09}`),
  "live.sideYawMax": s("live.sideYawMax", 0.4, "nose offset (-0.5..0.5)",
    `placeholder: turned further than this, the far edge of the face is lost; ${C09}`),
} as const satisfies Record<string, QualitySetting>;

export type SettingId = keyof typeof CAPTURE_QUALITY_SETTINGS;
export type CaptureQualitySettings = Record<SettingId, QualitySetting>;
