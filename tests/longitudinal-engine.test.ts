import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { NOT_COMPARABLE_REASONS, type ComparableQuantity, type NotComparableReason } from "@/lib/comparability";
import type { LongitudinalResult, NoiseTableEntry, QuantityPath } from "@/lib/contracts/longitudinal-result";
import { longitudinalResult, REASON_TEXT, type Tables } from "@/lib/longitudinal/engine";
import { CONFOUNDERS } from "@/lib/longitudinal/settings";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinStateRegionKey } from "@/lib/skin-state";
import { toSkinState2, type SkinState2Result } from "@/lib/skin-state-2";
import type { SkinScanResult } from "@/types/skin-scan";
import { regionHist, regionRaw, syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// D02/D03 engine (docs/lanes/longitudinal-design.md §4). Every case is a
// synthetic series run through toSkinState2 and the engine. The noise and
// comparable tables below are TEST-ONLY; production uses the empty ones.
const UID = "SYNTH_UID";
const P = "scan-0.1.6-provisional";
const A = "sha-aaaaaaa";
const B = "sha-bbbbbbb";
const Q: QuantityPath = "colour.native.lStarMean";
const R: SkinStateRegionKey = "forehead";
const CHEEK: SkinStateRegionKey = "cheek_image_left";
const HIST: QuantityPath = "colour.native.aStarHist";

const noiseRow = (quantity: QuantityPath, region: SkinStateRegionKey, pipelineVersion = P): NoiseTableEntry => ({
  quantity, region, pipelineVersion, calibrationId: "cal-test", noiseTableVersion: "noise-test", mdc95ByToneBand: { mst_1_4: 1, mst_5_6: 2, mst_7_10: 1.5 },
});
const comparableRow = (fieldPath: QuantityPath, region: SkinStateRegionKey, pipelineVersion = P): ComparableQuantity => ({ fieldPath, region, pipelineVersion, calibrationId: "cal-test" });
const TEST: Required<Tables> = {
  noise: [noiseRow(Q, R), noiseRow(Q, CHEEK), noiseRow(HIST, R)],
  comparable: [comparableRow(Q, R), comparableRow(Q, CHEEK), comparableRow(HIST, R)],
};

interface Opt {
  day: number; value?: number; build?: string | null; pipeline?: string; sha?: string; capture?: "native" | "canvas" | null;
  px?: number; uid?: string; native?: boolean; cheeks?: boolean; persistAttempt?: "recovery"; captureQuality?: unknown;
}

function scan(o: Opt): SkinState2Result {
  const scanId = `scan-${o.day}`;
  const uid = o.uid ?? UID;
  const sha = o.sha ?? createHash("sha256").update(scanId).digest("hex");
  const result = { ...syntheticAnalysis(), ...(o.native === false ? {} : syntheticNative()) } as Record<string, any>;
  if (o.cheeks) {
    result.regions = [...result.regions, "cheek_image_left", "cheek_image_right"];
    for (const k of ["region_raw_corrected", "region_raw_native"]) if (result[k]) result[k] = { ...result[k], cheek_image_left: regionRaw(30000), cheek_image_right: regionRaw(30000) };
    for (const k of ["region_hist_corrected", "region_hist_native"]) if (result[k]) result[k] = { ...result[k], cheek_image_left: regionHist(), cheek_image_right: regionHist() };
  }
  const region = o.cheeks ? CHEEK : R;
  if (result.region_raw_native) result.region_raw_native = { ...result.region_raw_native, [region]: { ...result.region_raw_native[region], lab_l_mean: o.value ?? 55 } };
  if (o.px !== undefined) result.region_raw_corrected = { ...result.region_raw_corrected, [region]: regionRaw(o.px) };
  result.pipeline_version = o.pipeline ?? P;
  if (o.build !== null) result.engine_build = o.build ?? A;
  const record = {
    ...buildScanAnalysisRecord(result as unknown as SkinScanResult, {
      scanId, inputSha256: sha, requestId: `r-${scanId}`, captureMethod: o.capture === null ? undefined : (o.capture ?? "native"),
      persistAttempt: o.persistAttempt, captureQuality: o.captureQuality as never,
    }),
    createdAt: new Date(Date.UTC(2026, 9, 1 + o.day)),
  };
  const out = toSkinState2(record, `users/${uid}/scanAnalyses/${scanAnalysisDocId(scanId, sha)}`, uid);
  if (out.kind !== "skinstate") throw new Error(`fixture is not a SkinState: ${JSON.stringify(out)}`);
  return out;
}

/** Three baseline scans (days 1-3) then the latest (day 10). */
const series = (base: Partial<Opt>[], latest: Partial<Opt>, shared: Partial<Opt> = {}) => [
  ...base.map((b, i) => scan({ ...shared, ...b, day: i + 1 })),
  scan({ ...shared, ...latest, day: 10 }),
];
const flat = (n: number, o: Partial<Opt> = {}) => Array.from({ length: n }, () => ({ ...o }));
const LEGACY: SkinState2Result = { kind: "legacy_display", pipelineVersion: "scan-0.1.3", scores: { redness: 0.4 }, region_scores: null, label: "client-reported legacy reading; not a SkinState" };
const INVALID: SkinState2Result = { kind: "invalid", reasons: ["record.regions: missing or not a string array"] };

const codes = (r: LongitudinalResult) => r.reasons.map((x) => x.code);
const ncReasons = (r: LongitudinalResult) => (r.comparability.verdict === "not_comparable" ? r.comparability.reasons : []);
const allResults: LongitudinalResult[] = [];
const run = (s: SkinState2Result[], tables?: Tables, q: QuantityPath = Q, region: SkinStateRegionKey = R) => {
  const r = longitudinalResult(s, q, region, tables);
  allResults.push(r);
  return r;
};

// ── The brief's ten cases ────────────────────────────────────────────────────

const SAME = "c".repeat(64);
const CASES: Record<string, { s: () => SkinState2Result[]; q?: QuantityPath; region?: SkinStateRegionKey }> = {
  identical: { s: () => series(flat(3), {}, { sha: SAME }) },
  tiny: { s: () => series([{ value: 55 }, { value: 55.5 }, { value: 55.2 }], { value: 56 }) },
  beyond: { s: () => series(flat(3, { value: 55 }), { value: 60 }) },
  engineChange: { s: () => series(flat(3), { build: B }) },
  missingRegion: { s: () => series(flat(3), { px: 0 }) },
  legacy: { s: () => [LEGACY, LEGACY, scan({ day: 1 })] },
  badRaw: { s: () => [...series(flat(3), {}), INVALID] },
  tooFew: { s: () => [scan({ day: 1 }), scan({ day: 2 })] },
  conflicting: { s: () => series([{ value: 50 }, { value: 55 }, { value: 60 }], { value: 55 }) },
  histogram: { s: () => series(flat(3), {}), q: HIST },
};

describe("the brief's cases, with test-only tables", () => {
  it("1. identical scan: pairwise within noise, reason identical_scan; persistence is a reason, never a level", () => {
    const r = run(CASES.identical!.s(), TEST);
    expect(r).toMatchObject({ evidence: "pairwise", change: "within_noise", passedNoiseFloor: false });
    expect(codes(r)).toEqual(["identical_scan", "persistence_not_available"]);
    expect(r.detail.difference).toBe(0);
  });

  it("2. tiny noisy difference: within_noise, passedNoiseFloor false", () => {
    const r = run(CASES.tiny!.s(), TEST);
    expect(r).toMatchObject({ evidence: "pairwise", change: "within_noise", passedNoiseFloor: false });
    expect(codes(r)).toEqual(["within_noise", "persistence_not_available"]);
    expect(r.detail).toMatchObject({ baselineValue: 55.2, latestValue: 56, noiseFloorValue: 2 }); // most conservative band
  });

  it("3. real detectable difference: beyond_noise, every confounder named, known floor with its calibration", () => {
    const r = run(CASES.beyond!.s(), TEST);
    expect(r).toMatchObject({ evidence: "pairwise", change: "beyond_noise", passedNoiseFloor: true });
    expect(codes(r)).toEqual(["beyond_noise", "persistence_not_available"]);
    if (r.evidence !== "pairwise") throw new Error("pairwise expected");
    expect(r.confounders).toEqual([...CONFOUNDERS]);
    expect(r.noiseFloor).toEqual({ status: "known", calibrationId: "cal-test", noiseTableVersion: "noise-test", toneBandPolicy: "most_conservative" });
    expect(r.compared.baseline).toEqual({ rule: "first_3_comparable_scans", status: "established", scans: 3 });
    expect(r.comparability.key).toMatchObject({ contractVersion: "skinstate-2", engineBuild: A, captureMethod: "native" });
    expect(r.detail.baselineAnalysisRefs).toHaveLength(3);
  });

  it("a difference exactly at the floor is within noise (|difference| must exceed the floor)", () => {
    const r = run(series(flat(3, { value: 55 }), { value: 57 }), TEST);
    expect(r).toMatchObject({ evidence: "pairwise", change: "within_noise" });
  });

  it("5. engine change: A A A then B gives engine_boundary, never a change", () => {
    const r = run(CASES.engineChange!.s(), TEST);
    expect(r.evidence).toBe("not_enough_evidence");
    expect(codes(r)).toEqual(expect.arrayContaining(["engine_boundary", "not_comparable"]));
    expect(ncReasons(r)).toContain("engine_build_differs");
    expect(r.detail.difference).toBeNull();
  });

  it("5. A A A, B, A: the baseline and latest builds match, the window still crosses a boundary", () => {
    const s = [...series(flat(3), {}), scan({ day: 5, build: B })];
    const r = run(s, TEST);
    expect(r.evidence).toBe("not_enough_evidence");
    expect(codes(r)).toEqual(["engine_boundary"]);
    expect(r.comparability.verdict).toBe("comparable");
  });

  it("5. A A A then B B B B: the baseline never moves into the newer epoch", () => {
    const s = [...[1, 2, 3].map((day) => scan({ day })), ...[4, 5, 6, 7].map((day) => scan({ day, build: B }))];
    const r = run(s, TEST);
    expect(r.evidence).toBe("not_enough_evidence");
    expect(codes(r)).toContain("engine_boundary");
    expect(r.detail.baselineAnalysisRefs.every((ref) => /scan-[123]_/.test(ref))).toBe(true);
  });

  it("6. missing region: not_comparable with region_absent", () => {
    const r = run(CASES.missingRegion!.s(), TEST);
    expect(r.evidence).toBe("not_enough_evidence");
    expect(codes(r)).toContain("not_comparable");
    expect(ncReasons(r)).toContain("region_absent");
  });

  it("7. legacy: stays legacy and is never used; named on 'not enough evidence', never blocking a valid series", () => {
    const s = CASES.legacy!.s();
    const before = JSON.stringify(s);
    const r = run(s, TEST);
    expect(codes(r)).toEqual(expect.arrayContaining(["legacy_record", "too_few_scans_for_baseline"]));
    expect(JSON.stringify(s)).toBe(before);
    expect(codes(run([LEGACY], TEST))).toEqual(expect.arrayContaining(["legacy_record", "too_few_scans_for_baseline"]));
    const withValid = run([LEGACY, ...CASES.beyond!.s()], TEST);
    expect(withValid).toMatchObject({ evidence: "pairwise", change: "beyond_noise" });
  });

  it("8. bad raw data anywhere: bad_raw_data alone, no partial answer", () => {
    for (const s of [CASES.badRaw!.s(), [INVALID, ...CASES.beyond!.s()], [LEGACY, INVALID]]) {
      const r = run(s, TEST);
      expect(codes(r)).toEqual(["bad_raw_data"]);
      expect(r.detail).toEqual({
        baselineValue: null, latestValue: null, difference: null, noiseFloorValue: null, unit: null,
        baselineAnalysisRefs: [], latestAnalysisRef: null, windowFrom: null, windowTo: null, engineBuilds: [],
      });
      expect(r.noiseFloor.status).toBe("unknown");
    }
  });

  it("9. too few scans: 0 to 3 valid states never make a baseline (one scan is never a baseline)", () => {
    for (const n of [0, 1, 2, 3]) {
      const r = run(Array.from({ length: n }, (_, i) => scan({ day: i + 1 })), TEST);
      expect(r.evidence).toBe("not_enough_evidence");
      expect(codes(r)).toContain("too_few_scans_for_baseline");
      expect(r.compared.baseline.status).toBe("insufficient");
    }
  });

  it("10. conflicting scans: baseline spread beyond the floor gives conflicting_scans", () => {
    const r = run(CASES.conflicting!.s(), TEST);
    expect(r.evidence).toBe("not_enough_evidence");
    expect(codes(r)).toEqual(["conflicting_scans"]);
  });

  it("a histogram quantity never gets a difference, even with a table row for it", () => {
    const r = run(CASES.histogram!.s(), TEST, HIST);
    expect(r.evidence).toBe("not_enough_evidence");
    expect(codes(r)).toEqual(["noise_table_empty"]);
    expect(r.detail).toMatchObject({ baselineValue: null, latestValue: null, difference: null });
  });

  it("comparable but no noise row: noise_table_empty", () => {
    const r = run(CASES.beyond!.s(), { comparable: TEST.comparable, noise: [] });
    expect(codes(r)).toEqual(["noise_table_empty"]);
  });

  it("two noise rows for one quantity, or a bad band value, fail closed", () => {
    expect(codes(run(CASES.beyond!.s(), { ...TEST, noise: [noiseRow(Q, R), noiseRow(Q, R)] }))).toEqual(["noise_table_empty"]);
    const bad = { ...noiseRow(Q, R), mdc95ByToneBand: { mst_1_4: 1, mst_5_6: Number.NaN, mst_7_10: 1 } };
    expect(codes(run(CASES.beyond!.s(), { ...TEST, noise: [bad] }))).toEqual(["noise_table_empty"]);
    const zero = { ...noiseRow(Q, R), mdc95ByToneBand: { mst_1_4: 0, mst_5_6: 0, mst_7_10: 0 } };
    expect(codes(run(CASES.beyond!.s(), { ...TEST, noise: [zero] }))).toEqual(["noise_table_empty"]);
  });

  it("leading unknown-build scans are skipped as unusable, not counted and not a boundary", () => {
    const s = [scan({ day: 0, build: null }), ...CASES.beyond!.s()];
    expect(run(s, TEST)).toMatchObject({ evidence: "pairwise", change: "beyond_noise" });
  });
});

// ── Case 4: each NotComparableReason that can arise ──────────────────────────

const REACHABLE: Record<string, () => LongitudinalResult> = {
  quantity_not_validated: () => run(series(flat(3), {}), { noise: TEST.noise, comparable: [] }),
  engine_build_unknown: () => run(series(flat(3), { build: null }), TEST),
  engine_build_differs: () => run(series(flat(3), { build: B }), TEST),
  pipeline_version_differs: () => run(series(flat(3), { pipeline: "scan-0.1.7-provisional" }), TEST),
  capture_method_unknown: () => run(series(flat(3), { capture: null }), TEST),
  capture_method_differs: () => run(series(flat(3), { capture: "canvas" }), TEST),
  native_stats_missing: () => run(series(flat(3), { native: false }), TEST),
  region_absent: () => run(series(flat(3), { px: 0 }), TEST),
  region_low_pixel_count: () => run(series(flat(3), { px: 1000 }), TEST),
  lr_cheek_cross_capture_method: () => run(series(flat(3), { capture: "canvas" }, { cheeks: true }), TEST, Q, CHEEK),
  different_user: () => run(series(flat(3), { uid: "OTHER_UID" }), TEST),
  // Only with no SkinState at all: every key part is unknown.
  pipeline_version_unknown: () => run([], TEST),
  input_variant_unknown: () => run([], TEST),
};
const NO_STATE = ["pipeline_version_unknown", "input_variant_unknown"];
/** Cannot arise in the engine, and why. If one becomes reachable, this list must change. */
const UNREACHABLE: Record<string, string> = {
  field_not_defined: "QuantityPath is exactly the comparability field list",
  input_variant_differs: "skinstate-2 maps input.variant to one constant",
  contract_version_differs: "the engine reads skinstate-2 states only",
};

describe("4. scans that cannot be compared", () => {
  it.each(Object.keys(REACHABLE))("%s gives not_comparable with that reason", (why) => {
    const r = REACHABLE[why]!();
    expect(r.evidence).toBe("not_enough_evidence");
    // With no SkinState there is no pair: the reason is too_few_scans_for_baseline, and comparability holds the all-unknown key.
    expect(codes(r)).toContain(NO_STATE.includes(why) ? "too_few_scans_for_baseline" : "not_comparable");
    expect(ncReasons(r)).toContain(why as NotComparableReason);
  });

  it("the reachable and unreachable lists are disjoint and cover every NotComparableReason", () => {
    const reach = Object.keys(REACHABLE);
    const unreach = Object.keys(UNREACHABLE);
    expect(reach.filter((r) => unreach.includes(r))).toEqual([]);
    expect([...reach, ...unreach].sort()).toEqual([...NOT_COMPARABLE_REASONS].sort());
  });
});

// ── Production tables and adversarial input ─────────────────────────────────

describe("with the production (empty) tables every series is 'not enough evidence'", () => {
  it.each(Object.keys(CASES))("%s", (name) => {
    const c = CASES[name]!;
    const r = run(c.s(), undefined, c.q ?? Q, c.region ?? R);
    expect(r.evidence).toBe("not_enough_evidence");
    expect(r.change).toBe("not_evaluated");
    expect(r.passedNoiseFloor).toBeNull();
    expect(r.noiseFloor).toEqual({ status: "unknown", calibrationId: null });
  });

  it("identical scan keeps the noise check: identical_scan with noise_table_empty", () => {
    expect(codes(run(CASES.identical!.s()))).toEqual(["identical_scan", "noise_table_empty", "not_comparable"]);
  });

  it("each reachable not-comparable series is also 'not enough evidence' with production tables", () => {
    for (const s of [series(flat(3), { build: B }), series(flat(3), { px: 0 }), series(flat(3), { capture: "canvas" })]) {
      expect(run(s).evidence).toBe("not_enough_evidence");
    }
  });

  it("adversarial: identical hashes, a huge difference, forged client fields, matching builds: never a change", () => {
    const forged = { captureQuality: { schemaVersion: 1, assertedBy: "client", verdict: "pass" }, persistAttempt: "recovery" as const };
    const attempts = [
      series(flat(3, { value: 0 }), { value: 1e9 }, { sha: SAME, ...forged }),
      series(flat(3, { value: 0 }), { value: -1e9 }, forged),
      series(flat(3, { value: 55, capture: "canvas" }), { value: 99, capture: "native" }),
      series(flat(3, { value: 55 }), { value: 99 }, { cheeks: true, ...forged }),
      [...Array.from({ length: 40 }, (_, i) => scan({ day: i, value: 55 })), scan({ day: 99, value: 1e6 })],
    ];
    for (const s of attempts) {
      for (const q of [Q, HIST, "colour.corrected.aStarMean", "texture.lbpEntropy"] as QuantityPath[]) {
        for (const region of [R, CHEEK, "nose"] as SkinStateRegionKey[]) {
          const r = run(s, undefined, q, region);
          expect(r.evidence).toBe("not_enough_evidence");
          expect(r.change).toBe("not_evaluated");
        }
      }
      // Passing empty tables explicitly is the same as the defaults.
      expect(run(s, { noise: [], comparable: [] }).evidence).toBe("not_enough_evidence");
    }
  });
});

describe("output wording and determinism", () => {
  // GEMINI_BOUNDARY §5 rules 3 and 4 (\p{Nd} digits; the change lexicon), plus a few more direction words.
  const BANNED = new RegExp(String.raw`\p{Nd}|%|\b(improv\w*|better|worse\w*|lower|higher|less|more|reduc\w*|increas\w*|decreas\w*|fade\w*|clear\w*|calm\w*|brighten\w*|even out|repair\w*|restor\w*|down|up|last time|before|since|progress\w*|pehle|kam|zyada|behtar|accha|gain\w*|loss|healthier|rise|drop\w*)\b`, "iu");

  it("no reason text contains a digit, a percentage or a direction word", () => {
    for (const text of Object.values(REASON_TEXT)) expect(text).not.toMatch(BANNED);
    expect(allResults.length).toBeGreaterThan(30);
    for (const r of allResults) for (const x of r.reasons) expect(x.text).not.toMatch(BANNED);
  });

  it("the same series in a shuffled order gives the same result", () => {
    const s = CASES.tiny!.s();
    expect(longitudinalResult([s[3]!, s[1]!, s[0]!, s[2]!], Q, R, TEST)).toEqual(longitudinalResult(s, Q, R, TEST));
  });
});
