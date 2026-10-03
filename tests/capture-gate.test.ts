import { describe, expect, it } from "vitest";
import {
  canAnalyze,
  canOverride,
  captureFlowReducer as reduce,
  gateAllowsScan,
  initialCaptureFlow,
  runCaptureGate,
  type CaptureFlowAction,
  type CaptureFlowState,
} from "@/lib/capture-quality/gate";
import { CAPTURE_QUALITY_SETTINGS as S, CAPTURE_QUALITY_SETTINGS_VERSION } from "@/lib/capture-quality/settings";
import { checkerboard, flat } from "@/lib/capture-quality/synthetic-frames";
import { CHECK_ORDER } from "@/lib/capture-quality/types";

const MIN = S["resolution.minShortSidePx"].value;
const ctx = { captureMethod: "canvas" as const, retakeCount: 0 };
// Big enough for resolution, mid-grey on average, sharp: passes every pixel check.
const good = () => checkerboard(MIN, MIN, 1, 100, 156);

describe("runCaptureGate", () => {
  it("always returns seven checks in the fixed order; the landmark checks are not_measured", () => {
    for (const frame of [good(), flat(4, 4, 0), null]) {
      const q = runCaptureGate(frame, ctx);
      expect(q.checks.map((c) => c.id)).toEqual([...CHECK_ORDER]);
      expect(CHECK_ORDER).toEqual(["exposure", "blur", "resolution", "distance", "framing", "pose", "expression"]);
      for (const id of ["pose", "expression", "distance", "framing"]) {
        expect(q.checks.find((c) => c.id === id)).toEqual({ id, status: "not_measured", measured: null, retakeReason: null, notMeasuredWhy: "no_landmark_model" });
      }
    }
  });

  it("passes only when exposure was measured and nothing failed", () => {
    const q = runCaptureGate(good(), ctx);
    expect(q.verdict).toBe("pass");
    expect(q.retakeReasons).toEqual([]);
    expect(q.frame).toEqual({ width: MIN, height: MIN });
  });

  it("is unchecked, never pass, when exposure could not be measured", () => {
    expect(runCaptureGate(null, ctx)).toMatchObject({ verdict: "unchecked", retakeReasons: [], frame: { width: 0, height: 0 } });
    const empty = runCaptureGate({ width: 0, height: 0, data: new Uint8ClampedArray(0) }, ctx);
    expect(empty.verdict).toBe("unchecked");
    // The shared frame guard: no check can fail on a frame nobody could measure.
    expect(empty.checks.every((c) => c.status === "not_measured")).toBe(true);
  });

  it("several failures: every reason listed, primary reason by the fixed order", () => {
    const q = runCaptureGate(flat(MIN - 1, MIN - 1, 0), ctx); // dark, flat, small
    expect(q.verdict).toBe("retake");
    expect(q.retakeReasons).toEqual(["too_dark", "blurry", "too_small"]);
    const sharpSmall = runCaptureGate(checkerboard(8, 8, 1, 100, 156), ctx);
    expect(sharpSmall.retakeReasons).toEqual(["too_small"]);
  });

  it("fixed fields, and every fail has a reason while no non-fail has one", () => {
    for (const frame of [good(), flat(MIN, MIN, 255), flat(8, 8, 128), null]) {
      const q = runCaptureGate(frame, { captureMethod: "native", retakeCount: 3 });
      expect(q).toMatchObject({ schemaVersion: 1, producer: "capture-quality-web", producerVersion: "cq-1", assertedBy: "client", captureMethod: "native", retakeCount: 3 });
      expect(q.settingsVersion).toBe(CAPTURE_QUALITY_SETTINGS_VERSION);
      for (const c of q.checks) expect(c.retakeReason !== null).toBe(c.status === "fail");
    }
  });
});

const run = (actions: CaptureFlowAction[], from: CaptureFlowState = initialCaptureFlow) => actions.reduce((s, a) => reduce(s, a), from);
const pass = runCaptureGate(good(), ctx);
const dark = runCaptureGate(flat(MIN, MIN, 0), ctx);
const unchecked = runCaptureGate(null, ctx);
const consented: CaptureFlowAction = { type: "consent", analysis: true, retention: true };

