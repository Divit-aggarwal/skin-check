import { describe, expect, it } from "vitest";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { checkAnswers, deriveDashboard, pastCheck, readingsOf, type Doc } from "@/components/dashboard/state";
import { DASHBOARD_COPY } from "@/components/dashboard/copy";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { summarizeSkinScanScores } from "@/lib/skin-check-format";
import { ANSWER_TOPICS, OVERLAY_CATEGORIES, PHOTO_METRICS } from "@/lib/skin-check-skus";
import { toldTopics } from "@/lib/told-topics";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// TD-37 (owner, 2026-10-10): Redness and Oiliness are the only readings shown;
// Breakouts, Texture and Dark marks are shown as the user's own answers.

const UID = "SYNTH_UID";
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 10));
// The three hidden scores at their highest, so any leak would show as Elevated.
const LOUD = { redness: 0.1, oiliness: 0.1, texture: 1, pores: 0, blemishes: 1, hydration: 0, pigment: 1 };
const HIDDEN_LABELS = /Breakouts|Texture|Dark marks|blemish|pigment/i;

function analysis(scanId: string, d: number): Doc {
  const sha = scanId.padEnd(64, "0").replace(/[^0-9a-f]/g, "a");
  const result = { ...syntheticAnalysis(), ...syntheticNative(), scores: LOUD, pipeline_version: "scan-0.1.6-provisional", engine_build: "sha-x" };
  const data = buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId, inputSha256: sha, requestId: `r-${scanId}`, captureMethod: "native" });
  return { id: scanAnalysisDocId(scanId, sha), data: { ...data, createdAt: day(d) } };
}
const check = (id: string, d: number, extra: Record<string, unknown> = {}): Doc => ({ id, data: { scanId: id, status: "completed", answers: {}, createdAt: day(d), ...extra } });

describe("TD-37: what is shown", () => {
  it("one shared list: two photo readings, three answer topics, two overlays requested", () => {
    expect(PHOTO_METRICS).toEqual(["redness", "oiliness"]);
    expect(ANSWER_TOPICS).toEqual(["blemishes", "texture", "pigment"]);
    expect(OVERLAY_CATEGORIES).toEqual(["redness", "oiliness"]);
  });

  it("a measured check shows Redness and Oiliness only, whole face and every area", () => {
    const d = deriveDashboard(UID, [check("s1", 1)], [analysis("s1", 1)]);
    if (d.current.kind !== "reading") throw new Error("no reading");
    expect(d.current.view.bands?.map((b) => b.metric)).toEqual(["redness", "oiliness"]);
    for (const a of d.current.view.areas) expect(a.bands?.map((b) => b.metric) ?? []).toEqual(a.bands ? ["redness", "oiliness"] : []);
    expect(JSON.stringify(d.current.view)).not.toMatch(HIDDEN_LABELS);
  });

  it("the server record still holds all five values, unchanged (TD-37 (4))", () => {
    const rec = analysis("s1", 1).data as { scores: Record<string, number> };
    expect(rec.scores).toMatchObject({ texture: 1, blemishes: 1, pigment: 1, redness: 0.1, oiliness: 0.1 });
  });

  it("an old check saved by the app (legacy) follows the same rule", () => {
    const legacy = check("old", 1, { result: { scores: LOUD, regions: [], region_scores: { chin: LOUD }, pipeline_version: "scan-0.1.4" } });
    const past = pastCheck(UID, "old", [legacy], []);
    expect(past?.view?.source).toBe("legacy");
    expect(past?.view?.bands?.map((b) => b.metric)).toEqual(["redness", "oiliness"]);
    expect(past?.view?.areas[0]?.bands?.map((b) => b.metric)).toEqual(["redness", "oiliness"]);
  });

  it("Echo's panel and the results screen (readingsOf) show the same two", () => {
    expect(readingsOf({ scores: LOUD }).bands?.map((b) => b.label)).toEqual(["Redness", "Oiliness"]);
  });

  it("summary line and top concerns never name a hidden reading, even at Elevated", () => {
    const { bands } = bandScores(LOUD);
    expect(bands.blemishes).toBe("Elevated");
    const s = summarizeConcerns(LOUD, bands);
    expect(s.topConcerns).toEqual([]);
    expect(s.summaryLine).toBe("Nothing stood out in this photo.");
    const high = { ...LOUD, redness: 0.9 };
    expect(summarizeConcerns(high, bandScores(high).bands).topConcerns).toEqual(["redness"]);
  });

  it("the legacy Echo prompt lists two readings", () => {
    expect(summarizeSkinScanScores(LOUD).split("\n").map((l) => l.split(":")[0])).toEqual(["Redness", "Oiliness"]);
  });
});

describe("TD-37 (3): the three topics from the user's own answers", () => {
  it("answered: each topic quotes only its own questions, as option labels", () => {
    const topics = toldTopics({
      primary_concerns: ["blemishes", "redness"],
      breakout_pattern: "papules_pustules",
      acne_areas: ["chin_jawline"],
      pih_scar_tendency: "dark_mark_lingers",
      female_skin_context: ["period_related_breakouts"],
    })!;
    expect(topics.map((t) => t.label)).toEqual(["Breakouts", "Texture", "Dark marks"]);
    const [breakouts, texture, marks] = topics;
    expect(breakouts!.lines[0]).toBe("You chose breakouts as a main skin concern.");
    expect(breakouts!.lines.join(" ")).toContain("Chin / jawline");
    expect(texture!.lines).toEqual([]);
    expect(marks!.lines).toEqual(["When a breakout heals: Leaves a dark mark that lingers."]);
    // A personal-context answer never shows under a topic.
    expect(JSON.stringify(topics)).not.toMatch(/period/i);
  });

  it("answered, nothing on a topic: an empty list (the screen says they did not mention it)", () => {
    expect(toldTopics({ skin_type: "oily" })!.every((t) => t.lines.length === 0)).toBe(true);
    expect(DASHBOARD_COPY.told.nothing("texture")).toBe("You did not tell us anything about texture in the questions.");
  });

  it("skipped: null, so the screen invites the user to answer", () => {
    expect(toldTopics({})).toBeNull();
    expect(toldTopics({ name: "A", age: "25-34", gender: "male" })).toBeNull();
    expect(toldTopics(null)).toBeNull();
  });

  it("answers given later count for the check, and an unknown value is never echoed", () => {
    const checks = [check("s1", 1, { answers: { name: "A" }, questionnaire: "skipped" })];
    const later = [{ id: "s1", data: { answers: { primary_concerns: ["texture"], pih_scar_tendency: "made_up" } } }];
    const topics = toldTopics(checkAnswers("s1", checks, later))!;
    expect(topics[1]!.lines).toEqual(["You chose texture as a main skin concern."]);
    expect(topics[2]!.lines).toEqual([]);
  });

  it("the new copy passes the D-12 word checks and never claims a measurement", () => {
    const C = DASHBOARD_COPY.told;
    const texts = [C.sources, C.title, C.ownAnswer, C.listTitle, C.nothing("breakouts"), C.skipped("dark marks"), DASHBOARD_COPY.current.known, ...DASHBOARD_COPY.current.notKnown];
    for (const t of texts) expect(bannedWordsIn(t), t).toEqual([]);
    expect(C.sources).toMatch(/does not measure them/);
  });
});
