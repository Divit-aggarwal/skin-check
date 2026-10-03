import { addDays, currentRoutine, sortEvents, weekdayOf, type RoutineEvent } from "./events";

// E04. What the user reported for each expected slot: used, skipped, or
// nothing (unknown). A missing log is never "skipped". Counts only: no rate,
// no score, no threshold. Pure: `today` comes from the caller; no clock here.

export type AdherenceStatus = "used" | "skipped" | "unknown";
export type AdherenceDay = { date: string; productId: string; slot: "AM" | "PM"; status: AdherenceStatus };
export type Adherence = { days: AdherenceDay[]; counts: Record<AdherenceStatus, number> };

export function adherence(
  events: readonly RoutineEvent[],
  { from, to, today }: { from: string; to: string; today: string }
): Adherence {
  if (from > to) throw new RangeError(`adherence: from ${from} is after to ${to}`);

  // Latest usage log per (product, date, slot), in the deterministic event order.
  const logged = new Map<string, "used" | "skipped">();
  for (const e of sortEvents(events)) {
    if (e.type === "usage") logged.set(`${e.productId}|${e.effectiveDate}|${e.slot}`, e.status);
  }

  const days: AdherenceDay[] = [];
  const counts = { used: 0, skipped: 0, unknown: 0 };
  const last = to < today ? to : today;
  // ponytail: recomputes the routine per day, O(days × events); fine for a 7-day window.
  for (let date = from; date <= last; date = addDays(date, 1)) {
    const weekday = weekdayOf(date);
    for (const item of currentRoutine(events, date)) {
      if (!item.schedule.days.includes(weekday)) continue;
      const slots = item.schedule.slot === "AM_PM" ? (["AM", "PM"] as const) : [item.schedule.slot];
      for (const slot of slots) {
        const status = logged.get(`${item.productId}|${date}|${slot}`) ?? "unknown";
        counts[status] += 1;
        days.push({ date, productId: item.productId, slot, status });
      }
    }
  }
  return { days, counts };
}
