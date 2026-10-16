import { describe, expect, it } from "vitest";
import { liveChecks, liveGateChecks, measureFace, poseFor, LIVE_COPY, type LandmarkPt } from "@/lib/capture-quality/live";
import { runCaptureGate } from "@/lib/capture-quality/gate";
import { CaptureQualitySchema } from "@/lib/capture-quality/schema";
import { CAPTURE_QUALITY_SETTINGS as S } from "@/lib/capture-quality/settings";
import { bannedWordsIn } from "@/lib/catalog/wording";
import type { CheckResult } from "@/lib/capture-quality/types";

// C11 (screen 07): the live checks as pure maths over synthetic landmark sets.

/** 478 points spread over a face box; nose (1) and cheek edges (234 left of image, 454 right) placed for a given turn. */
function face({ cx = 0.5, cy = 0.5, w = 0.5, h = 0.6, yaw = 0, n = 478 }: { cx?: number; cy?: number; w?: number; h?: number; yaw?: number; n?: number } = {}): LandmarkPt[] {
  const pts: LandmarkPt[] = Array.from({ length: n }, (_, i) => ({ x: cx - w / 2 + (w * (i % 20)) / 19, y: cy - h / 2 + (h * Math.floor(i / 20)) / 23 }));
  if (n > 454) {
    pts[234] = { x: cx - w / 2, y: cy };
    pts[454] = { x: cx + w / 2, y: cy };
    pts[1] = { x: cx + yaw * w, y: cy };
  }
  return pts;
}
const lit: CheckResult = { id: "exposure", status: "pass", measured: { meanLuma: 120, clipLowFrac: 0, clipHighFrac: 0 }, retakeReason: null };
const dark: CheckResult = { id: "exposure", status: "fail", measured: { meanLuma: 20, clipLowFrac: 0.5, clipHighFrac: 0 }, retakeReason: "too_dark" };

describe("measureFace", () => {
  it("is null with no face or too few landmarks", () => {
    expect(measureFace(null)).toBeNull();
    expect(measureFace(face({ n: 100 }))).toBeNull();
  });
  it("measures the box, centre, visible share and turn", () => {
    const m = measureFace(face({ cx: 0.4, w: 0.5, yaw: -0.2 }))!;
    expect(m.widthFrac).toBeCloseTo(0.5);
    expect(m.centreX).toBeCloseTo(0.4);
    expect(m.visibleFrac).toBe(1);
    expect(m.yaw).toBeCloseTo(-0.2);
  });
  it("the turn does not change when the image is mirrored", () => {
    const pts = face({ yaw: -0.25 });
    expect(measureFace(pts.map((p) => ({ x: 1 - p.x, y: p.y })))!.yaw).toBeCloseTo(-0.25);
  });
  it("points outside the frame lower the visible share", () => {
    expect(measureFace(face({ cx: 0.1 }))!.visibleFrac).toBeLessThan(S["live.visibleFracMin"].value);
  });
});

describe("poseFor: which way is which", () => {
  it("front wants the nose in the middle", () => {
    expect(poseFor("front", 0)).toBe("ok");
    expect(poseFor("front", 0.3)).toBe("face_camera");
  });
  it("left cheek: the nose moved toward landmark 234 (negative turn)", () => {
    expect(poseFor("left", -0.25)).toBe("ok");
    expect(poseFor("left", 0.25)).toBe("turn_more");
    expect(poseFor("left", -0.05)).toBe("turn_more");
    expect(poseFor("left", -0.48)).toBe("turn_less");
  });
  it("right cheek is the mirror of left", () => {
    expect(poseFor("right", 0.25)).toBe("ok");
    expect(poseFor("right", -0.25)).toBe("turn_more");
  });
});

