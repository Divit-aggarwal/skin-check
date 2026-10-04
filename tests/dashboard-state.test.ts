import { describe, expect, it } from "vitest";
import { AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { aiShareStatus, deriveDashboard, echoRecord, isEmpty, pastCheck, withdrawalOutcome, type Doc } from "@/components/dashboard/state";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// G01 dashboard view model (docs/lanes/dashboard-design.md §3). All values synthetic.
const UID = "SYNTH_UID";
const BUILD = "sha-8dc37dc501ea974825427c665acd7019120c20ec";
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 10));

function analysis(scanId: string, d: number, extra: Record<string, unknown> = {}, meta: Record<string, unknown> = {}, salt = ""): Doc {
  const sha = (salt + scanId).padEnd(64, "0").slice(0, 64).replace(/[^0-9a-f]/g, "a");
  const result = { ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: BUILD, ...extra };
  const data = buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId, inputSha256: sha, requestId: `r-${scanId}`, captureMethod: "native", ...meta });
  return { id: scanAnalysisDocId(scanId, sha), data: { ...data, createdAt: day(d) } };
}

function check(id: string, d: number | null, extra: Record<string, unknown> = {}): Doc {
  return { id, data: { scanId: id, status: "completed", answers: {}, createdAt: d === null ? null : day(d), image: { stored: false, captureMethod: "native" }, ...extra } };
}

const legacyResult = { scores: { redness: 0.9, oiliness: 0.1, texture: 0.5, pores: 0, blemishes: 0.5, hydration: 0.5, pigment: 0.5 }, regions: [], region_scores: {}, pipeline_version: "scan-0.1.4" };

/** Every number anywhere in a value. */
function numbersIn(v: unknown): number[] {
  if (typeof v === "number") return [v];
  if (v instanceof Date) return [];
  if (v && typeof v === "object") return Object.values(v).flatMap(numbersIn);
  return [];
}

