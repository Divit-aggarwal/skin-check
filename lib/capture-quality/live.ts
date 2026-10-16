// C11 live checks (screen 07): pure maths over one video frame's face
// landmarks (MediaPipe face landmarker, x and y normalised to the frame,
// 0..1) and the exposure check on a small copy of the same frame. No DOM.
// Every threshold is a named, provisional setting (settings.ts "live.*").
// Like the rest of the gate this is client-asserted guidance, never a
// comparability input.

import type { CaptureAngle, LiveCheckId, LiveChecks, LiveCheckState } from "@/lib/feature-contracts/check-photos";
import { MIN_POINTS } from "@/lib/face-mesh/regions";
import { CAPTURE_QUALITY_SETTINGS, type CaptureQualitySettings } from "./settings";
import { notMeasured, type CheckResult } from "./types";

export interface LandmarkPt {
  x: number;
  y: number;
}

/**
 * Landmark ids in the MediaPipe face mesh: the nose tip and the two outer
 * cheek edges. EDGE_A sits on the subject's right side, EDGE_B on their left.
 */
const NOSE = 1;
const EDGE_A = 234;
const EDGE_B = 454;

export interface FaceMeasure {
  /** Share of landmarks inside the frame. */
  visibleFrac: number;
  centreX: number;
  centreY: number;
  /** Face-box width as a share of the frame width. */
  widthFrac: number;
  /**
   * Head turn: where the nose tip sits between the two cheek edges, minus
   * the middle (-0.5..0.5). 0 is facing the camera. Negative: the nose has
   * moved toward EDGE_A, so the subject's LEFT cheek (EDGE_B side) faces the
   * camera. Positive: the right cheek. Mirroring the image does not change it.
   */
  yaw: number;
}

/** null when no face (or too few landmarks) was found. */
export function measureFace(points: readonly LandmarkPt[] | null | undefined): FaceMeasure | null {
  if (!points || points.length < MIN_POINTS) return null;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, inside = 0;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
    if (p.x >= 0 && p.x <= 1 && p.y >= 0 && p.y <= 1) inside++;
  }
  const a = points[EDGE_A]!.x;
  const span = points[EDGE_B]!.x - a;
  const yaw = span === 0 ? 0 : (points[NOSE]!.x - a) / span - 0.5;
  return { visibleFrac: inside / points.length, centreX: (minX + maxX) / 2, centreY: (minY + maxY) / 2, widthFrac: maxX - minX, yaw };
}

type S = CaptureQualitySettings;
const v = (settings: S, id: keyof S) => settings[id].value;

const centred = (f: FaceMeasure, settings: S) => {
  const max = v(settings, "live.centreMaxOffset");
  return Math.abs(f.centreX - 0.5) <= max && Math.abs(f.centreY - 0.5) <= max;
};

/** "ok", or which way to turn: toward the asked-for side, or back toward the camera. */
export function poseFor(angle: CaptureAngle, yaw: number, settings: S = CAPTURE_QUALITY_SETTINGS): "ok" | "face_camera" | "turn_more" | "turn_less" {
  if (angle === "front") return Math.abs(yaw) <= v(settings, "live.frontYawMax") ? "ok" : "face_camera";
  // The left cheek shows when yaw is negative (see FaceMeasure.yaw).
  const turned = angle === "left" ? -yaw : yaw;
  if (turned < v(settings, "live.sideYawMin")) return "turn_more";
  if (turned > v(settings, "live.sideYawMax")) return "turn_less";
  return "ok";
}

const distanceFor = (f: FaceMeasure, settings: S): "ok" | "closer" | "back" =>
  f.widthFrac < v(settings, "live.widthMinFrac") ? "closer" : f.widthFrac > v(settings, "live.widthMaxFrac") ? "back" : "ok";