describe("capture flow reducer (O-4 = soft block)", () => {
  it("starts with both consent boxes unchecked and nothing to analyse", () => {
    expect(initialCaptureFlow).toMatchObject({ hasConsented: false, hasRetentionConsent: false, gate: "idle" });
    expect(canAnalyze(run([consented]))).toBe(false);
  });

  it("Analyze is disabled while the gate is pending", () => {
    const s = run([{ type: "captured", photoId: 1 }, consented]);
    expect(s.gate).toBe("pending");
    expect(gateAllowsScan(s)).toBe(false);
    expect(canAnalyze(s)).toBe(false);
  });

  it("a passing photo with consent may be analysed; without consent it may not", () => {
    expect(canAnalyze(run([{ type: "captured", photoId: 1 }, { type: "gateResult", photoId: 1, quality: pass }, consented]))).toBe(true);
    expect(canAnalyze(run([{ type: "captured", photoId: 1 }, { type: "gateResult", photoId: 1, quality: pass }]))).toBe(false);
  });

  it("a retake verdict blocks the scan request", () => {
    const s = run([{ type: "captured", photoId: 1 }, { type: "gateResult", photoId: 1, quality: dark }, consented]);
    expect(gateAllowsScan(s)).toBe(false);
    expect(canAnalyze(s)).toBe(false);
  });

  it("unchecked is allowed and stays unchecked", () => {
    const s = run([{ type: "captured", photoId: 1 }, { type: "gateResult", photoId: 1, quality: unchecked }, consented]);
    expect(canAnalyze(s)).toBe(true);
    expect(s.quality?.verdict).toBe("unchecked");
  });

  it("retake clears both consent booleans and the quality result, and counts the retake", () => {
    const s = run([{ type: "captured", photoId: 1 }, { type: "gateResult", photoId: 1, quality: dark }, consented, { type: "retake" }]);
    expect(s).toMatchObject({ hasConsented: false, hasRetentionConsent: false, quality: null, gate: "idle", photoId: null, retakeCount: 1 });
  });

  it("after a retake, a passing photo unblocks Analyze", () => {
    const s = run([
      { type: "captured", photoId: 1 }, { type: "gateResult", photoId: 1, quality: dark }, { type: "retake" },
      { type: "captured", photoId: 2 }, { type: "gateResult", photoId: 2, quality: pass }, consented,
    ]);
    expect(canAnalyze(s)).toBe(true);
    expect(s.quality?.retakeCount).toBe(1);
  });

  it("ignores a late gate result for a photo that has since been retaken", () => {
    const afterRetake = run([{ type: "captured", photoId: 1 }, { type: "retake" }]);
    expect(reduce(afterRetake, { type: "gateResult", photoId: 1, quality: pass })).toBe(afterRetake);
    const newer = run([{ type: "captured", photoId: 2 }], afterRetake);
    expect(reduce(newer, { type: "gateResult", photoId: 1, quality: pass })).toBe(newer);
  });

  it("override appears only after the set number of retakes and is recorded as override", () => {
    const N = S["gate.retakesBeforeOverride"].value;
    let s = initialCaptureFlow;
    for (let i = 1; i <= N + 1; i++) {
      s = run([{ type: "captured", photoId: i }, { type: "gateResult", photoId: i, quality: dark }], s);
      if (i <= N) {
        expect(canOverride(s)).toBe(false);
        expect(reduce(s, { type: "override" })).toBe(s);
        s = reduce(s, { type: "retake" });
      }
    }
    expect(s.retakeCount).toBe(N);
    expect(canOverride(s)).toBe(true);
    s = run([{ type: "override" }, consented], s);
    expect(s.quality).toMatchObject({ verdict: "override", retakeReasons: ["too_dark", "blurry"], retakeCount: N });
    expect(canAnalyze(s)).toBe(true);
  });

  it("override does nothing for a passing or unchecked photo", () => {
    const N = S["gate.retakesBeforeOverride"].value;
    const base = { ...initialCaptureFlow, retakeCount: N };
    for (const q of [pass, unchecked]) {
      const s = run([{ type: "captured", photoId: 1 }, { type: "gateResult", photoId: 1, quality: q }], base);
      expect(reduce(s, { type: "override" })).toBe(s);
    }
  });
});
