import { describe, expect, it } from "vitest";
import { checkBlur } from "@/lib/capture-quality/blur";
import { CAPTURE_QUALITY_SETTINGS as S, type CaptureQualitySettings } from "@/lib/capture-quality/settings";
import { boxBlur, checkerboard, flat } from "@/lib/capture-quality/synthetic-frames";

const withMin = (id: "blur.laplacianVarMin.native" | "blur.laplacianVarMin.canvas", value: number): CaptureQualitySettings =>
  ({ ...S, [id]: { ...S[id], value } });

describe("blur check", () => {
  it("passes a checkerboard on both paths", () => {
    expect(checkBlur(checkerboard(32, 32), "native")).toMatchObject({ id: "blur", status: "pass", retakeReason: null });
    expect(checkBlur(checkerboard(32, 32), "canvas").status).toBe("pass");
  });

  it("fails a flat frame and a blurred checkerboard as blurry", () => {
    expect(checkBlur(flat(32, 32, 128), "native")).toMatchObject({ status: "fail", retakeReason: "blurry", measured: { laplacianVar: 0 } });
    const sharp = checkerboard(32, 32, 4, 120, 136);
    expect(checkBlur(sharp, "native").status).toBe("pass");
    expect(checkBlur(boxBlur(sharp, 4), "native")).toMatchObject({ status: "fail", retakeReason: "blurry" });
  });

  // Low-contrast 2 px checkerboard (amplitude 4): Laplacian variance is exactly 64.
  const known = checkerboard(32, 32, 2, 128, 132);
  it.each(["native", "canvas"] as const)("boundary for %s: at the minimum passes, below fails", (method) => {
    const id = method === "native" ? "blur.laplacianVarMin.native" : "blur.laplacianVarMin.canvas";
    expect(checkBlur(known, method).measured).toEqual({ laplacianVar: 64 });
    expect(checkBlur(known, method, withMin(id, 64)).status).toBe("pass");
    expect(checkBlur(known, method, withMin(id, 64.001)).status).toBe("fail");
  });

  it("uses the per-path setting: the same frame passes canvas and fails native", () => {
    const f = checkerboard(32, 32, 2, 128, 131); // variance 36
    const v = checkBlur(f, "native").measured!.laplacianVar!;
    expect(v).toBeGreaterThanOrEqual(S["blur.laplacianVarMin.canvas"].value);
    expect(v).toBeLessThan(S["blur.laplacianVarMin.native"].value);
    expect(checkBlur(f, "canvas").status).toBe("pass");
    expect(checkBlur(f, "native").status).toBe("fail");
  });

  it("a frame smaller than 3x3 is not_measured", () => {
    expect(checkBlur(flat(2, 5, 128), "native")).toMatchObject({ status: "not_measured", measured: null, retakeReason: null });
    expect(checkBlur(null, "canvas")).toMatchObject({ status: "not_measured", notMeasuredWhy: "decode_failed" });
  });
});
