import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COMPARABLE_QUANTITIES,
  comparabilityKey,
  compareKeys,
  compareStates,
  type ComparabilityKey,
  type ComparableQuantity,
} from "@/lib/comparability";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { toSkinState, type SkinState } from "@/lib/skin-state";
import { runCaptureGate } from "@/lib/capture-quality/gate";
import type { SkinScanResult } from "@/types/skin-scan";
import { regionHist, regionRaw, syntheticAnalysis, syntheticNative } from "./synthetic-scan";

const FIELD = "colour.native.lStarMean";
const KEY: ComparabilityKey = {
  contractVersion: "skinstate-1", fieldPath: FIELD, region: "cheeks",
  pipelineVersion: "scan-0.1.6-provisional", engineBuild: "sha-test-build", colourPath: "native",
  statsPath: "both", inputVariant: "cv_downscale_1280", captureMethod: "native", captureMethodAssertedBy: "client",
  regionStatus: "available", lowPixelCount: false,
};
const TABLE: ComparableQuantity[] = [{ fieldPath: FIELD, region: "cheeks", pipelineVersion: "scan-0.1.6-provisional", calibrationId: null }];
const k = (over: Partial<ComparabilityKey> = {}): ComparabilityKey => ({ ...KEY, ...over });

describe("compareKeys: key-pair table", () => {
  it("identical keys with a non-null build and a validated quantity are comparable, noise unknown", () => {
    expect(compareKeys(k(), k(), TABLE)).toEqual({
      verdict: "comparable", key: KEY, noiseThreshold: { status: "unknown", calibrationId: null },
    });
  });

  it.each<[string, Partial<ComparabilityKey>, Partial<ComparabilityKey>, readonly ComparableQuantity[], string[]]>([
    ["identical keys, production (empty) table", {}, {}, COMPARABLE_QUANTITIES, ["quantity_not_validated"]],
    ["entry for another pipeline version", {}, {}, [{ ...TABLE[0]!, pipelineVersion: "scan-0.1.5-provisional" }], ["quantity_not_validated"]],
    ["entry for another region only", {}, {}, [{ ...TABLE[0]!, region: "forehead" }], ["quantity_not_validated"]],
    ["build null on one side", { engineBuild: null }, {}, TABLE, ["engine_build_unknown"]],
    ["build null on the other side", {}, { engineBuild: null }, TABLE, ["engine_build_unknown"]],
    ["builds differ", {}, { engineBuild: "sha-other" }, TABLE, ["engine_build_differs"]],
    ["pipeline versions differ", {}, { pipelineVersion: "scan-0.1.5-provisional" }, TABLE, ["quantity_not_validated", "pipeline_version_differs"]],
    ["pipeline version null", { pipelineVersion: null }, { pipelineVersion: null }, TABLE, ["quantity_not_validated", "pipeline_version_unknown"]],
    ["input variants differ", {}, { inputVariant: "other_variant" }, TABLE, ["input_variant_differs"]],
    ["input variant null", { inputVariant: null }, {}, TABLE, ["input_variant_unknown"]],
    ["capture method null", {}, { captureMethod: null }, TABLE, ["capture_method_unknown"]],
    ["capture methods differ (Q-1: no caveats tier)", {}, { captureMethod: "canvas" }, TABLE, ["capture_method_differs"]],
    ["native field with statsPath corrected", {}, { statsPath: "corrected" }, TABLE, ["native_stats_missing"]],
    ["absent region", { regionStatus: "absent_region" }, {}, TABLE, ["region_absent"]],
    ["low pixel count", {}, { lowPixelCount: true }, TABLE, ["region_low_pixel_count"]],
    ["unknown fieldPath", { fieldPath: "scores.redness", colourPath: null }, { fieldPath: "scores.redness", colourPath: null }, TABLE, ["quantity_not_validated", "field_not_defined"]],
    ["contract versions differ", {}, { contractVersion: "skinstate-2" as never }, TABLE, ["contract_version_differs"]],
  ])("%s", (_name, a, b, table, reasons) => {
    expect(compareKeys(k(a), k(b), table)).toEqual({ verdict: "not_comparable", reasons });
  });

  it("cheek_image_left native vs canvas: capture method differs and the L/R cheeks swap", () => {
    const t = [{ ...TABLE[0]!, region: "cheek_image_left" as const }];
    expect(compareKeys(k({ region: "cheek_image_left" }), k({ region: "cheek_image_left", captureMethod: "canvas" }), t)).toEqual({
      verdict: "not_comparable", reasons: ["capture_method_differs", "lr_cheek_cross_capture_method"],
    });
  });

  it("several failures at once: every reason, in the fixed order", () => {
    const a = k({ engineBuild: null, lowPixelCount: true });
    const b = k({ pipelineVersion: "scan-0.1.5-provisional", captureMethod: "canvas", statsPath: "corrected", regionStatus: "absent_region" });
    expect(compareKeys(a, b)).toEqual({
      verdict: "not_comparable",
      reasons: ["quantity_not_validated", "engine_build_unknown", "pipeline_version_differs", "capture_method_differs", "native_stats_missing", "region_absent", "region_low_pixel_count"],
    });
  });

  it("refuses keys for different fields or regions", () => {
    expect(() => compareKeys(k(), k({ region: "nose" }))).toThrow();
  });
});