describe("liveChecks", () => {
  it("all ok: ready, no hint", () => {
    const c = liveChecks("front", measureFace(face()), lit);
    expect(c).toEqual({ angle: "front", checks: { lighting: "ok", position: "ok", distance: "ok", face_clear: "ok" }, hint: null, ready: true });
  });
  it("no face: face clear needs adjusting, position and distance unknown", () => {
    const c = liveChecks("front", null, lit);
    expect(c.checks).toEqual({ lighting: "ok", position: "unknown", distance: "unknown", face_clear: "adjust" });
    expect(c.hint).toBe(LIVE_COPY.hints.no_face);
    expect(c.ready).toBe(false);
  });
  it("before the first frame the light is unknown and it is not ready", () => {
    expect(liveChecks("front", measureFace(face()), null).checks.lighting).toBe("unknown");
    expect(liveChecks("front", measureFace(face()), null).ready).toBe(false);
  });
  it("light comes first in the hint", () => {
    const c = liveChecks("front", measureFace(face({ w: 0.2 })), dark);
    expect(c.checks.lighting).toBe("adjust");
    expect(c.hint).toBe(LIVE_COPY.hints.too_dark);
  });
  it("distance: too small is closer, too wide is back", () => {
    expect(liveChecks("front", measureFace(face({ w: 0.2 })), lit).hint).toBe(LIVE_COPY.hints.closer);
    expect(liveChecks("front", measureFace(face({ w: 0.9, h: 0.9 })), lit).hint).toBe(LIVE_COPY.hints.back);
  });
  it("position: off centre, then the turn for the angle", () => {
    expect(liveChecks("front", measureFace(face({ cx: 0.68, w: 0.5 })), lit).hint).toBe(LIVE_COPY.hints.centre);
    expect(liveChecks("left", measureFace(face()), lit).hint).toBe(LIVE_COPY.hints.turn_left);
    expect(liveChecks("right", measureFace(face()), lit).hint).toBe(LIVE_COPY.hints.turn_right);
    expect(liveChecks("left", measureFace(face({ yaw: -0.25 })), lit).ready).toBe(true);
  });
  it("every live sentence passes the word check", () => {
    const all = [...Object.values(LIVE_COPY.hints), ...Object.values(LIVE_COPY.labels), ...Object.values(LIVE_COPY.states), LIVE_COPY.goodLight, LIVE_COPY.ready];
    for (const s of all) expect(bannedWordsIn(s), s).toEqual([]);
  });
});

describe("the gate with live checks (front photo)", () => {
  // A sharp mid-grey checkerboard: passes light, sharpness and size, so only the live checks decide.
  const frame = (luma: number, size = 800) => {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < size * size; i++) data.fill(((i % size) + Math.floor(i / size)) % 2 ? luma + 40 : luma - 40, i * 4, i * 4 + 4);
    return { width: size, height: size, data };
  };
  const ctx = { captureMethod: "canvas" as const, retakeCount: 0 };

  it("without live checks the result is exactly today's", () => {
    const today = runCaptureGate(frame(128), ctx);
    expect(today.checks.filter((c) => ["distance", "framing", "pose"].includes(c.id)).every((c) => c.status === "not_measured")).toBe(true);
    expect(runCaptureGate(frame(128), ctx, S, undefined)).toEqual(today);
  });

  it("records distance, framing and pose as measured; expression stays not measured; the server schema accepts it", () => {
    const q = runCaptureGate(frame(128), ctx, S, liveGateChecks(measureFace(face())));
    const by = Object.fromEntries(q.checks.map((c) => [c.id, c]));
    expect(by.distance!.status).toBe("pass");
    expect(by.framing!.status).toBe("pass");
    expect(by.pose!.status).toBe("pass");
    expect(by.expression!.status).toBe("not_measured");
    expect(CaptureQualitySchema.safeParse(q).success).toBe(true);
  });

  it("a turned, far face is a retake with reasons in check order, and the schema accepts it", () => {
    const q = runCaptureGate(frame(128), ctx, S, liveGateChecks(measureFace(face({ w: 0.2, yaw: 0.3 }))));
    expect(q.verdict).toBe("retake");
    expect(q.retakeReasons).toEqual(["too_far_or_close", "face_turned"]);
    expect(CaptureQualitySchema.safeParse(q).success).toBe(true);
  });

  it("no face at the shutter: framing fails, distance and pose are not measured", () => {
    const q = runCaptureGate(frame(128), ctx, S, liveGateChecks(null));
    expect(q.retakeReasons).toEqual(["face_not_centred"]);
    expect(CaptureQualitySchema.safeParse(q).success).toBe(true);
  });
});
