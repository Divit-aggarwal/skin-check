import { describe, expect, it } from "vitest";
import { toSkinState, type SkinState } from "@/lib/skin-state";

import { A_EDGES, CLIP, COUNTS, CV_EDGES, regionHist, regionRaw, syntheticAnalysis } from "./synthetic-scan";

const UID = "SYNTH_UID";
const REF = `users/${UID}/scanAnalyses/SYNTHSCAN01_aaaaaaaaaaaaaaaa`;

/** Shaped exactly like a gate-01 `scanAnalyses` record today: corrected path only, aliases present. */
function productionRecord(): Record<string, unknown> {
  return {
    schemaVersion: 1, source: "server", scanId: "SYNTHSCAN01", inputSha256: "a".repeat(64), requestId: "synth-req-1",
    createdAt: new Date("2026-10-10T10:00:00Z"),
    ...syntheticAnalysis(),
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
    const state = ok(toSkinState(productionRecord(), REF, UID));
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
    const a = JSON.stringify(toSkinState(record, REF, UID));
    const b = JSON.stringify(toSkinState(record, REF, UID));
    expect(a).toBe(b);
    expect(JSON.stringify(record)).toBe(before);
  });

  it("never turns proxies into measurements: no score/band/skin-concept keys or score values in the output", () => {
    const record = productionRecord();
    record.scores = { redness: 0.7777, oiliness: 0.7777, texture: 0.7777, pores: 0.7777, blemishes: 0.7777, hydration: 0.7777, pigment: 0.7777 };
    const state = ok(toSkinState(record, REF, UID));
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
    const state = ok(toSkinState(record, REF, UID));
    expect(state.provenance.persistAttempt).toBe("recovery");
    expect(state.provenance.analyzedAt).toBe("2026-10-11T00:00:00.000Z");
    expect(state.input.captureMethod).toBe("canvas");
  });

  it("does not trust unknown capture methods or markers", () => {
    const state = ok(toSkinState({ ...productionRecord(), captureMethod: "screenshot", persistAttempt: "forged" }, REF, UID));
    expect(state.input.captureMethod).toBeNull();
    expect(state.provenance.persistAttempt).toBe("primary");
  });
});

describe("skinstate-1: missing region", () => {
  it("pixelCount 0 → absent_region with null values, never the engine's 0.0 stats", () => {
    const record = productionRecord();
    (record.region_raw_corrected as Record<string, unknown>).chin = { ...regionRaw(0), lab_a_mean: 0, specular_frac: 0 };
    const state = ok(toSkinState(record, REF, UID));
    expect(state.regions.chin).toEqual({ status: "absent_region", pixelCount: 0, colour: null, texture: null, specular: null });
    expect(state.quality.lowPixelCount.chin).toBe(true);
    expect(state.regions.forehead?.status).toBe("available");
  });

  it("low pixel count is DERIVED in quality, never a reason to drop or alter values", () => {
    const record = productionRecord();
    (record.region_raw_corrected as Record<string, unknown>).nose = regionRaw(1500);
    const state = ok(toSkinState(record, REF, UID));
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
    expect(toSkinState(legacy, "users/U/skinChecks/LEGACY01", "U")).toEqual({
      kind: "legacy_display", pipelineVersion: "scan-0.1.3-provisional",
      scores: { redness: 0.5 }, region_scores: { cheeks: { redness: 0.5 } },
      label: "client-reported legacy reading; not a SkinState",
    });
  });

  it("is never silently upgraded, even if the legacy result happens to carry raw fields", () => {
    const legacy = { schemaVersion: 1, result: { ...productionRecord(), source: undefined } };
    expect(toSkinState(legacy, "users/U/skinChecks/X", "U").kind).toBe("legacy_display");
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
    const result = toSkinState(record, REF, UID);
    expect(result.kind).toBe("invalid");
    expect((result as { reasons: string[] }).reasons.join("\n")).toMatch(reason);
  });

  it("rejects a non-object and a record that is neither server nor legacy", () => {
    expect(toSkinState(null, REF, UID).kind).toBe("invalid");
    // A complete record whose ONLY defect is its source — so this fails on the source check alone.
    const result = toSkinState({ ...productionRecord(), source: "client" }, REF, UID);
    expect(result).toEqual({ kind: "invalid", reasons: ['scanAnalyses record source is not "server"'] });
  });
});