// ── Real SkinState pairs, built by the frozen contract from synthetic records ──

let seq = 0;
function stateFrom(result: Record<string, unknown>, opts: { uid?: string; captureMethod?: "native" | "canvas"; extra?: Record<string, unknown> } = {}): SkinState {
  const uid = opts.uid ?? "user-a";
  const scanId = `scan-${++seq}`;
  const sha = String(seq).padStart(64, "0");
  const record = {
    ...buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId, inputSha256: sha, requestId: `req-${seq}`, captureMethod: opts.captureMethod ?? "native" }),
    ...opts.extra,
    createdAt: "2026-10-01T00:00:00.000Z",
  };
  const out = toSkinState(record, `users/${uid}/scanAnalyses/${scanAnalysisDocId(scanId, sha)}`, uid);
  if (out.kind !== "skinstate") throw new Error(`fixture is not a SkinState: ${JSON.stringify(out)}`);
  return out.state;
}
const both = () => ({ ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: "sha-8dc37dc" });

describe("compareStates on real skinstate-1 states", () => {
  it("today's honest answer: not comparable (empty table, engine build unmapped), even with matching capture method", () => {
    const a = stateFrom(both());
    const b = stateFrom(both());
    expect(a.engine.build).toBeNull();
    for (const field of ["colour.native.lStarMean", "texture.lbpEntropy", "colour.corrected.aStarMean"]) {
      expect(compareStates(a, b, field, "cheeks")).toEqual({ verdict: "not_comparable", reasons: ["quantity_not_validated", "engine_build_unknown"] });
    }
    // A test table with the entry still cannot rescue the null build.
    expect(compareStates(a, b, FIELD, "cheeks", TABLE)).toEqual({ verdict: "not_comparable", reasons: ["engine_build_unknown"] });
  });

  it("different users are never comparable", () => {
    const v = compareStates(stateFrom(both()), stateFrom(both(), { uid: "user-b" }), FIELD, "cheeks");
    expect(v).toEqual({ verdict: "not_comparable", reasons: ["quantity_not_validated", "engine_build_unknown", "different_user"] });
  });

  it("reads statsPath, an absent region, low pixel count and capture method from the state", () => {
    const corrected = stateFrom({ ...syntheticAnalysis(), pipeline_version: "scan-0.1.6-provisional" }, { captureMethod: "canvas" });
    const v = compareStates(stateFrom(both()), corrected, FIELD, "cheeks");
    expect(v).toEqual({ verdict: "not_comparable", reasons: ["quantity_not_validated", "engine_build_unknown", "capture_method_differs", "native_stats_missing"] });

    const r = both() as unknown as Record<string, Record<string, unknown>>;
    r.region_raw_corrected = { ...r.region_raw_corrected, nose: regionRaw(0), chin: regionRaw(500) };
    r.region_hist_corrected = { ...r.region_hist_corrected, nose: regionHist() };
    const odd = stateFrom(r);
    const reasonsAt = (region: "nose" | "chin") => {
      const out = compareStates(stateFrom(both()), odd, FIELD, region);
      return out.verdict === "not_comparable" ? out.reasons : [];
    };
    expect(reasonsAt("nose")).toContain("region_absent");
    expect(reasonsAt("chin")).toContain("region_low_pixel_count");
    // A region the state does not have at all counts as absent, never as available.
    expect(comparabilityKey(stateFrom(both()), FIELD, "cheek_image_left").regionStatus).toBe("absent_region");
  });

  it("O-1 = A: the key keeps capture method from the state, marked client-asserted", () => {
    const native = comparabilityKey(stateFrom(both()), FIELD, "cheeks");
    const canvas = comparabilityKey(stateFrom(both(), { captureMethod: "canvas" }), FIELD, "cheeks");
    expect(native).toMatchObject({ captureMethod: "native", captureMethodAssertedBy: "client" });
    expect(canvas).toMatchObject({ captureMethod: "canvas", captureMethodAssertedBy: "client" });
    const record = buildScanAnalysisRecord(both() as unknown as SkinScanResult, { scanId: "s-none", inputSha256: "f".repeat(64), requestId: "r" });
    const none = toSkinState({ ...record, createdAt: "2026-10-01T00:00:00.000Z" }, `users/user-a/scanAnalyses/${scanAnalysisDocId("s-none", "f".repeat(64))}`, "user-a");
    expect(none.kind === "skinstate" && comparabilityKey(none.state, FIELD, "cheeks").captureMethod).toBeNull();
    if (none.kind === "skinstate") {
      expect(compareStates(stateFrom(both()), none.state, FIELD, "cheeks", TABLE)).toEqual({
        verdict: "not_comparable", reasons: ["engine_build_unknown", "capture_method_unknown"],
      });
    }
  });

  it("the client gate result changes nothing: comparability never reads it (D-26, Q-2)", () => {
    const pass = runCaptureGate(null, { captureMethod: "native", retakeCount: 0 });
    const a = stateFrom(both());
    const b = stateFrom(both());
    const withPass = stateFrom(both(), { extra: { captureQuality: { ...pass, verdict: "pass" } } });
    const withOverride = stateFrom(both(), { extra: { captureQuality: { ...pass, verdict: "override" } } });
    const base = compareStates(a, b, FIELD, "cheeks", TABLE);
    expect(compareStates(a, withPass, FIELD, "cheeks", TABLE)).toEqual(base);
    expect(compareStates(a, withOverride, FIELD, "cheeks", TABLE)).toEqual(base);
    expect(comparabilityKey(withPass, FIELD, "cheeks")).toEqual(comparabilityKey(a, FIELD, "cheeks"));
  });
});

