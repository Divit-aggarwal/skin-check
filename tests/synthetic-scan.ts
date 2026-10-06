// Shared synthetic skin-scan output. ALL values are synthetic and deliberately
// round (contract §11). Nothing here comes from a real photo or from
// skin-scan/fixtures/scan-response.json.

export const A_EDGES = Array.from({ length: 21 }, (_, i) => -10 + i * 1.5);
export const CV_EDGES = Array.from({ length: 21 }, (_, i) => i * 5);
export const COUNTS = Array.from({ length: 20 }, () => 10);
export const CLIP = { underflow: 0, overflow: 0, min: -5, max: 12 };

export function regionRaw(px: number) {
  return {
    region_px: px, lab_a_mean: 2, lab_a_p90: 6, lab_a_std: 3, lab_b_mean_decoded: 10, lab_b_mean: 138,
    lab_l_mean: 50, lab_l_std_decoded: 15, lab_l_std: 38, lap_var_mean: 200, lbp_entropy: 2.5, grad_raw: 2000,
    specular_frac: 0.1, blemish_pixel_frac: 0.1, blemish_blob_count: 5, lab_a_p70_value: 4, color_var_p60_value: 2,
    smoothness_raw: 0.1, evenness_raw: 0.3, pore_count: 0, pore_density: 0, pore_density_per_kpx: 0,
  };
}
export const regionHist = () => ({ lab_a_hist: COUNTS, lab_a_hist_clip: CLIP, color_var_hist: COUNTS, color_var_hist_clip: CLIP });

const REGIONS = ["forehead", "nose", "chin", "cheeks"];

/** The analysis fields of a /scan response on the corrected path (no overlays). */
export function syntheticAnalysis(): Record<string, unknown> {
  const raw = Object.fromEntries(REGIONS.map((r) => [r, regionRaw(30000)]));
  const hist = Object.fromEntries(REGIONS.map((r) => [r, regionHist()]));
  const edges = { lab_a_hist: A_EDGES, color_var_hist: CV_EDGES };
  return {
    scores: { redness: 0.5, oiliness: 0.5, texture: 0.5, pores: 0, blemishes: 0.5, hydration: 0.5, pigment: 0.5 },
    region_scores: {}, regions: REGIONS, score_types: { redness: "image_relative" },
    region_low_confidence: { forehead: false, nose: false, chin: false, cheeks: false },
    pipeline_version: "scan-0.1.5-provisional",
    region_raw: raw, region_raw_corrected: raw, region_hist: hist, region_hist_corrected: hist,
    region_hist_bin_edges: edges, region_hist_bin_edges_corrected: edges,
  };
}

/** What `stats=both` adds: the uncorrected ("native") path, L* = 55 everywhere. */
export function syntheticNative(): Record<string, unknown> {
  return {
    region_raw_native: Object.fromEntries(REGIONS.map((r) => [r, { ...regionRaw(30000), lab_l_mean: 55, lab_l_std_decoded: 5 }])),
    region_hist_native: Object.fromEntries(REGIONS.map((r) => [r, regionHist()])),
    region_hist_bin_edges_native: { lab_a_hist: A_EDGES, color_var_hist: CV_EDGES },
  };
}
