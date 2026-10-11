import { describe, expect, it } from "vitest";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { existsSync, readFileSync } from "node:fs";
import { deriveDashboard, pastCheck, readingsOf, type Doc } from "@/components/dashboard/state";
import { DASHBOARD_COPY } from "@/components/dashboard/copy";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { summarizeSkinScanScores } from "@/lib/skin-check-format";
import { EARLY_ESTIMATE_METRICS, OVERLAY_CATEGORIES, PHOTO_METRICS, SHOWN_METRICS } from "@/lib/skin-check-skus";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// TD-40 (owner, 2026-10-11): the table shows all five readings again, on every
// screen and for old checks; Breakouts, Texture and Dark marks are tagged
// "early estimate". The photo still draws only the Redness and Oiliness overlays.

const UID = "SYNTH_UID";
const day = (d: number) => new Date(Date.UTC(2026, 9, d, 10));
const LOUD = { redness: 0.1, oiliness: 0.1, texture: 1, pores: 0, blemishes: 1, hydration: 0, pigment: 1 };
const FIVE = ["redness", "oiliness", "blemishes", "texture", "pigment"];

function analysis(scanId: string, d: number): Doc {
  const sha = scanId.padEnd(64, "0").replace(/[^0-9a-f]/g, "a");
  const result = { ...syntheticAnalysis(), ...syntheticNative(), scores: LOUD, pipeline_version: "scan-0.1.6-provisional", engine_build: "sha-x" };
  const data = buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId, inputSha256: sha, requestId: `r-${scanId}`, captureMethod: "native" });
  return { id: scanAnalysisDocId(scanId, sha), data: { ...data, createdAt: day(d) } };
}
const check = (id: string, d: number, extra: Record<string, unknown> = {}): Doc => ({ id, data: { scanId: id, status: "completed", answers: {}, createdAt: day(d), ...extra } });

describe("TD-40: what is shown", () => {
  it("five readings in table order, three early estimates, two overlays requested", () => {
    expect(SHOWN_METRICS).toEqual(FIVE);
    expect(EARLY_ESTIMATE_METRICS).toEqual(["blemishes", "texture", "pigment"]);
    expect(PHOTO_METRICS).toEqual(["redness", "oiliness"]);
    expect(OVERLAY_CATEGORIES).toEqual(["redness", "oiliness"]);
  });

  it("a measured check shows all five, whole face and every area, never Dryness", () => {
    const d = deriveDashboard(UID, [check("s1", 1)], [analysis("s1", 1)]);
    if (d.current.kind !== "reading") throw new Error("no reading");
    expect(d.current.view.bands?.map((b) => b.metric)).toEqual(FIVE);
    for (const a of d.current.view.areas) expect(a.bands?.map((b) => b.metric) ?? []).toEqual(a.bands ? FIVE : []);
    expect(JSON.stringify(d.current.view)).not.toMatch(/Dryness|hydration/);
  });

  it("an old check saved by the app (legacy) shows the same five", () => {
    const legacy = check("old", 1, { result: { scores: LOUD, regions: [], region_scores: { chin: LOUD }, pipeline_version: "scan-0.1.4" } });
    const past = pastCheck(UID, "old", [legacy], []);
    expect(past?.view?.source).toBe("legacy");
    expect(past?.view?.bands?.map((b) => b.metric)).toEqual(FIVE);
    expect(past?.view?.areas[0]?.bands?.map((b) => b.metric)).toEqual(FIVE);
  });

  it("Echo's panel and the results screen (readingsOf) show the same five labels", () => {
    expect(readingsOf({ scores: LOUD }).bands?.map((b) => b.label)).toEqual(["Redness", "Oiliness", "Breakouts", "Texture", "Dark marks"]);
  });

  it("summary line and top concerns can name the three again, never Dryness", () => {
    const { bands } = bandScores(LOUD);
    expect(bands.blemishes).toBe("Elevated");
    expect(summarizeConcerns(LOUD, bands).topConcerns.sort()).toEqual(["blemishes", "pigment", "texture"]);
    const dry = { ...LOUD, hydration: 0 };
    expect(summarizeConcerns(dry, bandScores(dry).bands).topConcerns).not.toContain("hydration");
  });

  it("the legacy Echo prompt lists five readings, the three marked early estimate", () => {
    const lines = summarizeSkinScanScores(LOUD).split("\n");
    expect(lines.map((l) => l.split(":")[0])).toEqual(["Redness", "Oiliness", "Texture irregularity", "Blemishes", "Pigmentation"]);
    expect(lines.filter((l) => l.endsWith("(early estimate)")).length).toBe(3);
  });

  it("the table header tags the three as early estimate, and fits a phone in its own scroll box", () => {
    const src = readFileSync("components/dashboard/CheckReadings.tsx", "utf8");
    expect(src).toMatch(/isEarlyEstimate\(b\.metric\) && <span[^>]*>\{C\.table\.earlyEstimate\}/);
    expect(src).toMatch(/overflow-x-auto/);
    expect(DASHBOARD_COPY.table.earlyEstimate).toBe("early estimate");
    expect(readFileSync("components/skin-check/EchoPage.tsx", "utf8")).toMatch(/<ReadingsTable view=\{readings\} \/>/);
  });
});

// TD-39 (owner, 2026-10-11): no chips and no "From what you told us" panels
// anywhere, and nothing on these screens can be chosen.
const SCREENS = ["components/skin-check/SkinCheckDashboard.tsx", "components/dashboard/CheckReadings.tsx", "components/dashboard/DashboardPage.tsx", "components/dashboard/FaceDrawing.tsx", "components/checks/ChecksView.tsx", "components/skin-check/EchoPage.tsx", "components/mesh/FacePhoto.tsx", "components/mesh/MeshLayer.tsx"];

describe("TD-39: one photo, both overlays, one table, nothing to choose", () => {
  it("no \"From what you told us\" panels or told-topic code on any screen", () => {
    for (const f of SCREENS) expect(readFileSync(f, "utf8"), f).not.toMatch(/From what you told us|told-topics|ToldTopics|ToldPanel|SourcesLine|ANSWER_TOPICS/);
    expect(existsSync("lib/told-topics.ts")).toBe(false);
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
    const texts = [P.alt, P.failed, P.read, P.legend, P.legendNote, P.mapsOnResults, P.overlayAlt.redness, P.overlayAlt.oiliness, DASHBOARD_COPY.table.caption, DASHBOARD_COPY.table.area, DASHBOARD_COPY.table.earlyEstimate, DASHBOARD_COPY.current.known, ...DASHBOARD_COPY.current.notKnown];
    for (const t of texts) expect(bannedWordsIn(t), t).toEqual([]);
    expect(P.legendNote).toMatch(/relative to the rest of your face/);
  });
});
