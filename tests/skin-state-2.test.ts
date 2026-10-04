import { describe, expect, it } from "vitest";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { toSkinState } from "@/lib/skin-state";
import { CLIENT_ASSERTED, toSkinState2, type SkinState2 } from "@/lib/skin-state-2";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// A20 skinstate-2 (owner 2026-10-04). All values synthetic.
const UID = "SYNTH_UID";
const SHA = "b".repeat(64);
const REF = `users/${UID}/scanAnalyses/${scanAnalysisDocId("SYNTHSCAN02", SHA)}`;
const BUILD = "sha-8dc37dc501ea974825427c665acd7019120c20ec";

function record(extra: Record<string, unknown> = {}, meta: Partial<Parameters<typeof buildScanAnalysisRecord>[1]> = {}): Record<string, unknown> {
  const result = { ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: BUILD, ...extra };
  return {
    ...buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId: "SYNTHSCAN02", inputSha256: SHA, requestId: "synth-req-2", captureMethod: "native", ...meta }),
    createdAt: new Date("2026-10-10T10:00:00Z"),
  };
}

function v2(r: unknown): SkinState2 {
  const out = toSkinState2(r, REF, UID);
  if (out.kind !== "skinstate") throw new Error(JSON.stringify(out));
  return out.state;
}

describe("skinstate-2 reads the same record as skinstate-1", () => {
  it("differs from skinstate-1 only in contractVersion, engine.build and clientAsserted", () => {
    const r = record();
    const one = toSkinState(r, REF, UID);
    if (one.kind !== "skinstate") throw new Error("skinstate-1 must read the record");
    const two = v2(r);
    expect(two.contractVersion).toBe("skinstate-2");
    expect(two.engine.build).toBe(BUILD);
    expect(two.clientAsserted).toBe(CLIENT_ASSERTED);
    const { contractVersion: _c, clientAsserted: _a, engine: { build: _b, ...engine2 }, ...rest2 } = two;
    const { contractVersion: _c1, engine: { build: b1, ...engine1 }, ...rest1 } = one.state;
    expect(b1).toBeNull(); // skinstate-1 never maps the build
    expect(engine2).toEqual(engine1);
    expect(rest2).toEqual(rest1);
  });

  it.each([["absent", undefined], ["empty", ""], ["a number", 7], ["an object", { sha: "x" }]])("engine_build %s gives a null build, never a guess", (_, value) => {
    const r: Record<string, unknown> = record();
    if (value === undefined) delete r.engine_build;
    else r.engine_build = value;
    expect(v2(r).engine.build).toBeNull();
  });

  it("names captureMethod, persistAttempt and captureQuality as client-asserted, each with its bound", () => {
    expect(Object.keys(CLIENT_ASSERTED).sort()).toEqual(["captureQuality", "input.captureMethod", "provenance.persistAttempt"]);
    expect(CLIENT_ASSERTED["input.captureMethod"]).toMatch(/only merge the two capture paths/);
    expect(Object.isFrozen(CLIENT_ASSERTED)).toBe(true);
  });

  it("never maps captureQuality: the quality block equals skinstate-1's", () => {
    const quality = { schemaVersion: 1, assertedBy: "client", verdict: "pass" };
    const r = record({}, { captureQuality: quality as never });
    expect(r.captureQuality).toEqual(quality);
    const two = v2(r);
    expect(JSON.stringify(two)).not.toContain("\"verdict\"");
    const one = toSkinState(r, REF, UID);
    expect(one.kind === "skinstate" && one.state.quality).toEqual(two.quality);
  });

  it("keeps processingConsentVersion null (not stored on scanAnalyses)", () => {
    expect(v2(record()).provenance.processingConsentVersion).toBeNull();
  });
});

describe("legacy and invalid records pass through unchanged (D-23)", () => {
  it("a legacy skinChecks reading stays legacy, never upgraded", () => {
    const legacy = { result: { pipeline_version: "scan-0.1.3", scores: { redness: 0.4 } } };
    const ref = `users/${UID}/skinChecks/old1`;
    expect(toSkinState2(legacy, ref, UID)).toEqual(toSkinState(legacy, ref, UID));
    expect(toSkinState2(legacy, ref, UID).kind).toBe("legacy_display");
  });

  it("an invalid record gives the same reasons as skinstate-1", () => {
    const bad = { ...record(), region_raw_corrected: {} };
    expect(toSkinState2(bad, REF, UID)).toEqual(toSkinState(bad, REF, UID));
    expect(toSkinState2(bad, REF, UID).kind).toBe("invalid");
  });

  it("a different user's path is refused, as in skinstate-1", () => {
    expect(toSkinState2(record(), REF, "OTHER_UID").kind).toBe("invalid");
  });
});
