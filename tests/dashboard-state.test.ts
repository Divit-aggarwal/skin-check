import { describe, expect, it } from "vitest";
import { AI_SHARE_CONSENT_VERSION, IMAGE_RETENTION_CONSENT_VERSION } from "@/lib/consent";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { aiShareStatus, deriveDashboard, photoKeptFrom, echoRecord, isEmpty, pastCheck, withdrawalOutcome, type Doc } from "@/components/dashboard/state";
import { regionRaw, syntheticAnalysis, syntheticNative } from "./synthetic-scan";

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
    expect(d.photo).toBeNull();
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

  it("a retake on an early check never keeps the count below the number needed", () => {
    const ids = ["a", "b", "c", "d", "e"];
    const records = [...ids.map((s, i) => analysis(s, i + 1)), analysis("a", 1, {}, {}, "b")];
    expect(deriveDashboard(UID, ids.map((s, i) => check(s, i + 1)), records).trend).toMatchObject({ kind: "set", count: 3 });
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
    expect(d.photo).toEqual({ scanId: "a", claimsStored: true });
    expect(deriveDashboard(UID, [check("a", 1)], []).photo).toEqual({ scanId: "a", claimsStored: false });
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

  // TD-24 (1) replaces O-D4: an opened check shows its OWN readings (the screen
  // adds the fixed line). Never another check's readings, never two at once.
  it("a past check carries its date, kind, photo check and its own readings only", () => {
    const a = pastCheck(UID, "a", checks, analyses);
    expect(a).toMatchObject({ scanId: "a", date: day(1), kind: "reading", photoCheck: "pass" });
    expect(Object.keys(a!).sort()).toEqual(["date", "kind", "photoCheck", "photoClaimed", "scanId", "view"]);
    expect(a!.view!.scanId).toBe("a");
    expect(a!.view!.bands!.map((b) => b.metric)).not.toContain("hydration");
    // A legacy check shows what its own record saved, marked as legacy.
    expect(pastCheck(UID, "b", checks, analyses)).toMatchObject({ kind: "legacy", photoCheck: null, view: { scanId: "b", source: "legacy" } });
    expect(pastCheck(UID, "q", checks, analyses)).toMatchObject({ kind: "questions", photoCheck: null, view: null });
    expect(pastCheck(UID, "f", checks, analyses)).toMatchObject({ kind: "failed", photoCheck: null, view: null });
  });

  it("an opened check's readings come from that check's record, not the newest one", () => {
    const older = analysis("a", 1);
    const newer = analysis("n", 0);
    newer.data.scores = { ...(newer.data.scores as object), redness: 0.95 };
    older.data.scores = { ...(older.data.scores as object), redness: 0.05 };
    const both = [check("a", 1), check("n", 0)];
    const opened = pastCheck(UID, "a", both, [older, newer])!;
    const band = (v: typeof opened.view) => v!.bands!.find((b) => b.metric === "redness")!.band;
    expect(opened.view!.scanId).toBe("a");
    expect(band(opened.view)).toBe(band(pastCheck(UID, "a", [check("a", 1)], [older])!.view));
    expect(band(opened.view)).not.toBe(band(pastCheck(UID, "n", both, [older, newer])!.view));
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

// Red team (2026-10-04, tracker I02).
describe("red-team fixes", () => {
  it("E-F3: an engine change inside the starting checks never reads as 'set'", () => {
    const ids = ["a", "b", "c", "d"];
    const builds = [BUILD, "sha-0000000000000000000000000000000000000000", BUILD, BUILD];
    const d = deriveDashboard(UID, ids.map((s, i) => check(s, i + 1)), ids.map((s, i) => analysis(s, i + 1, { engine_build: builds[i] })));
    expect(d.trend.engineBoundary).toBe(true);
    expect(d.trend.kind).not.toBe("set");
    // Control: the same checks from one build are set.
    const same = deriveDashboard(UID, ids.map((s, i) => check(s, i + 1)), ids.map((s, i) => analysis(s, i + 1)));
    expect(same.trend.kind).toBe("set");
  });

  it("E-F4: a newest reading whose scores cannot be read offers no Echo chat (the button crashed)", () => {
    const d = deriveDashboard(UID, [check("s1", 1), check("s2", 2)], [analysis("s1", 1), analysis("s2", 2, { scores: { redness: "x" } })]);
    if (d.current.kind === "reading" && d.current.view.scanId === "s2") expect(d.current.view.bands).toBeNull();
    expect(d.echoScanId).not.toBe("s2");
  });

  it("A-F3: out-of-range scores are not a reading", () => {
    const d = deriveDashboard(UID, [check("s1", 1)], [analysis("s1", 1, { scores: { redness: 1e308, oiliness: -5, texture: 42, pores: 0, blemishes: 0.5, hydration: 0.5, pigment: 0.5 } })]);
    if (d.current.kind === "reading") expect(d.current.view.bands).toBeNull();
    expect(d.echoScanId).toBeNull();
  });
});

describe("score range (A-F3)", () => {
  it("scores must be finite numbers between 0 and 1", async () => {
    const { SkinScanScoresSchema } = await import("@/types/skin-scan");
    const ok = { redness: 0, oiliness: 1, texture: 0.5, pores: 0, blemishes: 0.2, hydration: 0.9, pigment: 0.3 };
    expect(SkinScanScoresSchema.safeParse(ok).success).toBe(true);
    for (const bad of [1e308, -5, 42, -0.0001, 1.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(SkinScanScoresSchema.safeParse({ ...ok, redness: bad }).success, String(bad)).toBe(false);
    }
  });

  it("E-F5: the results summary makes no claim about the user's routine", async () => {
    const { summarizeConcerns } = await import("@/lib/skin-check-score");
    const { bandScores } = await import("@/lib/skin-check-rules");
    const low = { redness: 0, oiliness: 0, texture: 0, pores: 0, blemishes: 0, hydration: 1, pigment: 0 };
    const line = summarizeConcerns(low, bandScores(low).bands).summaryLine;
    expect(line).not.toMatch(/keep doing|routine|working/i);
  });
});

// D07 (owner TD-20, option a): the page counts only checks usable on their own
// account for every quantity in every measured region.
describe("starting checks the page counts (D07)", () => {
  const withNose = (px: number) => {
    const raw = Object.fromEntries(["forehead", "nose", "chin", "cheeks"].map((r) => [r, regionRaw(r === "nose" ? px : 30000)]));
    return { region_raw: raw, region_raw_corrected: raw, region_raw_native: raw };
  };
  const ids = ["a", "b", "c", "d"];

  it.each([
    ["a low-pixel region", 500],
    ["a missing region", 0],
  ])("a starting check with %s is not counted", (_name, px) => {
    const d = deriveDashboard(UID, ids.map((s, i) => check(s, i + 1)), ids.map((s, i) => analysis(s, i + 1, i === 1 ? withNose(px) : {})));
    expect(d.trend.count).toBe(2);
    expect(d.trend.kind).toBe("building");
  });

  it("a check with no native statistics is not counted", () => {
    const d = deriveDashboard(UID, ids.map((s, i) => check(s, i + 1)), ids.map((s, i) => {
      const doc = analysis(s, i + 1);
      if (i === 0) for (const k of Object.keys(doc.data)) if (k.endsWith("_native")) delete doc.data[k];
      return doc;
    }));
    expect(d.trend.count).toBe(2);
    expect(d.trend.kind).toBe("building");
  });

  it("control: three usable starting checks are counted and set", () => {
    const d = deriveDashboard(UID, ids.map((s, i) => check(s, i + 1)), ids.map((s, i) => analysis(s, i + 1)));
    expect(d.trend.count).toBe(3);
    expect(d.trend.kind).toBe("set");
  });
});

// H27 (owner TD-20, option a): "kept" is backed by the server's presign ledger entry.
describe("photo kept (H27)", () => {
  const presign = (scanId: string, extra: Record<string, unknown> = {}): Doc => ({
    id: `l-${scanId}`,
    data: { purpose: "image_retention", granted: true, version: IMAGE_RETENTION_CONSENT_VERSION, scanId, source: "presign", ...extra },
  });
  const claim = { scanId: "a", claimsStored: true };

  it("a stored claim with the presign entry for that check: kept", () => {
    expect(photoKeptFrom(claim, [presign("a")])).toBe(true);
  });

  // TD-29 (3): a photo kept under retention version 1 (before the copy said "until I delete my account") is still kept.
  it("an entry at retention version 1 still counts: kept", () => {
    expect(photoKeptFrom(claim, [presign("a", { version: "skin image retention version 1" })])).toBe(true);
  });

  it.each([
    ["no ledger entry", []],
    ["an entry for another check", [presign("b")]],
    ["an entry not written by the presign route", [presign("a", { source: "consent_route" })]],
    ["a refused entry", [presign("a", { granted: false })]],
    ["an entry at another version", [presign("a", { version: "old" })]],
  ])("a stored claim with %s says nothing (never 'kept', never 'not kept')", (_n, ledger) => {
    expect(photoKeptFrom(claim, ledger as Doc[])).toBeNull();
  });

  it("a record that says it was not stored: not kept; no photo at all: nothing", () => {
    expect(photoKeptFrom({ scanId: "a", claimsStored: false }, [])).toBe(false);
    expect(photoKeptFrom(null, [presign("a")])).toBeNull();
  });
});
