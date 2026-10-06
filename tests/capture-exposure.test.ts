import { describe, expect, it } from "vitest";
import { checkExposure } from "@/lib/capture-quality/exposure";
import { CAPTURE_QUALITY_SETTINGS as S } from "@/lib/capture-quality/settings";
import { flat, withFirstPixels } from "@/lib/capture-quality/synthetic-frames";

const v = (id: keyof typeof S) => S[id].value;
// 100 pixels, so a fraction of the frame is a whole pixel count.
const W = 10, H = 10, N = W * H;
const MID = 128;

describe("exposure check", () => {
  it("passes a mid-grey frame", () => {
    const r = checkExposure(flat(W, H, MID));
    expect(r).toMatchObject({ id: "exposure", status: "pass", retakeReason: null });
    expect(r.measured).toEqual({ clipLowFrac: 0, clipHighFrac: 0, meanLuma: MID });
  });

  it("fails all-black as too_dark and all-white as too_bright", () => {
    expect(checkExposure(flat(W, H, 0))).toMatchObject({ status: "fail", retakeReason: "too_dark" });
    expect(checkExposure(flat(W, H, 255))).toMatchObject({ status: "fail", retakeReason: "too_bright" });
  });

  it("low clip fraction: exactly at the maximum passes, one pixel over fails", () => {
    const at = Math.round(v("exposure.clipLowFracMax") * N);
    expect(checkExposure(withFirstPixels(W, H, at, 0, MID)).status).toBe("pass");
    expect(checkExposure(withFirstPixels(W, H, at + 1, 0, MID))).toMatchObject({ status: "fail", retakeReason: "too_dark" });
  });

  it("high clip fraction: exactly at the maximum passes, one pixel over fails", () => {
    const at = Math.round(v("exposure.clipHighFracMax") * N);
    expect(checkExposure(withFirstPixels(W, H, at, 255, MID)).status).toBe("pass");
    expect(checkExposure(withFirstPixels(W, H, at + 1, 255, MID))).toMatchObject({ status: "fail", retakeReason: "too_bright" });
  });

  it("clip luma thresholds are inclusive", () => {
    const at = Math.round(v("exposure.clipLowFracMax") * N) + 1;
    expect(checkExposure(withFirstPixels(W, H, at, v("exposure.clipLowLuma"), MID)).retakeReason).toBe("too_dark");
    expect(checkExposure(withFirstPixels(W, H, at, v("exposure.clipLowLuma") + 1, MID)).status).toBe("pass");
  });

  it("mean band: both edges pass, one step outside fails", () => {
    expect(checkExposure(flat(W, H, v("exposure.meanLumaMin"))).status).toBe("pass");
    expect(checkExposure(flat(W, H, v("exposure.meanLumaMin") - 1))).toMatchObject({ status: "fail", retakeReason: "too_dark" });
    expect(checkExposure(flat(W, H, v("exposure.meanLumaMax"))).status).toBe("pass");
    expect(checkExposure(flat(W, H, v("exposure.meanLumaMax") + 1))).toMatchObject({ status: "fail", retakeReason: "too_bright" });
  });

  it("half black, half white: a tie is too_dark; the larger clip fraction wins", () => {
    expect(checkExposure(withFirstPixels(W, H, N / 2, 0, 255)).retakeReason).toBe("too_dark");
    expect(checkExposure(withFirstPixels(W, H, 40, 0, 255)).retakeReason).toBe("too_bright");
    expect(checkExposure(withFirstPixels(W, H, 60, 0, 255)).retakeReason).toBe("too_dark");
  });

  it("a zero-size frame, a missing frame or a wrong data length is not_measured, never pass", () => {
    expect(checkExposure({ width: 0, height: 0, data: new Uint8ClampedArray(0) })).toEqual({
      id: "exposure", status: "not_measured", measured: null, retakeReason: null, notMeasuredWhy: "frame_empty",
    });
    expect(checkExposure(null)).toMatchObject({ status: "not_measured", notMeasuredWhy: "decode_failed" });
    expect(checkExposure({ width: 2, height: 2, data: new Uint8ClampedArray(15) })).toMatchObject({ status: "not_measured", notMeasuredWhy: "decode_failed" });
  });

  it("ignores alpha", () => {
    const f = flat(W, H, MID);
    for (let i = 3; i < f.data.length; i += 4) f.data[i] = 0;
    expect(checkExposure(f)).toEqual(checkExposure(flat(W, H, MID)));
  });
});
