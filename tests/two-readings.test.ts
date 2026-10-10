import { describe, expect, it } from "vitest";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { existsSync, readFileSync } from "node:fs";
import { deriveDashboard, pastCheck, readingsOf, type Doc } from "@/components/dashboard/state";
import { DASHBOARD_COPY } from "@/components/dashboard/copy";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { summarizeSkinScanScores } from "@/lib/skin-check-format";
import { ANSWER_TOPICS, OVERLAY_CATEGORIES, PHOTO_METRICS } from "@/lib/skin-check-skus";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// TD-37 (owner, 2026-10-10): Redness and Oiliness are the only readings shown;
// TD-39 replaced the user's own answers under Breakouts, Texture and Dark marks:
// those three are not shown at all.

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

// TD-39 (owner, 2026-10-11): no chips and no "From what you told us" panels
// anywhere. Nothing about Breakouts, Texture or Dark marks shows on a screen
// that shows the photo readings, and nothing there can be chosen.
const SCREENS = ["components/skin-check/SkinCheckDashboard.tsx", "components/dashboard/CheckReadings.tsx", "components/dashboard/DashboardPage.tsx", "components/dashboard/FaceDrawing.tsx", "components/checks/ChecksView.tsx", "components/skin-check/EchoPage.tsx", "components/mesh/FacePhoto.tsx", "components/mesh/MeshLayer.tsx"];

describe("TD-39: one photo, both overlays, one table, nothing to choose", () => {
  it("no screen with the readings names the three, or shows the user's answers about them as a panel", () => {
    for (const f of SCREENS) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/Breakouts|Texture|Dark marks|From what you told us|told-topics|ToldTopics|ToldPanel|SourcesLine|ANSWER_TOPICS/);
    }
    expect(existsSync("lib/told-topics.ts")).toBe(false);
    expect(JSON.stringify(DASHBOARD_COPY)).not.toMatch(/Breakouts|breakouts|Texture|texture|Dark marks|dark marks|told us/);
  });

  it("no chips, no face-area choice, no toggle on any of those screens", () => {
    // Echo's own area choice for the chat is unchanged (TD-39 (5)); its panel only lost the three topics.
    for (const f of SCREENS.filter((f) => !f.endsWith("EchoPage.tsx"))) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/role="tab|tablist|aria-pressed|aria-selected|onSelect|onAreaChange|role="button"|onDragEnd|drag=/);
    }
  });

  it("the photo draws only the two photo readings' overlays, never another", () => {
    const photo = readFileSync("components/mesh/FacePhoto.tsx", "utf8");
    expect(photo).toMatch(/const KEYS = \["redness", "oiliness"\] as const;/);
    expect(photo).not.toMatch(/overlays\?\.\[?["']?(texture|blemishes|pigment|pores|hydration)/);
  });

  it("the table holds level words only: Low, Moderate, Elevated or no reading", () => {
    const d = deriveDashboard(UID, [check("s1", 1)], [analysis("s1", 1)]);
    if (d.current.kind !== "reading") throw new Error("no reading");
    const cells = [d.current.view.bands, ...d.current.view.areas.map((a) => a.bands)].flatMap((b) => (b ?? []).map((x) => x.band));
    expect(cells.length).toBeGreaterThan(0);
    for (const c of cells) expect(["Low", "Moderate", "Elevated"]).toContain(c);
    expect(DASHBOARD_COPY.current.noReading).toBe("No reading");
  });

  it("the new copy passes the D-12 word checks and never claims more than the photo", () => {
    const P = DASHBOARD_COPY.photo;
    const texts = [P.alt, P.failed, P.read, P.legend, P.legendNote, P.mapsOnResults, P.overlayAlt.redness, P.overlayAlt.oiliness, DASHBOARD_COPY.table.caption, DASHBOARD_COPY.table.area, DASHBOARD_COPY.current.known, ...DASHBOARD_COPY.current.notKnown];
    for (const t of texts) expect(bannedWordsIn(t), t).toEqual([]);
    expect(P.legendNote).toMatch(/relative to the rest of your face/);
  });
});
