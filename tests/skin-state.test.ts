import { describe, expect, it } from "vitest";
import { toSkinState, type SkinState } from "@/lib/skin-state";

// ALL values are synthetic and deliberately round (contract §11). Nothing here
// comes from a real photo or from skin-scan/fixtures/scan-response.json.

const REF = "users/SYNTH_UID/scanAnalyses/SYNTHSCAN01_aaaaaaaaaaaaaaaa";
const A_EDGES = Array.from({ length: 21 }, (_, i) => -10 + i * 1.5);
const CV_EDGES = Array.from({ length: 21 }, (_, i) => i * 5);
const COUNTS = Array.from({ length: 20 }, () => 10);
const CLIP = { underflow: 0, overflow: 0, min: -5, max: 12 };

function regionRaw(px: number) {
  return {
    region_px: px, lab_a_mean: 2, lab_a_p90: 6, lab_a_std: 3, lab_b_mean_decoded: 10, lab_b_mean: 138,
    lab_l_mean: 50, lab_l_std_decoded: 15, lab_l_std: 38, lap_var_mean: 200, lbp_entropy: 2.5, grad_raw: 2000,
    specular_frac: 0.1, blemish_pixel_frac: 0.1, blemish_blob_count: 5, lab_a_p70_value: 4, color_var_p60_value: 2,
    smoothness_raw: 0.1, evenness_raw: 0.3, pore_count: 0, pore_density: 0, pore_density_per_kpx: 0,
  };
}
const regionHist = () => ({ lab_a_hist: COUNTS, lab_a_hist_clip: CLIP, color_var_hist: COUNTS, color_var_hist_clip: CLIP });

/** Shaped exactly like a gate-01 `scanAnalyses` record today: corrected path only, aliases present. */
function productionRecord(): Record<string, unknown> {
  const regions = ["forehead", "nose", "chin", "cheeks"];
  const raw = Object.fromEntries(regions.map((r) => [r, regionRaw(30000)]));
  const hist = Object.fromEntries(regions.map((r) => [r, regionHist()]));
  const edges = { lab_a_hist: A_EDGES, color_var_hist: CV_EDGES };
  return {
    schemaVersion: 1, source: "server", scanId: "SYNTHSCAN01", inputSha256: "a".repeat(64), requestId: "synth-req-1",
    createdAt: new Date("2026-10-10T10:00:00Z"),
    scores: { redness: 0.5, oiliness: 0.5, texture: 0.5, pores: 0, blemishes: 0.5, hydration: 0.5, pigment: 0.5 },
    region_scores: {}, regions, score_types: { redness: "image_relative" },
    region_low_confidence: { forehead: false, nose: false, chin: false, cheeks: false },
    pipeline_version: "scan-0.1.5-provisional",
    region_raw: raw, region_raw_corrected: raw, region_hist: hist, region_hist_corrected: hist,
    region_hist_bin_edges: edges, region_hist_bin_edges_corrected: edges,
    region_raw_native: null, region_hist_native: null, region_hist_bin_edges_native: null,
  };
}

function ok(result: ReturnType<typeof toSkinState>): SkinState {
  if (result.kind !== "skinstate") throw new Error(`expected skinstate, got ${JSON.stringify(result)}`);
  return result.state;
}

const availableRegion = (px: number) => ({
  status: "available",
  pixelCount: px,
  colour: {
    corrected: {
      aStarMean: 2, aStarP90: 6, aStarSd: 3, bStarMean: 10, lStarMeanPostClahe: 50, lStarSdPostClahe: 15,
      aStarHist: { edges: A_EDGES, counts: COUNTS }, aStarHistClip: CLIP,
    },
    native: null,
  },
  texture: {
    laplacianVarMean: 200, lbpEntropy: 2.5, gradientMean: 2000,
    localLContrastHist: { edges: CV_EDGES, counts: COUNTS }, localLContrastHistClip: CLIP,
  },
  specular: { fraction: 0.1 },
});

