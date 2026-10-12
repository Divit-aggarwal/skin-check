import { addDays, sortEvents, type RoutineEvent } from "./events";

// TD-47: Home's routine streak and "days logged". A day counts when it has at
// least one usage event (used or skipped). The day is the event's
// effectiveDate: the user's own calendar date when they logged it, so
// midnight and time zone changes are already settled in the data. Pure.

type Ev = Pick<RoutineEvent, "type" | "effectiveDate"> & Partial<Pick<RoutineEvent, "recordedAt" | "eventId">> & { productId?: string; slot?: string; status?: string };

/**
 * The distinct dates with at least one logged step. For each product, day
 * and slot the latest usage event decides (TD-49): "cleared" is not logged.
 */
function loggedDays(events: readonly Ev[]): Set<string> {
  const latest = new Map<string, Ev>();
  const usage = events.filter((e) => e.type === "usage").map((e) => ({ recordedAt: "", eventId: "", ...e }));
  for (const e of sortEvents(usage)) latest.set(`${e.productId}|${e.effectiveDate}|${e.slot}`, e);
  return new Set(Array.from(latest.values()).filter((e) => e.status !== "cleared").map((e) => e.effectiveDate));
}

/**
 * Days in a row with a log, ending today; when today has nothing logged yet,
 * ending yesterday, so the run does not break before the day is over.
 */
export function routineStreak(events: readonly Ev[], today: string): number {
  const days = loggedDays(events);
  let day = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(day)) {
    n += 1;
    day = addDays(day, -1);
  }
  return n;
}

/** Days with a log in the 7 days ending today. */
export function daysLoggedLast7(events: readonly Ev[], today: string): number {
  const days = loggedDays(events);
  return Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((d) => days.has(d)).length;
}
