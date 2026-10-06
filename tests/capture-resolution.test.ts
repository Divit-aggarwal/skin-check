import { describe, expect, it } from "vitest";
import { checkResolution } from "@/lib/capture-quality/resolution";
import { CAPTURE_QUALITY_SETTINGS as S } from "@/lib/capture-quality/settings";
import { flat } from "@/lib/capture-quality/synthetic-frames";

const MIN = S["resolution.minShortSidePx"].value;

describe("resolution check", () => {
  it("a short side at the minimum passes, one pixel below fails", () => {
    expect(checkResolution(flat(MIN + 10, MIN, 128))).toMatchObject({ status: "pass", measured: { shortSide: MIN } });
    expect(checkResolution(flat(MIN, MIN + 10, 128)).status).toBe("pass");
    expect(checkResolution(flat(MIN + 10, MIN - 1, 128))).toMatchObject({ status: "fail", retakeReason: "too_small" });
  });

  it("the usual capture sizes pass", () => {
    for (const [w, h] of [[1280, 720], [640, 360], [960, 1280]] as const) {
      expect(checkResolution({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }).status).toBe("pass");
    }
  });

  it("an empty frame is not_measured, never fail or pass", () => {
    expect(checkResolution({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toMatchObject({ status: "not_measured", notMeasuredWhy: "frame_empty" });
  });
});
