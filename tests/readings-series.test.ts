import { describe, expect, it } from "vitest";
import { METRIC_QUANTITY, readingsOverTime, sinceStarted, type SeriesCheck } from "@/lib/readings/series";
import type { CheckView } from "@/components/dashboard/state";

// TD-54 (1): levels per check over time; change slots only behind the engine's gate.
const view = (scanId: string, iso: string, band: "Low" | "Moderate" | "Elevated", pipelineVersion = "scan-0.1.6-provisional"): CheckView => ({
  scanId,
  date: new Date(iso),
  source: "measured",
  bands: [{ metric: "redness", label: "Redness", band }],
  areas: [],
  hardToRead: [],
  photoCheck: "pass",
  pipelineVersion,
});
const check = (v: CheckView): SeriesCheck => ({ view: v, state: null, photos: { front: true, left: false, right: false } });
const now = new Date("2026-10-15T12:00:00+05:30");
const checks = [
  check(view("c3", "2026-10-14T09:00:00+05:30", "Low")),
  check(view("c1", "2026-07-01T09:00:00+05:30", "Elevated", "scan-0.1.5")),
  check(view("c2", "2026-09-30T09:00:00+05:30", "Moderate")),
];

describe("readings over time (TD-54)", () => {
  it("no reading has a validated quantity yet (C12)", () => {
    expect(METRIC_QUANTITY).toEqual({});
  });

  it("lists each check's stored level, oldest first, inside the window", () => {
    const r = readingsOverTime(checks, "4w", now);
    const redness = r.series.find((s) => s.metric === "redness")!;
    expect(redness.points.map((p) => [p.scanId, p.band])).toEqual([["c2", "Moderate"], ["c3", "Low"]]);
    expect(readingsOverTime(checks, "all", now).series[0]!.points).toHaveLength(3);
  });

  it("a reading the check did not store is a gap, not a guess", () => {
    const oil = readingsOverTime(checks, "all", now).series.find((s) => s.metric === "oiliness")!;
    expect(oil.points.every((p) => p.band === null)).toBe(true);
  });

  it("every change slot is closed: needs more checks, 0 of 3", () => {
    for (const s of readingsOverTime(checks, "all", now).series) expect(s.change).toEqual({ status: "needs_more_checks", comparableCount: 0, needed: 3 });
  });

  it("names checks read by an older engine version", () => {
    expect(readingsOverTime(checks, "all", now).otherVersionScanIds).toEqual(["c1"]);
  });

  it("since started: only checks on or after the start day", () => {
    const r = sinceStarted(checks, "niacinamide-serum", "2026-09-30", now);
    expect(r.readings.series[0]!.points.map((p) => p.scanId)).toEqual(["c2", "c3"]);
  });
});