/** Instructions only: no score, no number. */
export const LIVE_COPY = {
  labels: { lighting: "Lighting", position: "Position", distance: "Distance", face_clear: "Face in view" } satisfies Record<LiveCheckId, string>,
  states: { ok: "Good", adjust: "Adjust", unknown: "Checking" } satisfies Record<LiveCheckState, string>,
  goodLight: "Good lighting",
  hints: {
    too_dark: "Find more light, facing a window or lamp.",
    too_bright: "Move out of direct light.",
    no_face: "Keep your whole face in the frame.",
    closer: "Move a little closer.",
    back: "Move a little further away.",
    centre: "Move your face to the middle of the frame.",
    face_camera: "Look straight at the camera.",
    turn_left: "Turn your head to show your left cheek.",
    turn_right: "Turn your head to show your right cheek.",
    turn_less: "Turn back a little toward the camera.",
  },
  ready: "Hold still, then take the photo.",
} as const;

/**
 * The four live checks and one hint for the first that is not ok. `exposure`
 * is checkExposure on a small copy of the frame (null before the first frame).
 */
export function liveChecks(angle: CaptureAngle, face: FaceMeasure | null, exposure: CheckResult | null, settings: S = CAPTURE_QUALITY_SETTINGS): LiveChecks {
  const H = LIVE_COPY.hints;
  const lighting: LiveCheckState = !exposure || exposure.status === "not_measured" ? "unknown" : exposure.status === "pass" ? "ok" : "adjust";
  const lightHint = lighting === "adjust" ? (exposure!.retakeReason === "too_bright" ? H.too_bright : H.too_dark) : null;
  if (!face) {
    return { angle, checks: { lighting, position: "unknown", distance: "unknown", face_clear: "adjust" }, hint: lightHint ?? H.no_face, ready: false };
  }
  const clear = face.visibleFrac >= v(settings, "live.visibleFracMin");
  const dist = distanceFor(face, settings);
  const pose = poseFor(angle, face.yaw, settings);
  const isCentred = centred(face, settings);
  const checks: LiveChecks["checks"] = {
    lighting,
    position: isCentred && pose === "ok" ? "ok" : "adjust",
    distance: dist === "ok" ? "ok" : "adjust",
    face_clear: clear ? "ok" : "adjust",
  };
  const poseHint = pose === "ok" ? null : pose === "turn_more" ? (angle === "left" ? H.turn_left : H.turn_right) : H[pose];
  const hint = lightHint ?? (!clear ? H.no_face : dist !== "ok" ? H[dist] : !isCentred ? H.centre : poseHint);
  return { angle, checks, hint, ready: Object.values(checks).every((c) => c === "ok") };
}

/**
 * The front photo's distance, framing and pose for the capture gate, from the
 * last live frame before the shutter (C11: measured instead of not_measured).
 * No face in that frame: framing fails, the other two cannot be measured.
 */
export function liveGateChecks(face: FaceMeasure | null, settings: S = CAPTURE_QUALITY_SETTINGS): Record<"distance" | "framing" | "pose", CheckResult> {
  if (!face) {
    return {
      distance: notMeasured("distance", "no_landmark_model"),
      framing: { id: "framing", status: "fail", measured: { visibleFrac: 0 }, retakeReason: "face_not_centred" },
      pose: notMeasured("pose", "no_landmark_model"),
    };
  }
  const distOk = distanceFor(face, settings) === "ok";
  const frameOk = centred(face, settings) && face.visibleFrac >= v(settings, "live.visibleFracMin");
  const poseOk = poseFor("front", face.yaw, settings) === "ok";
  return {
    distance: { id: "distance", status: distOk ? "pass" : "fail", measured: { widthFrac: face.widthFrac }, retakeReason: distOk ? null : "too_far_or_close" },
    framing: { id: "framing", status: frameOk ? "pass" : "fail", measured: { centreX: face.centreX, centreY: face.centreY, visibleFrac: face.visibleFrac }, retakeReason: frameOk ? null : "face_not_centred" },
    pose: { id: "pose", status: poseOk ? "pass" : "fail", measured: { yaw: face.yaw }, retakeReason: poseOk ? null : "face_turned" },
  };
}