describe("dashboard view model", () => {
  it("empty: no checks gives no reading, an empty trend and no Echo", () => {
    const d = deriveDashboard(UID, [], []);
    expect(d.current).toEqual({ kind: "none" });
    expect(d.trend).toMatchObject({ kind: "empty", count: 0, needed: 3 });
    expect(d.history).toEqual([]);
    expect(d.echoScanId).toBeNull();
    expect(d.photoKept).toBeNull();
  });

  it("one reading: current state shows it, trend is building at 0 of 3 (the newest never counts)", () => {
    const d = deriveDashboard(UID, [check("s1", 1)], [analysis("s1", 1)]);
    expect(d.current.kind).toBe("reading");
    if (d.current.kind !== "reading") throw new Error();
    expect(d.current.view.source).toBe("measured");
    expect(d.current.view.bands?.map((b) => b.metric)).toEqual(["redness", "oiliness", "texture", "blemishes", "pigment"]);
    expect(d.current.view.photoCheck).toBe("not_recorded");
    expect(d.trend).toMatchObject({ kind: "building", count: 0, needed: 3, engineBoundary: false });
    expect(d.echoScanId).toBe("s1");
  });

  it("counts starting checks and stops at the number needed", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const three = deriveDashboard(UID, ids.slice(0, 3).map((s, i) => check(s, i + 1)), ids.slice(0, 3).map((s, i) => analysis(s, i + 1)));
    expect(three.trend).toMatchObject({ kind: "building", count: 2 });
    const five = deriveDashboard(UID, ids.map((s, i) => check(s, i + 1)), ids.map((s, i) => analysis(s, i + 1)));
    expect(five.trend).toMatchObject({ kind: "set", count: 3, needed: 3 });
    if (five.current.kind !== "reading") throw new Error();
    expect(five.current.view.scanId).toBe("e");
  });

  it("an engine change inside the window is named", () => {
    const d = deriveDashboard(UID, [check("a", 1), check("b", 2)], [analysis("a", 1), analysis("b", 2, { engine_build: "sha-other" })]);
    expect(d.trend.engineBoundary).toBe(true);
  });

  it("legacy: a client-written result is shown as saved, never counted, and named in the trend", () => {
    const d = deriveDashboard(UID, [check("old", 1, { result: legacyResult })], []);
    if (d.current.kind !== "reading") throw new Error();
    expect(d.current.view.source).toBe("legacy");
    expect(d.current.view.photoCheck).toBeNull();
    expect(d.current.view.bands?.find((b) => b.metric === "redness")?.band).toBe("Elevated");
    expect(d.trend).toMatchObject({ kind: "empty", count: 0, legacyPresent: true });
    expect(d.history[0]!.kind).toBe("legacy");
    expect(d.echoScanId).toBeNull();
  });

  it("a measured reading wins over a newer legacy one, and the newer check is named as not shown", () => {
    const d = deriveDashboard(UID, [check("m", 1), check("old", 2, { result: legacyResult })], [analysis("m", 1)]);
    if (d.current.kind !== "reading") throw new Error();
    expect(d.current.view.scanId).toBe("m");
    expect(d.newerCheckNotShown).toBe(true);
  });

  it("names a newer check whose server reading is not in yet (pending or questions only), and only then", () => {
    expect(deriveDashboard(UID, [check("m", 1)], [analysis("m", 1)]).newerCheckNotShown).toBe(false);
    expect(deriveDashboard(UID, [check("m", 1), check("new", null)], [analysis("m", 1)]).newerCheckNotShown).toBe(true);
    expect(deriveDashboard(UID, [check("m", 2), check("q", 1, { status: "questionnaire_only" })], [analysis("m", 2)]).newerCheckNotShown).toBe(false);
    expect(deriveDashboard(UID, [check("m", 1), check("q", 2, { status: "questionnaire_only" })], [analysis("m", 1)]).newerCheckNotShown).toBe(true);
  });

  it("counts starting CHECKS: a retake never adds one, and an earlier record of the newest check is not one", () => {
    const retake = analysis("a", 2, {}, {}, "b");
    expect(deriveDashboard(UID, [check("a", 1)], [analysis("a", 1), retake]).trend.count).toBe(0);
    expect(deriveDashboard(UID, [check("a", 1), check("c", 3)], [analysis("a", 1), retake, analysis("c", 3)]).trend.count).toBe(1);
  });

  it("an invalid primary record gives the scan no reading, as Echo then has none (no fallback to a recovery record)", () => {
    const primary = analysis("s", 1);
    primary.data.schemaVersion = 2;
    const recovery = analysis("s", 2, {}, { persistAttempt: "recovery" }, "c");
    const d = deriveDashboard(UID, [check("s", 1)], [primary, recovery]);
    expect(d.current).toEqual({ kind: "none" });
    expect(echoRecord(UID, "s", [primary, recovery])).toBeNull();
  });

  it("a legacy result with unreadable scores gives no bands, not a crash", () => {
    const d = deriveDashboard(UID, [check("old", 1, { result: { scores: { redness: "x" } } })], []);
    if (d.current.kind !== "reading") throw new Error();
    expect(d.current.view.bands).toBeNull();
  });

  it("no reading: questionnaire-only and failed checks are listed but give no current state", () => {
    const d = deriveDashboard(UID, [check("q", 1, { status: "questionnaire_only", image: null }), check("f", 2, { status: "analysis_failed" })], []);
    expect(d.current).toEqual({ kind: "none" });
    expect(d.history.map((h) => [h.scanId, h.kind])).toEqual([["f", "failed"], ["q", "questions"]]);
  });

  it("ignores analyses that are not a valid skinstate (forged source, unknown schema, id not matching the record)", () => {
    const forged = analysis("x", 3);
    forged.data.source = "client";
    const broken = analysis("y", 4);
    broken.data.schemaVersion = 2;
    const moved = analysis("z", 5);
    moved.id = "z_elsewhere";
    const d = deriveDashboard(UID, [check("x", 3), check("y", 4), check("z", 5)], [forged, broken, moved]);
    expect(d.current).toEqual({ kind: "none" });
    expect(d.history.every((h) => h.kind === "questions")).toBe(true);
  });

  it("a retake: the newest analysis for a scanId is the one shown", () => {
    const first = analysis("s", 1);
    const second = analysis("s", 2, { region_low_confidence: { forehead: true, nose: false, chin: false, cheeks: false } }, {}, "b");
    const d = deriveDashboard(UID, [check("s", 1)], [first, second]);
    if (d.current.kind !== "reading") throw new Error();
    expect(d.current.view.hardToRead).toEqual(["Forehead"]);
  });

  it("photo checks map the client-reported verdict and nothing else", () => {
    for (const verdict of ["pass", "override", "unchecked"] as const) {
      const a = analysis("s", 1);
      a.data.captureQuality = { verdict };
      const d = deriveDashboard(UID, [check("s", 1)], [a]);
      if (d.current.kind !== "reading") throw new Error();
      expect(d.current.view.photoCheck).toBe(verdict);
    }
    const odd = analysis("s", 1);
    odd.data.captureQuality = { verdict: "retake" };
    const d = deriveDashboard(UID, [check("s", 1)], [odd]);
    if (d.current.kind !== "reading") throw new Error();
    expect(d.current.view.photoCheck).toBe("not_recorded");
  });

  it("history is newest first, with a pending timestamp first of all", () => {
    const d = deriveDashboard(UID, [check("a", 1), check("p", null), check("c", 3)], []);
    expect(d.history.map((h) => h.scanId)).toEqual(["p", "c", "a"]);
    expect(d.history[0]!.date).toBeNull();
  });

  it("photo storage comes from the newest check that had a photo", () => {
    const d = deriveDashboard(UID, [check("a", 1, { image: { stored: true } }), check("b", 2, { image: null })], []);
    expect(d.photoKept).toBe(true);
    expect(deriveDashboard(UID, [check("a", 1)], []).photoKept).toBe(false);
  });

  it("carries no score: the only numbers in the view model are the starting-check count", () => {
    const ids = ["a", "b", "c", "d"];
    const d = deriveDashboard(UID, ids.map((s, i) => check(s, i + 1)), ids.map((s, i) => analysis(s, i + 1)));
    const { trend, ...rest } = d;
    expect(numbersIn(rest)).toEqual([]);
    expect(numbersIn(trend).sort()).toEqual([3, 3]);
  });
});

