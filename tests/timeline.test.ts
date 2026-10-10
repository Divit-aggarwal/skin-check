import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIMELINE_COPY } from "@/components/timeline/copy";
import { mergeTimeline, dayOf } from "@/components/timeline/timeline";
import type { HistoryRow } from "@/components/dashboard/state";
import type { RoutineEvent } from "@/lib/routine/events";
import { readingsOf } from "@/components/dashboard/state";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { CAUSE, CHANGE, DIAGNOSIS, FORECAST, MEDICAL } from "@/lib/context/lexicon";

// TD-24 (2): checks and routine events on one timeline. D-12 still holds:
// no reading next to a routine entry, no wording that links the two.

const row = (scanId: string, iso: string): HistoryRow => ({ scanId, date: new Date(iso), kind: "reading", photoClaimed: false });
const ev = (eventId: string, effectiveDate: string, recordedAt: string, extra: Partial<RoutineEvent> = {}) =>
  ({ eventId, effectiveDate, recordedAt, type: "usage", productId: "p", slot: "AM", status: "used", timeZone: "Asia/Kolkata", schemaVersion: 1, catalogVersion: "c", source: "user", ...extra }) as RoutineEvent;

describe("mergeTimeline", () => {
  it("newest day first; on one day checks come before routine entries; routine by record time", () => {
    const items = mergeTimeline(
      [row("old", "2026-09-01T06:00:00Z"), row("new", "2026-10-03T06:00:00Z")],
      [ev("e1", "2026-10-03", "2026-10-03T01:00:00Z"), ev("e2", "2026-10-03", "2026-10-03T09:00:00Z"), ev("e3", "2026-09-20", "2026-09-20T01:00:00Z")],
      "2026-10-05"
    );
    expect(items.map((i) => i.key)).toEqual(["c-new", "r-e2", "r-e1", "r-e3", "c-old"]);
  });

  it("days use India time, the routine's own day boundary", () => {
    expect(dayOf(new Date("2026-10-03T20:00:00Z"))).toBe("2026-10-04");
  });

  it("a check item carries its history row only: no reading reaches the timeline", () => {
    const [item] = mergeTimeline([row("a", "2026-10-03T06:00:00Z")], [], "2026-10-05");
    expect(item).toEqual({ kind: "check", key: "c-a", day: "2026-10-03", row: row("a", "2026-10-03T06:00:00Z") });
  });
});

describe("timeline wording and contents (D-12)", () => {
  const strings = (v: unknown): string[] =>
    typeof v === "string" ? [v] : typeof v === "function" ? [String(v("Sample Cleanser", "morning", "Used"))] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

  it("every timeline string passes every banned-word check", () => {
    const all = strings(TIMELINE_COPY);
    expect(all.length).toBeGreaterThan(8);
    for (const s of all) {
      expect(bannedWordsIn(s), s).toEqual([]);
      for (const re of [CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST]) expect(re.test(s), s).toBe(false);
    }
  });

  it("the timeline files never show readings, bands or scores", () => {
    for (const f of ["components/timeline/TimelineList.tsx", "components/timeline/timeline.ts"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/CheckReadings|ReadingRows|readingsOf|bands|\/100|scores/);
    }
  });
});

describe("readings as every screen shows them", () => {
  const s = { redness: 0.9, oiliness: 0.5, texture: 0.4, pores: 0, blemishes: 0.2, hydration: 0.9, pigment: 0.5 };
  it("whole face and each face area: band words, no Dryness row, areas in a fixed order", () => {
    const r = readingsOf({ scores: s, region_scores: { chin: s, forehead: s }, region_low_confidence: { chin: true } });
    // TD-37 (1): Redness and Oiliness only (was five).
    expect(r.bands!.map((b) => b.label)).toEqual(["Redness", "Oiliness"]);
    for (const a of r.areas) expect(a.bands?.map((b) => b.label) ?? []).not.toContain("Breakouts");
    expect(r.areas.map((a) => a.region)).toEqual(["forehead", "chin"]);
    for (const a of r.areas) expect(a.bands!.every((b) => ["Low", "Moderate", "Elevated"].includes(b.band))).toBe(true);
    expect(r.hardToRead).toEqual(["Chin"]);
  });

  it("unreadable scores give no bands, and a missing area list gives none", () => {
    expect(readingsOf({ scores: { redness: "x" } })).toEqual({ bands: null, areas: [], hardToRead: [] });
  });
});
