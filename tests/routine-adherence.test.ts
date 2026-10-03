import { describe, expect, it } from "vitest";
import { adherence } from "@/lib/routine/adherence";
import type { RoutineEvent } from "@/lib/routine/events";

const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
let seq = 0;
function ev(e: Record<string, unknown> & { type: RoutineEvent["type"] }): RoutineEvent {
  seq += 1;
  return {
    eventId: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    productId: "a",
    effectiveDate: "2026-10-01",
    timeZone: "Asia/Kolkata",
    schemaVersion: 1,
    catalogVersion: "c",
    recordedAt: `2026-10-10T00:${String(Math.floor(seq / 60) % 60).padStart(2, "0")}:${String(seq % 60).padStart(2, "0")}.000Z`,
    source: "user",
    ...e,
  } as RoutineEvent;
}
const start = (date: string, slot = "AM", days = EVERY_DAY, productId = "a") =>
  ev({ type: "start", productId, effectiveDate: date, schedule: { slot, days } });
const use = (date: string, status: "used" | "skipped", slot = "AM", productId = "a") =>
  ev({ type: "usage", productId, effectiveDate: date, slot, status });
const statuses = (r: ReturnType<typeof adherence>) => r.days.map((d) => `${d.date} ${d.productId} ${d.slot} ${d.status}`);
const win = (from: string, to: string, today = "2030-01-01") => ({ from, to, today });

describe("E04 adherence", () => {
  it("used, skipped and unknown from a mixed sequence", () => {
    const r = adherence([start("2026-10-01"), use("2026-10-01", "used"), use("2026-10-02", "skipped")], win("2026-10-01", "2026-10-03"));
    expect(statuses(r)).toEqual(["2026-10-01 a AM used", "2026-10-02 a AM skipped", "2026-10-03 a AM unknown"]);
    expect(r.counts).toEqual({ used: 1, skipped: 1, unknown: 1 });
  });

  it("a window with zero logs: every expected slot is unknown, skipped is 0", () => {
    const r = adherence([start("2026-10-01", "AM_PM")], win("2026-10-01", "2026-10-07"));
    expect(r.counts).toEqual({ used: 0, skipped: 0, unknown: 14 });
  });

  it("a missing day between two used days is unknown, not skipped", () => {
    const r = adherence([start("2026-10-01"), use("2026-10-01", "used"), use("2026-10-03", "used")], win("2026-10-01", "2026-10-03"));
    expect(r.days[1]!.status).toBe("unknown");
    expect(r.counts.skipped).toBe(0);
  });

  it("a later log for the same product, date and slot replaces the earlier one", () => {
    const r = adherence([start("2026-10-01"), use("2026-10-01", "skipped"), use("2026-10-01", "used")], win("2026-10-01", "2026-10-01"));
    expect(statuses(r)).toEqual(["2026-10-01 a AM used"]);
    // Same recordedAt: eventId decides, regardless of array order.
    const t = "2026-10-10T00:00:00.000Z";
    const x = ev({ type: "usage", effectiveDate: "2026-10-01", slot: "AM", status: "used", recordedAt: t, eventId: "00000000-0000-4000-8000-0000000000aa" });
    const y = ev({ type: "usage", effectiveDate: "2026-10-01", slot: "AM", status: "skipped", recordedAt: t, eventId: "00000000-0000-4000-8000-0000000000ab" });
    for (const order of [[x, y], [y, x]]) {
      expect(adherence([start("2026-10-01"), ...order], win("2026-10-01", "2026-10-01")).days[0]!.status).toBe("skipped");
    }
  });

  it("AM_PM gives two slots a day, AM one", () => {
    expect(adherence([start("2026-10-01", "AM_PM")], win("2026-10-01", "2026-10-01")).days.map((d) => d.slot)).toEqual(["AM", "PM"]);
    expect(adherence([start("2026-10-01", "AM")], win("2026-10-01", "2026-10-01")).days).toHaveLength(1);
  });

  it("an unscheduled weekday is not listed; an unexpected usage log is ignored", () => {
    // 2026-10-04 is a Sunday (0), 2026-10-05 a Monday (1).
    const r = adherence([start("2026-10-01", "AM", [1]), use("2026-10-04", "used"), use("2026-10-05", "used", "PM")], win("2026-10-04", "2026-10-05"));
    expect(statuses(r)).toEqual(["2026-10-05 a AM unknown"]);
  });

  describe("date edges", () => {
    it("start day included, stop day excluded", () => {
      const r = adherence([start("2026-10-02"), ev({ type: "stop", effectiveDate: "2026-10-04" })], win("2026-10-01", "2026-10-05"));
      expect(r.days.map((d) => d.date)).toEqual(["2026-10-02", "2026-10-03"]);
    });

    it("a substitution on D splits cleanly", () => {
      const sub = ev({ type: "substitute", effectiveDate: "2026-10-02", toProductId: "b", schedule: { slot: "AM", days: EVERY_DAY } });
      const r = adherence([start("2026-10-01"), sub], win("2026-10-01", "2026-10-03"));
      expect(r.days.map((d) => `${d.date} ${d.productId}`)).toEqual(["2026-10-01 a", "2026-10-02 b", "2026-10-03 b"]);
    });

    it("today included, tomorrow excluded", () => {
      const r = adherence([start("2026-10-01")], win("2026-10-01", "2026-10-10", "2026-10-03"));
      expect(r.days.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02", "2026-10-03"]);
    });

    it("from === to", () => {
      expect(adherence([start("2026-10-01")], win("2026-10-05", "2026-10-05")).days).toHaveLength(1);
    });

    it("month end and 29 Feb 2028", () => {
      expect(adherence([start("2026-01-01")], win("2026-01-30", "2026-02-02")).days.map((d) => d.date)).toEqual([
        "2026-01-30", "2026-01-31", "2026-02-01", "2026-02-02",
      ]);
      expect(adherence([start("2028-01-01")], win("2028-02-28", "2028-03-01")).days.map((d) => d.date)).toEqual([
        "2028-02-28", "2028-02-29", "2028-03-01",
      ]);
    });

    it("from > to throws", () => {
      expect(() => adherence([], win("2026-10-02", "2026-10-01"))).toThrow(RangeError);
    });
  });

  it("returns counts and no rate field", () => {
    const r = adherence([start("2026-10-01"), use("2026-10-01", "used")], win("2026-10-01", "2026-10-02"));
    expect(Object.keys(r).sort()).toEqual(["counts", "days"]);
    expect(Object.keys(r.counts).sort()).toEqual(["skipped", "unknown", "used"]);
  });
});
