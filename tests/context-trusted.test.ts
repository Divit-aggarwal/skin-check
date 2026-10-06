import { describe, expect, it, vi } from "vitest";

// lane:context made two additive fields readable in loadTrustedEchoContext.
// A bad value in either must be dropped, never turn a record today's Echo
// could read into "no analysis" (409).
const { store } = vi.hoisted(() => ({ store: { analysis: {} as Record<string, unknown>, docId: "" } }));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: (name: string) =>
          name === "scanAnalyses"
            ? { where: () => ({ get: async () => ({ docs: [{ id: store.docId, data: () => store.analysis }] }) }) }
            : { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) },
      }),
    }),
  }),
}));

import { loadTrustedEchoContext } from "@/lib/echo-trusted-context";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

const scores = { redness: 0.5, oiliness: 0.5, texture: 0.5, pores: 0, blemishes: 0.5, hydration: 0.5, pigment: 0.5 };

// A real server record for uid "u", scan "s" (Echo requires a valid skinstate since red team I02).
const SHA = "a".repeat(64);
function serverRecord(extra: Record<string, unknown> = {}): Record<string, unknown> {
  const result = { ...syntheticAnalysis(), ...syntheticNative(), scores, pipeline_version: "scan-0.1.6", engine_build: "sha-test" };
  const record = buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId: "s", inputSha256: SHA, requestId: "r", captureMethod: "native" });
  store.docId = scanAnalysisDocId("s", SHA);
  return { ...record, createdAt: new Date(1000), ...extra };
}

describe("trusted context additive fields", () => {
  it("reads pipeline_version and region_low_confidence", async () => {
    store.analysis = serverRecord({ region_low_confidence: { cheeks: true } });
    expect(await loadTrustedEchoContext("u", "s")).toMatchObject({ pipelineVersion: "scan-0.1.6", regionLowConfidence: { cheeks: true } });
  });

  it.each([
    ["an over-long pipeline_version", { pipeline_version: "x".repeat(500) }],
    ["a malformed region_low_confidence", { region_low_confidence: { cheeks: "yes" } }],
  ])("%s is dropped and the record still loads", async (_name, extra) => {
    store.analysis = serverRecord(extra);
    const ctx = await loadTrustedEchoContext("u", "s");
    expect(ctx).not.toBeNull();
    expect(ctx!.scores).toEqual(scores);
  });
});

// TD-17 (4), F09: the label names the contract the record was really read under.
describe("contractVersion comes from the record that was read (F09)", () => {
  it("a loaded record gives its own schema version", async () => {
    const { buildContextPackage } = await import("@/lib/context/builder");
    store.analysis = serverRecord();
    const ctx = (await loadTrustedEchoContext("u", "s"))!;
    expect(ctx.schemaVersion).toBe(1);
    const skin = { scores: ctx.scores, regionScores: ctx.regionScores, regionLowConfidence: ctx.regionLowConfidence, pipelineVersion: ctx.pipelineVersion, schemaVersion: ctx.schemaVersion };
    expect(buildContextPackage({ regionFocus: null, message: "hi", skin, answers: {} }).skin!.contractVersion).toBe("scan-analysis-1");
  });

  it.each([
    [2, "scan-analysis-2"],
    [null, "scan-analysis-unknown"],
  ])("the builder labels schema version %j as %s (never the version this code writes)", async (schemaVersion, expected) => {
    const { buildContextPackage } = await import("@/lib/context/builder");
    const skin = { scores, regionScores: {}, regionLowConfidence: {}, pipelineVersion: null, schemaVersion };
    expect(buildContextPackage({ regionFocus: null, message: "hi", skin, answers: {} }).skin!.contractVersion).toBe(expected);
  });
});

// Red team (2026-10-04, tracker I02, area A F2): Echo talks only about a record the dashboard and the
// longitudinal contract accept, so it never grounds a chat in a record the dashboard shows as no reading.
describe("Echo accepts only a valid skinstate record", () => {
  it.each([
    // Before I02 Echo dropped this field and loaded the record; the dashboard rejected it.
    ["a non-string pipeline_version", { pipeline_version: 7 }],
    ["an unsupported schemaVersion", { schemaVersion: 999 }],
    ["an inputSha256 that does not match the doc id", { inputSha256: "b".repeat(64) }],
  ])("%s: no analysis (409)", async (_name, extra) => {
    store.analysis = serverRecord(extra);
    expect(await loadTrustedEchoContext("u", "s")).toBeNull();
  });

  it("a doc id that is not scanId + input hash: no analysis", async () => {
    store.analysis = serverRecord();
    store.docId = "s_0000000000000000";
    expect(await loadTrustedEchoContext("u", "s")).toBeNull();
  });

  it("control: the valid record loads", async () => {
    store.analysis = serverRecord();
    expect(await loadTrustedEchoContext("u", "s")).not.toBeNull();
  });
});
