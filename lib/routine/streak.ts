import { addDays, type RoutineEvent } from "./events";

// TD-47: Home's routine streak and "days logged". A day counts when it has at
// least one usage event (used or skipped). The day is the event's
// effectiveDate: the user's own calendar date when they logged it, so
// midnight and time zone changes are already settled in the data. Pure.

/** The distinct dates with at least one usage event. */
const loggedDays = (events: readonly Pick<RoutineEvent, "type" | "effectiveDate">[]) =>
  new Set(events.filter((e) => e.type === "usage").map((e) => e.effectiveDate));

/**
 * Days in a row with a log, ending today; when today has nothing logged yet,
 * ending yesterday, so the run does not break before the day is over.
 */
export function routineStreak(events: readonly Pick<RoutineEvent, "type" | "effectiveDate">[], today: string): number {
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
export function daysLoggedLast7(events: readonly Pick<RoutineEvent, "type" | "effectiveDate">[], today: string): number {
  const days = loggedDays(events);
  return Array.from({ length: 7 }, (_, i) => addDays(today, -i)).filter((d) => days.has(d)).length;
}