describe("skinstate-1: unknown uncertainty", () => {
  it("is always unknown — never derived from pixel counts, scores or anything in the record", () => {
    const record = { ...productionRecord(), uncertainty: { sem: 1 }, region_low_confidence: { forehead: true } };
    const state = ok(toSkinState(record, REF, UID));
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
    const state = ok(toSkinState(record, REF, UID));
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

describe("skinstate-1: gate-04 fields (engine_build, captureMethod, native stats)", () => {
  it("old records stay readable: no engine_build, no captureMethod, native keys absent or null", () => {
    const absent = productionRecord();
    delete absent.region_raw_native;
    delete absent.region_hist_native;
    delete absent.region_hist_bin_edges_native;
    for (const record of [productionRecord(), absent]) {
      const state = ok(toSkinState(record, REF, UID));
      expect(state.engine).toMatchObject({ build: null, statsPath: "corrected" });
      expect(state.input.captureMethod).toBeNull();
      expect(state.regions.cheeks?.status === "available" && state.regions.cheeks.colour.native).toBeNull();
    }
  });

  it("a stored engine_build is NOT surfaced: skinstate-1 is frozen with no source key for engine.build", () => {
    const withBuild = { ...productionRecord(), engine_build: "sha-synthetic0000" };
    expect(toSkinState(withBuild, REF, UID)).toEqual(toSkinState(productionRecord(), REF, UID));
  });
});

describe("skinstate-1: trust comes from the path, not record.source (gate 02)", () => {
  const invalid = (r: ReturnType<typeof toSkinState>) => expect(r.kind).toBe("invalid");

  it("a skinChecks doc claiming source \"server\" with full raw fields is invalid, never a SkinState", () => {
    const result = toSkinState(productionRecord(), `users/${UID}/skinChecks/SYNTHSCAN01_aaaaaaaaaaaaaaaa`, UID);
    expect(result).toEqual({ kind: "invalid", reasons: [expect.stringMatching(/forged/)] });
  });

  it("a skinChecks doc without a legacy result is invalid", () => {
    invalid(toSkinState({ schemaVersion: 1, scanId: "X", status: "pending" }, `users/${UID}/skinChecks/X`, UID));
  });

  it("a legacy record passed with a scanAnalyses-looking ref is invalid", () => {
    const legacy = { schemaVersion: 1, scanId: "LEGACY01", result: { scores: { redness: 0.5 } } };
    invalid(toSkinState(legacy, `users/${UID}/scanAnalyses/LEGACY01_aaaaaaaaaaaaaaaa`, UID));
  });

  it("a server record under a docId for a different scanId or input is invalid", () => {
    for (const docId of ["OTHERSCAN_aaaaaaaaaaaaaaaa", "SYNTHSCAN01_bbbbbbbbbbbbbbbb"]) {
      const result = toSkinState(productionRecord(), `users/${UID}/scanAnalyses/${docId}`, UID);
      expect((result as { reasons: string[] }).reasons).toContain("analysisRef: docId does not match scanAnalysisDocId(scanId, inputSha256)");
    }
  });

  it("rejects an inputSha256 that is not 64 lowercase hex", () => {
    const result = toSkinState({ ...productionRecord(), inputSha256: "A".repeat(64) }, `users/${UID}/scanAnalyses/SYNTHSCAN01_AAAAAAAAAAAAAAAA`, UID);
    expect((result as { reasons: string[] }).reasons).toContain("record.inputSha256: not 64 lowercase hex");
  });

  // Built around the valid docId with uid === expectedUid, so the ONLY thing
  // wrong is the ref's shape — the uid and docId-binding checks can't mask a
  // weakened path parser.
  const D = "SYNTHSCAN01_aaaaaaaaaaaaaaaa";
  it.each([
    "", `users/u/scanAnalyses`, `users/u/scanAnalyses/${D}/b`, `users//scanAnalyses/${D}`, `users/../scanAnalyses/${D}`,
    `/users/u/scanAnalyses/${D}`, `users/u/scanAnalyses/${D} `, `other/u/scanAnalyses/${D}`, `users/u/scanAnalyses/${D}/`,
    `users/u/scan%41nalyses/${D}`, `users/u/scanAnalyses/${D}\u200b`, `users/u/scanAnalyses/..`,
  ])("malformed analysisRef %j → invalid (shape)", (ref) => {
    const result = toSkinState(productionRecord(), ref, "u");
    expect(result.kind).toBe("invalid");
    expect((result as { reasons: string[] }).reasons).toContain("analysisRef: not of the form users/{uid}/{collection}/{docId}");
  });

  it.each(["otherCollection", "ScanAnalyses", "scananalyses"])("collection %j is never a SkinState source", (c) => {
    const result = toSkinState(productionRecord(), `users/u/${c}/${D}`, "u");
    expect((result as { reasons: string[] }).reasons).toContain(`analysisRef: collection "${c}" is not a SkinState source`);
  });

  it("a cross-user reference is invalid", () => {
    invalid(toSkinState(productionRecord(), "users/user-b/scanAnalyses/SYNTHSCAN01_aaaaaaaaaaaaaaaa", "user-a"));
  });

  it("an empty or malformed expectedUid is invalid", () => {
    invalid(toSkinState(productionRecord(), REF, ""));
    invalid(toSkinState(productionRecord(), "users/../scanAnalyses/SYNTHSCAN01_aaaaaaaaaaaaaaaa", ".."));
  });
});
