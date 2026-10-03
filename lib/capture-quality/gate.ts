import type { CaptureMethod } from "@/types/skin-scan";
import { checkBlur } from "./blur";
import { checkExposure } from "./exposure";
import { checkResolution } from "./resolution";
import { CAPTURE_QUALITY_SETTINGS, CAPTURE_QUALITY_SETTINGS_VERSION, type CaptureQualitySettings } from "./settings";
import { CHECK_ORDER, notMeasured, type CaptureQuality, type CheckResult, type Frame } from "./types";

/**
 * Runs every check on the exact image the engine will receive. `frame` is
 * null when the image would not decode. Pose, expression, distance and
 * framing need a landmark model (O-3 = C: none), so they are not_measured.
 */
export function runCaptureGate(
  frame: Frame | null,
  ctx: { captureMethod: CaptureMethod; retakeCount: number },
  settings: CaptureQualitySettings = CAPTURE_QUALITY_SETTINGS
): CaptureQuality {
  const byId: Record<string, CheckResult> = {
    exposure: checkExposure(frame, settings),
    blur: checkBlur(frame, ctx.captureMethod, settings),
    resolution: checkResolution(frame, settings),
  };
  const checks = CHECK_ORDER.map((id) => byId[id] ?? notMeasured(id, "no_landmark_model"));
  const retakeReasons = checks.flatMap((c) => (c.status === "fail" && c.retakeReason ? [c.retakeReason] : []));
  // Exposure is the one required check: unmeasured means unchecked, never pass.
  const verdict = byId.exposure!.status === "not_measured" ? "unchecked" : retakeReasons.length ? "retake" : "pass";
  return {
    schemaVersion: 1,
    producer: "capture-quality-web",
    producerVersion: "cq-1",
    settingsVersion: CAPTURE_QUALITY_SETTINGS_VERSION,
    assertedBy: "client",
    captureMethod: ctx.captureMethod,
    frame: { width: frame?.width ?? 0, height: frame?.height ?? 0 },
    checks,
    verdict,
    retakeReasons: verdict === "retake" ? retakeReasons : [],
    retakeCount: ctx.retakeCount,
  };
}

// ── The capture step's retake loop, as a pure reducer (PhotoCapture uses it) ──
// Consent lives here too so a retake clears it in the same transition as the
// photo and its gate result: both boxes start unchecked, every retake clears
// both, and neither is ever written to the draft (unchanged behaviour).

export interface CaptureFlowState {
  /** The photo the gate is running on; null when there is none. Late results for any other id are ignored. */
  photoId: number | null;
  gate: "idle" | "pending" | "done";
  quality: CaptureQuality | null;
  retakeCount: number;
  hasConsented: boolean;
  hasRetentionConsent: boolean;
}

export type CaptureFlowAction =
  | { type: "captured"; photoId: number }
  | { type: "gateResult"; photoId: number; quality: CaptureQuality }
  | { type: "retake" }
  | { type: "override" }
  | { type: "consent"; analysis?: boolean; retention?: boolean };

export const initialCaptureFlow: CaptureFlowState = {
  photoId: null, gate: "idle", quality: null, retakeCount: 0, hasConsented: false, hasRetentionConsent: false,
};

export function canOverride(s: CaptureFlowState, settings: CaptureQualitySettings = CAPTURE_QUALITY_SETTINGS): boolean {
  return s.gate === "done" && s.quality?.verdict === "retake" && s.retakeCount >= settings["gate.retakesBeforeOverride"].value;
}

/** O-4 = soft block: pass, unchecked and override may be analysed; retake and pending may not. */
export function gateAllowsScan(s: CaptureFlowState): boolean {
  const v = s.gate === "done" ? s.quality?.verdict : undefined;
  return v === "pass" || v === "unchecked" || v === "override";
}

export const canAnalyze = (s: CaptureFlowState) => s.hasConsented && gateAllowsScan(s);

export function captureFlowReducer(s: CaptureFlowState, a: CaptureFlowAction, settings: CaptureQualitySettings = CAPTURE_QUALITY_SETTINGS): CaptureFlowState {
  switch (a.type) {
    case "captured":
      return { ...s, photoId: a.photoId, gate: "pending", quality: null };
    case "gateResult":
      if (a.photoId !== s.photoId || s.gate !== "pending") return s;
      return { ...s, gate: "done", quality: { ...a.quality, retakeCount: s.retakeCount } };
    case "retake":
      return { ...s, photoId: null, gate: "idle", quality: null, retakeCount: s.retakeCount + 1, hasConsented: false, hasRetentionConsent: false };
    case "override":
      return canOverride(s, settings) ? { ...s, quality: { ...s.quality!, verdict: "override" } } : s;
    case "consent":
      return {
        ...s,
        hasConsented: a.analysis ?? s.hasConsented,
        hasRetentionConsent: a.retention ?? s.hasRetentionConsent,
      };
  }
}
