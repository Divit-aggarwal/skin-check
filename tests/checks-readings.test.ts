import { describe, expect, it } from "vitest";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { deriveDashboard, type Doc } from "@/components/dashboard/state";
import { readingHistory } from "@/components/checks/readings";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// Screen 11 (TD-50 e): one reading's level word at each check, newest first.

const UID = "SYNTH_UID";
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 10));
const LOUD = { redness: 0.1, oiliness: 0.1, texture: 1, pores: 0, blemishes: 1, hydration: 0, pigment: 1 };

function analysis(scanId: string, d: number, pipeline = "scan-0.1.6-provisional"): Doc {
  const sha = scanId.padEnd(64, "0").replace(/[^0-9a-f]/g, "a");
  const result = { ...syntheticAnalysis(), ...syntheticNative(), scores: LOUD, pipeline_version: pipeline, engine_build: "sha-x" };
  const data = buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId, inputSha256: sha, requestId: `r-${scanId}`, captureMethod: "native" });
  return { id: scanAnalysisDocId(scanId, sha), data: { ...data, createdAt: day(d) } };
}
const check = (id: string, d: number, extra: Record<string, unknown> = {}): Doc => ({ id, data: { scanId: id, status: "completed", answers: {}, createdAt: day(d), ...extra } });

describe("readingHistory (screen 11)", () => {
  it("one row per check with a reading, newest first; questions-only, failed, legacy and unreadable handled", () => {
    const checks = [
      check("a", 1),
      check("b", 3),
      check("q", 4), // questions only: no row
      check("f", 5, { status: "analysis_failed" }), // failed: no row
      check("old", 2, { result: { scores: LOUD, regions: [], pipeline_version: "scan-0.1.4" } }),
      check("bad", 6, { result: { scores: { redness: "x" }, regions: [], pipeline_version: "scan-0.1.4" } }),
    ];
    const analyses = [analysis("a", 1), analysis("b", 3)];
    const d = deriveDashboard(UID, checks, analyses);
    const rows = readingHistory(UID, d.history, checks, analyses, "blemishes");
    expect(rows.map((r) => r.scanId)).toEqual(["bad", "b", "old", "a"]);
    expect(rows.map((r) => r.legacy)).toEqual([true, false, true, false]);
    expect(rows[0]!.band).toBeNull();
    for (const r of rows.slice(1)) expect(r.band).toMatch(/^(Low|Moderate|Elevated)$/);
  });

  it("marks, never hides, a reading from a different software version than the newest one (owner answer 7)", () => {
    const checks = [check("a", 1), check("b", 3), check("c", 5)];
    const analyses = [analysis("a", 1, "scan-0.1.5"), analysis("b", 3), analysis("c", 5)];
    const d = deriveDashboard(UID, checks, analyses);
    const rows = readingHistory(UID, d.history, checks, analyses, "blemishes");
    expect(rows.map((r) => [r.scanId, r.otherVersion])).toEqual([["c", false], ["b", false], ["a", true]]);
  });
});
