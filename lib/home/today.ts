// TD-48: the phone Home's "Today" card. Pure: the clock and data come from the caller.

export type Slot = "AM" | "PM";
export type DueStep = { productId: string; slot: Slot; status: "used" | "skipped" | "unknown" };

/** Morning until 15:00 in the user's own time, then evening. */
export const EVENING_FROM_HOUR = 15;

export function slotNow(now: Date, timeZone: string): Slot {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  return hour < EVENING_FROM_HOUR ? "AM" : "PM";
}

/** The ring: today's routine steps done (used) out of all due today. */
export function ringValues(steps: readonly DueStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.status === "used").length, total: steps.length };
}

export type MainAction = { kind: "check" } | { kind: "step"; step: DueStep } | { kind: "allDone" } | { kind: "slotDone" } | { kind: "none" };

/**
 * One main action, in this order: a due or overdue check; else the next
 * undone step of the current time of day (steps already in routine order);
 * else "all done today" (a quiet state) when every step today is done, or the
 * current time of day is done while the other still waits; none without steps.
 */
export function mainAction(o: { checkDue: boolean; steps: readonly DueStep[]; slot: Slot }): MainAction {
  if (o.checkDue) return { kind: "check" };
  if (o.steps.length === 0) return { kind: "none" };
  const next = o.steps.find((s) => s.slot === o.slot && s.status !== "used");
  if (next) return { kind: "step", step: next };
  return o.steps.every((s) => s.status === "used") ? { kind: "allDone" } : { kind: "slotDone" };
}

const RANK = { Low: 0, Moderate: 1, Elevated: 2 } as const;

/** The two highest levels (ties keep the table's order) and how many more there are. */
export function topReadings<T extends { band: keyof typeof RANK }>(bands: readonly T[], n = 2): { top: T[]; more: number } {
  const top = bands
    .map((b, i) => ({ b, i }))
    .sort((x, y) => RANK[y.b.band] - RANK[x.b.band] || x.i - y.i)
    .slice(0, n)
    .map((x) => x.b);
  return { top, more: Math.max(0, bands.length - top.length) };
}
