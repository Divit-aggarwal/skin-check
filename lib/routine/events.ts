import { z } from "zod";
import { IsoDate } from "@/lib/catalog/schema";

// E03. A routine is the user's own record of which products they use and when
// (docs/lanes/routine-design.md §2.2). Every change is a new, permanent event;
// the current routine is computed from the events on every read, never stored.
// Purpose (R-1 A): the user keeps and sees their own record. No analytics, no
// Gemini, no join to scans.
export const ROUTINE_EVENT_SCHEMA_VERSION = 1 as const;

/** R-5 B: the one unnamed "other product (not ours)" entry. Not a catalogue row. */
export const OTHER_PRODUCT_ID = "other-not-ours";
export const DEFAULT_TIME_ZONE = "Asia/Kolkata";

export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date "now" is in `timeZone`, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 0 = Sunday. */
export function weekdayOf(date: string): number {
  return new Date(`${date}T00:00:00Z`).getUTCDay();
}

const ProductId = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/);
const Weekday = z.number().int().min(0).max(6);

export const ScheduleSchema = z.strictObject({
  slot: z.enum(["AM", "PM", "AM_PM"]),
  days: z
    .array(Weekday)
    .min(1)
    .refine((d) => new Set(d).size === d.length, "duplicate day"),
});

const common = {
  eventId: z.uuidv4().refine((s) => s === s.toLowerCase(), "lowercase only"),
  productId: ProductId,
  effectiveDate: IsoDate,
  timeZone: z.string().refine(isTimeZone, "not an IANA time zone").default(DEFAULT_TIME_ZONE),
};

/** What the client sends to POST /api/routine/events. Strict at every level. */
export const RoutineEventInputSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("start"), ...common, schedule: ScheduleSchema }),
  z.strictObject({ type: z.literal("stop"), ...common }),
  z
    .strictObject({ type: z.literal("substitute"), ...common, toProductId: ProductId, schedule: ScheduleSchema })
    .refine((e) => e.toProductId !== e.productId, { message: "same product", path: ["toProductId"] }),
  z.strictObject({ type: z.literal("schedule_change"), ...common, schedule: ScheduleSchema }),
  z.strictObject({
    type: z.literal("usage"),
    ...common,
    slot: z.enum(["AM", "PM"]),
    status: z.enum(["used", "skipped"]),
  }),
]);

export type Schedule = z.infer<typeof ScheduleSchema>;
export type RoutineEventInput = z.infer<typeof RoutineEventInputSchema>;

/** A stored event as read back: input + server fields, `recordedAt` as ISO time. */
export type RoutineEvent = RoutineEventInput & {
  schemaVersion: typeof ROUTINE_EVENT_SCHEMA_VERSION;
  catalogVersion: string;
  recordedAt: string;
  source: "user";
};

export type RoutineItem = { productId: string; schedule: Schedule; since: string };

/** Deterministic apply order: effectiveDate, then recordedAt, then eventId. Does not mutate. */
export function sortEvents<T extends Pick<RoutineEvent, "effectiveDate" | "recordedAt" | "eventId">>(
  events: readonly T[]
): T[] {
  const key = (e: T) => [e.effectiveDate, e.recordedAt, e.eventId] as const;
  return [...events].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)];
    for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i]! < kb[i]! ? -1 : 1;
    return 0;
  });
}

/**
 * The routine on `onDate`. A start on D includes D; a stop on D excludes D.
 * Odd sequences (stop with no start, double start) have no effect and never throw.
 */
export function currentRoutine(events: readonly RoutineEvent[], onDate: string): RoutineItem[] {
  const active = new Map<string, RoutineItem>();
  for (const e of sortEvents(events)) {
    if (e.effectiveDate > onDate) break;
    switch (e.type) {
      case "start":
        if (!active.has(e.productId)) active.set(e.productId, { productId: e.productId, schedule: e.schedule, since: e.effectiveDate });
        break;
      case "stop":
        active.delete(e.productId);
        break;
      case "substitute": {
        active.delete(e.productId);
        const to = active.get(e.toProductId);
        active.set(e.toProductId, { productId: e.toProductId, schedule: e.schedule, since: to?.since ?? e.effectiveDate });
        break;
      }
      case "schedule_change": {
        const item = active.get(e.productId);
        if (item) active.set(e.productId, { ...item, schedule: e.schedule });
        break;
      }
    }
  }
  return Array.from(active.values());
}