describe("skinstate-1: complete / current production scan", () => {
  it("matches the frozen contract exactly (§3–§8, example 11.1 shape)", () => {
    const state = ok(toSkinState(productionRecord(), REF));
    expect(state).toEqual({
      contractVersion: "skinstate-1",
      identity: { analysisRef: REF, scanId: "SYNTHSCAN01" },
      provenance: {
        source: "server", recordSchemaVersion: 1, requestId: "synth-req-1", persistAttempt: "primary",
        analyzedAt: "2026-10-10T10:00:00.000Z", capturedAt: null, processingConsentVersion: null,
      },
      engine: {
        pipelineVersion: "scan-0.1.5-provisional", build: null, landmarkModel: "mediapipe-0.10.21-face_mesh",
        opencvVersion: "4.11.0", statsPath: "corrected", scoreTypes: { redness: "image_relative" },
      },
      input: { variant: "cv_downscale_1280", analysedImageSha256: "a".repeat(64), captureMethod: null, originalRef: null },
      regions: {
        forehead: availableRegion(30000), nose: availableRegion(30000),
        chin: availableRegion(30000), cheeks: availableRegion(30000),
      },
      uncertainty: { policy: "unknown", calibrationId: null, fields: { "*": { status: "unknown" } } },
      quality: {
        lowPixelCount: { forehead: false, nose: false, chin: false, cheeks: false },
        blur: null, exposure: null, pose: null, faceScale: null, occlusion: null, device: null,
      },
      deprecatedSourceFields: [
        "scores", "region_scores", "region_raw", "region_hist", "region_hist_bin_edges",
        "blemish_pixel_frac", "blemish_blob_count", "lab_a_p70_value", "color_var_p60_value",
        "smoothness_raw", "evenness_raw", "pore_count", "pore_density", "pore_density_per_kpx",
        "lab_l_std", "lab_b_mean",
      ],
    });
  });

  it("is deterministic and does not mutate its input", () => {
    const record = productionRecord();
    const before = JSON.stringify(record);
    const a = JSON.stringify(toSkinState(record, REF));
    const b = JSON.stringify(toSkinState(record, REF));
    expect(a).toBe(b);
    expect(JSON.stringify(record)).toBe(before);
  });

  it("never turns proxies into measurements: no score/band/skin-concept keys or score values in the output", () => {
    const record = productionRecord();
    record.scores = { redness: 0.7777, oiliness: 0.7777, texture: 0.7777, pores: 0.7777, blemishes: 0.7777, hydration: 0.7777, pigment: 0.7777 };
    const state = ok(toSkinState(record, REF));
    expect(JSON.stringify(state)).not.toContain("0.7777");
    // Metric NAMES legitimately appear in provenance (engine.scoreTypes,
    // deprecatedSourceFields); the measurement sections must carry none.
    const json = JSON.stringify({ regions: state.regions, uncertainty: state.uncertainty, quality: state.quality });
    for (const word of ["redness\":", "hydration", "oiliness", "pores\":", "blemish", "band", "\"score\""]) {
      expect(json).not.toContain(word);
    }
  });

  it("preserves provenance: recovery marker, Firestore Timestamp, capture method", () => {
    const record = { ...productionRecord(), persistAttempt: "recovery", captureMethod: "canvas",
      createdAt: { toDate: () => new Date("2026-10-11T00:00:00Z") } };
    const state = ok(toSkinState(record, REF));
    expect(state.provenance.persistAttempt).toBe("recovery");
    expect(state.provenance.analyzedAt).toBe("2026-10-11T00:00:00.000Z");
    expect(state.input.captureMethod).toBe("canvas");
  });

  it("does not trust unknown capture methods or markers", () => {
    const state = ok(toSkinState({ ...productionRecord(), captureMethod: "screenshot", persistAttempt: "forged" }, REF));
    expect(state.input.captureMethod).toBeNull();
    expect(state.provenance.persistAttempt).toBe("primary");
  });
});

describe("skinstate-1: missing region", () => {
  it("pixelCount 0 → absent_region with null values, never the engine's 0.0 stats", () => {
    const record = productionRecord();
    (record.region_raw_corrected as Record<string, unknown>).chin = { ...regionRaw(0), lab_a_mean: 0, specular_frac: 0 };
    const state = ok(toSkinState(record, REF));
    expect(state.regions.chin).toEqual({ status: "absent_region", pixelCount: 0, colour: null, texture: null, specular: null });
    expect(state.quality.lowPixelCount.chin).toBe(true);
    expect(state.regions.forehead?.status).toBe("available");
  });

  it("low pixel count is DERIVED in quality, never a reason to drop or alter values", () => {
    const record = productionRecord();
    (record.region_raw_corrected as Record<string, unknown>).nose = regionRaw(1500);
    const state = ok(toSkinState(record, REF));
    expect(state.quality.lowPixelCount.nose).toBe(true);
    expect(state.regions.nose).toEqual(availableRegion(1500));
  });
});

describe("skinstate-1: legacy scan", () => {
  it("a schemaVersion-1 client skinChecks doc stays a legacy reading", () => {
    const legacy = {
      schemaVersion: 1, scanId: "LEGACY01", status: "completed", answers: { name: "x" },
      result: { scores: { redness: 0.5 }, region_scores: { cheeks: { redness: 0.5 } }, regions: ["cheeks"], pipeline_version: "scan-0.1.3-provisional" },
    };
    expect(toSkinState(legacy, "users/U/skinChecks/LEGACY01")).toEqual({
      kind: "legacy_display", pipelineVersion: "scan-0.1.3-provisional",
      scores: { redness: 0.5 }, region_scores: { cheeks: { redness: 0.5 } },
      label: "client-reported legacy reading; not a SkinState",
    });
  });

  it("is never silently upgraded, even if the legacy result happens to carry raw fields", () => {
    const legacy = { schemaVersion: 1, result: { ...productionRecord(), source: undefined } };
    expect(toSkinState(legacy, "users/U/skinChecks/X").kind).toBe("legacy_display");
  });
});

