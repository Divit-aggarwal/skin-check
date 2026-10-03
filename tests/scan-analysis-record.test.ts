import { describe, expect, it } from "vitest";
import {
  buildScanAnalysisRecord,
  MAX_RECORD_BYTES,
  recordByteSize,
  scanAnalysisDocId,
} from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";

const SCORES = { redness: 1, oiliness: 2, texture: 3, pores: 4, blemishes: 5, hydration: 6, pigment: 7 };
const META = { scanId: "0f8fad5b-d9cb-469f-a165-70867728950e", inputSha256: "ab".repeat(32), requestId: "req-1" };

const result = (extra: Record<string, unknown> = {}) =>
  ({
    scores: SCORES,
    overlays: { redness: "iVBORw0KGgo=" },
    regions: ["forehead"],
    region_scores: { forehead: SCORES },
    region_raw: { forehead: { lab_a_mean: 1.5 } },
    region_hist: { forehead: { lab_a_hist: [1, 2], lab_a_hist_clip: { underflow: 0, overflow: 0, min: 0, max: 1 } } },
    region_hist_bin_edges: { lab_a_hist: [0, 0.5, 1] },
    region_hist_corrected: { forehead: { lab_a_hist: [2, 1] } },
    pipeline_version: "scan-0.1.5-provisional",
    ...extra,
  }) as SkinScanResult;

describe("buildScanAnalysisRecord", () => {
  it("keeps the rescoring fields and provenance, never overlays or unknown passthrough keys", () => {
    const record = buildScanAnalysisRecord(
      result({ region_raw_corrected: { forehead: { x: 1 } }, region_hist_bin_edges_corrected: { h: [0, 1] }, debug_blob: "x" }),
      { ...META, captureMethod: "native" }
    );
    expect(record).not.toHaveProperty("overlays");
    expect(record).not.toHaveProperty("debug_blob");
    expect(record).toMatchObject({
      schemaVersion: 1,
      source: "server",
      scanId: META.scanId,
      inputSha256: META.inputSha256,
      requestId: "req-1",
      captureMethod: "native",
      region_raw: { forehead: { lab_a_mean: 1.5 } },
      region_raw_corrected: { forehead: { x: 1 } },
      region_hist_bin_edges_corrected: { h: [0, 1] },
      pipeline_version: "scan-0.1.5-provisional",
    });
  });

  it("keeps the *_native fields, including null", () => {
    const record = buildScanAnalysisRecord(
      result({ region_raw_native: { forehead: { L_mean: 60 } }, region_hist_native: null, region_hist_bin_edges_native: null }),
      META
    );
    expect(record.region_raw_native).toEqual({ forehead: { L_mean: 60 } });
    expect(record).toHaveProperty("region_hist_native", null);
    expect(record).toHaveProperty("region_hist_bin_edges_native", null);
  });

  it("omits undefined keys (Firestore rejects them)", () => {
    const record = buildScanAnalysisRecord(result(), META);
    expect(Object.values(record)).not.toContain(undefined);
    expect(record).not.toHaveProperty("score_types");
    expect(record).not.toHaveProperty("captureMethod");
  });

  it("engine_build is kept verbatim when a non-empty string, absent otherwise", () => {
    expect(buildScanAnalysisRecord(result({ engine_build: "sha-0123abc" }), META).engine_build).toBe("sha-0123abc");
    for (const engine_build of [undefined, null, "", 42]) {
      expect(buildScanAnalysisRecord(result({ engine_build }), META)).not.toHaveProperty("engine_build");
    }
  });

  it("persistAttempt is omitted by default and stored only when given", () => {
    expect(buildScanAnalysisRecord(result(), META)).not.toHaveProperty("persistAttempt");
    expect(buildScanAnalysisRecord(result(), { ...META, persistAttempt: "recovery" }).persistAttempt).toBe("recovery");
  });

  it("JSON-strings a field that contains an array of arrays", () => {
    const record = buildScanAnalysisRecord(result({ region_hist_bin_edges_corrected: { h: [[0, 1], [1, 2]] } }), META);
    expect(record).not.toHaveProperty("region_hist_bin_edges_corrected");
    expect(JSON.parse(record.region_hist_bin_edges_corrected_json as string)).toEqual({ h: [[0, 1], [1, 2]] });
    // Untouched siblings stay native maps.
    expect(record.region_hist_bin_edges).toEqual({ lab_a_hist: [0, 0.5, 1] });
  });

  it("a size over the guard is detectable before any write", () => {
    const big = buildScanAnalysisRecord(result({ region_raw_corrected: { r: { x: "y".repeat(MAX_RECORD_BYTES) } } }), META);
    expect(recordByteSize(big)).toBeGreaterThan(MAX_RECORD_BYTES);
    expect(recordByteSize(buildScanAnalysisRecord(result(), META))).toBeLessThan(10_000);
  });
});

describe("scanAnalysisDocId", () => {
  it("is scanId + first 16 hex of the input hash", () => {
    expect(scanAnalysisDocId("scan-abc-123", "0123456789abcdef" + "f".repeat(48))).toBe("scan-abc-123_0123456789abcdef");
  });
});
