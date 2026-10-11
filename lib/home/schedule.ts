import { todayIn } from "@/lib/routine/events";

// TD-47: the Next check card. Pure: the clock and time zone come from the caller.

/** How often to check. Named setting, PROVISIONAL (owner brief 2026-10-11). */
export const CHECK_INTERVAL_RULE = Object.freeze({ days: 7, status: "provisional" } as const);

export type NextCheck = { kind: "first" } | { kind: "in"; days: number } | { kind: "today" } | { kind: "overdue"; days: number };

const dayNumber = (isoDate: string) => Date.parse(`${isoDate}T00:00:00Z`) / 86_400_000;

/** Counted in whole calendar days of the user's time zone from the last check, never in hours. */
export function nextCheck(lastCheck: Date | null, now: Date, timeZone: string, every: number = CHECK_INTERVAL_RULE.days): NextCheck {
  if (!lastCheck) return { kind: "first" };
  const left = dayNumber(todayIn(timeZone, lastCheck)) + every - dayNumber(todayIn(timeZone, now));
  return left > 0 ? { kind: "in", days: left } : left === 0 ? { kind: "today" } : { kind: "overdue", days: -left };
}

export const isDue = (n: NextCheck) => n.kind === "today" || n.kind === "overdue";

/** "Good morning" before 12:00, "afternoon" before 17:00, then "evening", in the user's own time. */
export function partOfDay(now: Date, timeZone: string): "morning" | "afternoon" | "evening" {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour < 12 ? "morning" : hour < 17 ? "afternoon" : "evening";
}
