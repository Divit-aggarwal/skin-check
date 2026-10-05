import type { HistoryRow } from "@/components/dashboard/state";
import type { RoutineEvent } from "@/lib/routine/events";

// TD-24 (2): the user's checks and routine events on one timeline, newest
// first. A check item carries its row (date, kind) and nothing else: no
// reading ever sits next to a routine entry (LONGITUDINAL_METHOD §1, D-12).

export type TimelineItem =
  | { kind: "check"; key: string; day: string; row: HistoryRow }
  | { kind: "routine"; key: string; day: string; event: RoutineEvent };

/** A Date as an India-time calendar day, the routine's own day boundary (TD-18 (2)). */
export function dayOf(date: Date, timeZone = "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

/** Newest first. Same-day order: checks before routine entries, then by record time. Pure. */
export function mergeTimeline(history: readonly HistoryRow[], events: readonly RoutineEvent[], today: string): TimelineItem[] {
  const checks: TimelineItem[] = history.map((row) => ({ kind: "check", key: `c-${row.scanId}`, day: row.date ? dayOf(row.date) : today, row }));
  const routine: TimelineItem[] = events.map((event) => ({ kind: "routine", key: `r-${event.eventId}`, day: event.effectiveDate, event }));
  const at = (i: TimelineItem) => (i.kind === "check" ? (i.row.date?.toISOString() ?? "9") : i.event.recordedAt);
  return [...checks, ...routine].sort(
    (a, b) => (a.day === b.day ? (a.kind === b.kind ? (at(a) < at(b) ? 1 : -1) : a.kind === "check" ? -1 : 1) : a.day < b.day ? 1 : -1)
  );
}
