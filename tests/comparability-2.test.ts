import { describe, expect, it } from "vitest";
import { comparabilityKey, compareStates, type ComparableQuantity } from "@/lib/comparability";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { toSkinState, type SkinState } from "@/lib/skin-state";
import { toSkinState2, type SkinState2 } from "@/lib/skin-state-2";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// Additive skinstate-2 path of lib/comparability.ts (A20, C02). Synthetic values only.
const UID = "SYNTH_UID";
const A = "sha-aaaaaaa";
const B = "sha-bbbbbbb";
const FIELD = "colour.native.lStarMean";
const TABLE: ComparableQuantity[] = [{ fieldPath: FIELD, region: "forehead", pipelineVersion: "scan-0.1.6-provisional", calibrationId: "cal-test" }];

type Meta = Partial<Parameters<typeof buildScanAnalysisRecord>[1]>;
function record(scanId: string, build: string | undefined, meta: Meta = {}): { data: Record<string, unknown>; ref: string } {
  const sha = scanId.padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "c");
  const result = { ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", ...(build ? { engine_build: build } : {}) };
  const data = {
    ...buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId, inputSha256: sha, requestId: `r-${scanId}`, captureMethod: "native", ...meta }),
    createdAt: new Date("2026-10-10T10:00:00Z"),
  };
  return { data, ref: `users/${UID}/scanAnalyses/${scanAnalysisDocId(scanId, sha)}` };
}
function v2(scanId: string, build: string | undefined, meta: Meta = {}): SkinState2 {
  const { data, ref } = record(scanId, build, meta);
  const out = toSkinState2(data, ref, UID);
  if (out.kind !== "skinstate") throw new Error(JSON.stringify(out));
  return out.state;
}
function v1(scanId: string, build: string | undefined): SkinState {
  const { data, ref } = record(scanId, build);
  const out = toSkinState(data, ref, UID);
  if (out.kind !== "skinstate") throw new Error(JSON.stringify(out));
  return out.state;
}

describe("comparability under skinstate-2", () => {
  it("two states with the same build and a test table are comparable, and the key carries the build", () => {
    const v = compareStates(v2("s1", A), v2("s2", A), FIELD, "forehead", TABLE);
    expect(v.verdict).toBe("comparable");
    if (v.verdict === "comparable") expect(v.key).toMatchObject({ contractVersion: "skinstate-2", engineBuild: A, captureMethod: "native" });
  });

  it("different builds give engine_build_differs; a missing build gives engine_build_unknown", () => {
    expect(compareStates(v2("s1", A), v2("s2", B), FIELD, "forehead", TABLE)).toEqual({ verdict: "not_comparable", reasons: ["engine_build_differs"] });
    expect(compareStates(v2("s1", A), v2("s2", undefined), FIELD, "forehead", TABLE)).toEqual({ verdict: "not_comparable", reasons: ["engine_build_unknown"] });
  });

  it("skinstate-1 against skinstate-2 gives contract_version_differs", () => {
    const v = compareStates(v1("s1", A), v2("s2", A), FIELD, "forehead", TABLE);
    expect(v.verdict === "not_comparable" && v.reasons).toContain("contract_version_differs");
  });

  it("with production defaults an equal-build pair is still quantity_not_validated", () => {
    expect(compareStates(v2("s1", A), v2("s2", A), FIELD, "forehead")).toEqual({ verdict: "not_comparable", reasons: ["quantity_not_validated"] });
  });

  it("the skinstate-1 path still never matches on the build (unchanged)", () => {
    const v = compareStates(v1("s1", A), v1("s2", A), FIELD, "forehead", TABLE);
    expect(v).toEqual({ verdict: "not_comparable", reasons: ["engine_build_unknown"] });
  });
});

describe("client-asserted fields other than captureMethod never reach the key (TD-05, Q-2)", () => {
  it("captureQuality and persistAttempt leave the comparability key identical", () => {
    const quality = { schemaVersion: 1, assertedBy: "client", verdict: "pass" } as never;
    const plain = comparabilityKey(v2("s1", A), FIELD, "forehead");
    expect(comparabilityKey(v2("s1", A, { captureQuality: quality }), FIELD, "forehead")).toEqual(plain);
    expect(comparabilityKey(v2("s1", A, { persistAttempt: "recovery" }), FIELD, "forehead")).toEqual(plain);
  });

  it("captureMethod is in the key and marked client-asserted", () => {
    const k = comparabilityKey(v2("s1", A, { captureMethod: "canvas" }), FIELD, "forehead");
    expect(k).toMatchObject({ captureMethod: "canvas", captureMethodAssertedBy: "client" });
  });
});