describe("skinstate-1: malformed raw data → invalid, never patched", () => {
  const reg = (r: Record<string, unknown>, block: string, key: string) =>
    (r[block] as Record<string, Record<string, unknown>>)[key]!;
  const cases: [string, (r: Record<string, unknown>) => void, RegExp][] = [
    ["missing stat", (r) => { delete reg(r, "region_raw_corrected", "forehead").lbp_entropy; }, /forehead\.lbp_entropy/],
    ["non-finite stat", (r) => { reg(r, "region_raw_corrected", "nose").lab_a_mean = Number.NaN; }, /nose\.lab_a_mean/],
    ["string stat", (r) => { reg(r, "region_raw_corrected", "nose").grad_raw = "12"; }, /nose\.grad_raw/],
    ["edges/counts mismatch", (r) => { r.region_hist_bin_edges_corrected = { lab_a_hist: A_EDGES.slice(1), color_var_hist: CV_EDGES }; }, /20 edges for 20 counts/],
    ["missing raw block", (r) => { delete r.region_raw_corrected; }, /region_raw_corrected/],
    ["region listed but not in raw", (r) => { r.regions = ["forehead", "nose", "chin", "cheeks", "cheek_image_left"]; }, /cheek_image_left/],
    ["region not defined in skinstate-1", (r) => { r.regions = ["forehead", "periorbital"]; }, /periorbital/],
    ["nested-array-encoded field", (r) => { r.region_hist_corrected_json = "[[1]]"; }, /_json/],
    ["missing createdAt", (r) => { delete r.createdAt; }, /createdAt/],
    ["bad clip stats", (r) => { reg(r, "region_hist_corrected", "chin").lab_a_hist_clip = { underflow: 0 }; }, /chin\.lab_a_hist_clip/],
    ["unsupported record schema", (r) => { r.schemaVersion = 2; }, /schemaVersion/],
  ];
  it.each(cases)("%s", (_name, mutate, reason) => {
    const record = structuredClone(productionRecord());
    mutate(record);
    const result = toSkinState(record, REF);
    expect(result.kind).toBe("invalid");
    expect((result as { reasons: string[] }).reasons.join("\n")).toMatch(reason);
  });

  it("rejects a non-object and a record that is neither server nor legacy", () => {
    expect(toSkinState(null, REF).kind).toBe("invalid");
    expect(toSkinState({ source: "client" }, REF).kind).toBe("invalid");
  });
});

describe("skinstate-1: unknown uncertainty", () => {
  it("is always unknown — never derived from pixel counts, scores or anything in the record", () => {
    const record = { ...productionRecord(), uncertainty: { sem: 1 }, region_low_confidence: { forehead: true } };
    const state = ok(toSkinState(record, REF));
    expect(state.uncertainty).toEqual({ policy: "unknown", calibrationId: null, fields: { "*": { status: "unknown" } } });
  });
});

describe("skinstate-1: future engine version", () => {
  it("unknown pipeline → engine metadata null (not guessed); split cheeks drop the union; native mapped", () => {
    const record = productionRecord();
    const regions = ["forehead", "nose", "chin", "cheeks", "cheek_image_left", "cheek_image_right"];
    const raw = Object.fromEntries(regions.map((r) => [r, regionRaw(20000)]));
    const hist = Object.fromEntries(regions.map((r) => [r, regionHist()]));
    const native = Object.fromEntries(regions.map((r) => [r, { ...regionRaw(20000), lab_l_mean: 55, lab_l_std_decoded: 5 }]));
    Object.assign(record, {
      pipeline_version: "scan-0.2.0", regions, region_raw_corrected: raw, region_hist_corrected: hist,
      region_raw_native: native, region_hist_native: hist,
      region_hist_bin_edges_native: { lab_a_hist: A_EDGES, color_var_hist: CV_EDGES },
    });
    const state = ok(toSkinState(record, REF));
    expect(state.engine).toMatchObject({ pipelineVersion: "scan-0.2.0", build: null, landmarkModel: null, opencvVersion: null, statsPath: "both" });
    expect(Object.keys(state.regions)).toEqual(["forehead", "nose", "chin", "cheek_image_left", "cheek_image_right"]);
    const left = state.regions.cheek_image_left;
    expect(left?.status === "available" && left.colour.native).toEqual({
      aStarMean: 2, aStarP90: 6, aStarSd: 3, bStarMean: 10, lStarMean: 55, lStarSd: 5,
      aStarHist: { edges: A_EDGES, counts: COUNTS }, aStarHistClip: CLIP,
      localLContrastHist: { edges: CV_EDGES, counts: COUNTS }, localLContrastHistClip: CLIP,
    });
    expect(state.uncertainty.policy).toBe("unknown");
  });
});