describe("purity and the production table", () => {
  it("same input gives deep-equal output, and inputs are not mutated", () => {
    const a = stateFrom(both());
    const b = stateFrom(both(), { captureMethod: "canvas" });
    const snapshot = JSON.stringify([a, b]);
    expect(compareStates(a, b, FIELD, "cheeks")).toEqual(compareStates(a, b, FIELD, "cheeks"));
    const ka = k(), kb = k({ engineBuild: null });
    const keys = JSON.stringify([ka, kb]);
    expect(compareKeys(ka, kb, TABLE)).toEqual(compareKeys(ka, kb, TABLE));
    expect(JSON.stringify([a, b])).toBe(snapshot);
    expect(JSON.stringify([ka, kb])).toBe(keys);
  });

  it("COMPARABLE_QUANTITIES is empty and frozen", () => {
    expect(COMPARABLE_QUANTITIES).toEqual([]);
    expect(Object.isFrozen(COMPARABLE_QUANTITIES)).toBe(true);
  });

  // Only tests may pass a table: production code calls with the default. One
  // exception: the longitudinal engine forwards its own test-only table, and
  // only under this name. tests/longitudinal-guard.test.ts proves no
  // production caller hands the engine a table, so in production it is
  // always COMPARABLE_QUANTITIES.
  const MAX_ARGS: Record<string, number> = { compareKeys: 2, compareStates: 4 };
  const FORWARDS: Record<string, string> = { [join("lib", "longitudinal", "engine.ts")]: "comparableTable" };
  const tableOffences = (file: string, src: string): string[] => {
    const offenders: string[] = [];
    const calls = /\b(compareKeys|compareStates)\s*\(/g;
    for (let m = calls.exec(src); m; m = calls.exec(src)) {
      let depth = 1, args = 1, i = m.index! + m[0].length, argStart = i;
      const extra: string[] = [];
      if (src[i] === ")") args = 0;
      for (; i < src.length && depth > 0; i++) {
        if ("([{".includes(src[i]!)) depth++;
        else if (")]}".includes(src[i]!)) depth--;
        if ((src[i] === "," && depth === 1) || depth === 0) {
          if (args > MAX_ARGS[m[1]!]!) extra.push(src.slice(argStart, i).trim());
          if (depth === 1) (args++, (argStart = i + 1));
        }
      }
      const allowed = FORWARDS[file];
      if (args > MAX_ARGS[m[1]!]! && !(allowed && extra.every((a) => a === allowed))) offenders.push(`${file}: ${m[1]}`);
    }
    return offenders;
  };

  it("no file outside tests/ passes a table argument", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
      });
    const files = ["app", "components", "hooks", "lib", "scripts", "types"].flatMap(walk).filter((f) => f !== join("lib", "comparability.ts"));
    expect(files.flatMap((f) => tableOffences(f, readFileSync(f, "utf8")))).toEqual([]);
  });

  it("the table guard's engine exception is one name in one file (positive controls)", () => {
    const engine = join("lib", "longitudinal", "engine.ts");
    expect(tableOffences(engine, "compareStates(a, b, f, r, comparableTable)")).toEqual([]);
    expect(tableOffences(engine, "compareKeys(k, k, comparableTable)")).toEqual([]);
    expect(tableOffences(engine, "compareStates(a, b, f, r, [{ fieldPath }])")).toHaveLength(1);
    expect(tableOffences(engine, "compareKeys(k, k, otherTable)")).toHaveLength(1);
    expect(tableOffences(join("lib", "x.ts"), "compareStates(a, b, f, r, comparableTable)")).toHaveLength(1);
    expect(tableOffences(join("lib", "x.ts"), "compareKeys(k, k)")).toEqual([]);
  });
});