describe("one check at a time", () => {
  const checks = [check("a", 1), check("b", 2, { result: legacyResult }), check("q", 3, { status: "questionnaire_only" }), check("f", 4, { status: "analysis_failed" })];
  const passed = analysis("a", 1);
  passed.data.captureQuality = { verdict: "pass" };
  const analyses = [passed];

  it("a past check carries its date, kind and photo check only: no readings (LONGITUDINAL_METHOD §1)", () => {
    const a = pastCheck(UID, "a", checks, analyses);
    expect(a).toEqual({ scanId: "a", date: day(1), kind: "reading", photoCheck: "pass" });
    expect(Object.keys(a!).sort()).toEqual(["date", "kind", "photoCheck", "scanId"]);
    expect(pastCheck(UID, "b", checks, analyses)).toMatchObject({ kind: "legacy", photoCheck: null });
    expect(pastCheck(UID, "q", checks, analyses)).toMatchObject({ kind: "questions", photoCheck: null });
    expect(pastCheck(UID, "f", checks, analyses)).toMatchObject({ kind: "failed", photoCheck: null });
  });

  it("an unknown id, or an analysis with no check of this user, is not openable", () => {
    expect(pastCheck(UID, "nope", checks, analyses)).toBeNull();
    expect(pastCheck(UID, "../x", checks, analyses)).toBeNull();
    expect(pastCheck(UID, "z", checks, [...analyses, analysis("z", 4)])).toBeNull();
  });

  it("an analysis with no check doc still gives the current state, and is left out of the history", () => {
    const d = deriveDashboard(UID, [], [analysis("z", 4)]);
    expect(d.current.kind).toBe("reading");
    expect(d.history).toEqual([]);
    // Found by the scan browser test: the analysis lands before the questionnaire is saved.
    expect(isEmpty(d)).toBe(false);
    expect(isEmpty(deriveDashboard(UID, [], []))).toBe(true);
  });

  it("echoRecord returns the record Echo will load for the scan, or null", () => {
    expect(echoRecord(UID, "a", analyses)?.scanId).toBe("a");
    expect(echoRecord(UID, "b", analyses)).toBeNull();
  });

  it("picks the record as Echo does: the primary first, even when a recovery record is newer", () => {
    const primary = analysis("s", 1);
    const recovery = analysis("s", 2, { region_low_confidence: { forehead: true, nose: false, chin: false, cheeks: false } }, { persistAttempt: "recovery" }, "c");
    const d = deriveDashboard(UID, [check("s", 1)], [recovery, primary]);
    if (d.current.kind !== "reading") throw new Error();
    expect(d.current.view.hardToRead).toEqual([]);
    expect(echoRecord(UID, "s", [recovery, primary])?.persistAttempt).toBeUndefined();
  });
});

describe("withdrawal outcome", () => {
  it("saved on 2xx, stale on 409 (VERSION_STALE), retry otherwise", () => {
    expect(withdrawalOutcome(200)).toBe("saved");
    expect(withdrawalOutcome(409)).toBe("stale");
    for (const s of [400, 401, 429, 500]) expect(withdrawalOutcome(s)).toBe("retry");
  });
});

describe("AI-share consent status (same rule as the server's latestGrant)", () => {
  const entry = (granted: boolean, d: number | null, version = AI_SHARE_CONSENT_VERSION, purpose = "ai_share"): Doc => ({
    id: `${granted}-${d}`,
    data: { purpose, granted, version, recordedAt: d === null ? null : day(d) },
  });

  it("not asked when there is no entry at the current version", () => {
    expect(aiShareStatus([])).toBe("not_asked");
    expect(aiShareStatus([entry(true, 1, "ai share old version")])).toBe("not_asked");
    expect(aiShareStatus([entry(true, 1, AI_SHARE_CONSENT_VERSION, "processing")])).toBe("not_asked");
  });

  it("the newest entry wins", () => {
    expect(aiShareStatus([entry(true, 1)])).toBe("on");
    expect(aiShareStatus([entry(true, 1), entry(false, 2)])).toBe("off");
    expect(aiShareStatus([entry(false, 2), entry(true, 3)])).toBe("on");
  });

  it("a pending timestamp counts as the newest", () => {
    expect(aiShareStatus([entry(true, 5), entry(false, null)])).toBe("off");
  });
});
