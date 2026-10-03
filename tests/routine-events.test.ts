import { describe, expect, it } from "vitest";
import {
  OTHER_PRODUCT_ID,
  RoutineEventInputSchema,
  currentRoutine,
  todayIn,
  type RoutineEvent,
} from "@/lib/routine/events";
import { CATALOGUE } from "@/lib/catalog/catalogue";

const SCHED = { slot: "AM_PM", days: [0, 1, 2, 3, 4, 5, 6] } as const;
const base = { eventId: "0f8fad5b-d9cb-469f-a165-70867728950e", productId: "sample-cleanser", effectiveDate: "2026-10-01", timeZone: "Asia/Kolkata" };
const inputs = {
  start: { ...base, type: "start", schedule: SCHED },
  stop: { ...base, type: "stop" },
  substitute: { ...base, type: "substitute", toProductId: "sample-moisturiser", schedule: SCHED },
  schedule_change: { ...base, type: "schedule_change", schedule: SCHED },
  usage: { ...base, type: "usage", slot: "AM", status: "used" },
};
const parses = (x: unknown) => RoutineEventInputSchema.safeParse(x).success;

describe("E03 event input schema", () => {
  it("each event type parses; timeZone defaults to Asia/Kolkata", () => {
    for (const e of Object.values(inputs)) expect(parses(e)).toBe(true);
    const { timeZone: _tz, ...noTz } = inputs.stop;
    void _tz;
    expect(RoutineEventInputSchema.parse(noTz).timeZone).toBe("Asia/Kolkata");
  });

  it("rejects an unknown field at top level and inside schedule", () => {
    expect(parses({ ...inputs.start, uid: "x" })).toBe(false);
    expect(parses({ ...inputs.start, schedule: { ...SCHED, extra: 1 } })).toBe(false);
  });

  it("rejects a missing or non-UUID-v4 eventId", () => {
    const { eventId: _e, ...noId } = inputs.stop;
    void _e;
    expect(parses(noId)).toBe(false);
    expect(parses({ ...inputs.stop, eventId: "abc" })).toBe(false);
    expect(parses({ ...inputs.stop, eventId: "0f8fad5b-d9cb-169f-a165-70867728950e" })).toBe(false);
  });

  it("rejects empty, duplicate or out-of-range days", () => {
    for (const days of [[], [1, 1], [7], [-1], [1.5]]) {
      expect(parses({ ...inputs.start, schedule: { slot: "AM", days } })).toBe(false);
    }
  });

  it("rejects an invalid IANA time zone", () => {
    expect(parses({ ...inputs.stop, timeZone: "Mars/Olympus" })).toBe(false);
  });

  it("rejects usage slot AM_PM and status unknown", () => {
    expect(parses({ ...inputs.usage, slot: "AM_PM" })).toBe(false);
    expect(parses({ ...inputs.usage, status: "unknown" })).toBe(false);
  });

  it("rejects a substitute to the same product", () => {
    expect(parses({ ...inputs.substitute, toProductId: base.productId })).toBe(false);
  });

  it("rejects a bad date and free text in productId", () => {
    expect(parses({ ...inputs.stop, effectiveDate: "2026-02-30" })).toBe(false);
    expect(parses({ ...inputs.stop, productId: "My Prescription Cream" })).toBe(false);
  });

  it("OTHER_PRODUCT_ID parses as productId and toProductId, and is not a catalogue id", () => {
    expect(parses({ ...inputs.start, productId: OTHER_PRODUCT_ID })).toBe(true);
    expect(parses({ ...inputs.substitute, toProductId: OTHER_PRODUCT_ID })).toBe(true);
    expect(CATALOGUE.products.some((p) => p.id === OTHER_PRODUCT_ID)).toBe(false);
  });

  it("todayIn uses the zone's calendar day (Asia/Kolkata midnight)", () => {
    expect(todayIn("Asia/Kolkata", new Date("2026-10-02T18:29:59Z"))).toBe("2026-10-02");
    expect(todayIn("Asia/Kolkata", new Date("2026-10-02T18:30:00Z"))).toBe("2026-10-03");
  });
});

// ── currentRoutine ─────────────────────────────────────────────────────────
let seq = 0;
function ev(e: Partial<RoutineEvent> & Pick<RoutineEvent, "type">): RoutineEvent {
  seq += 1;
  const id = `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`;
  return {
    eventId: id,
    productId: "a",
    effectiveDate: "2026-10-01",
    timeZone: "Asia/Kolkata",
    schemaVersion: 1,
    catalogVersion: "c",
    recordedAt: `2026-10-01T00:00:${String(seq % 60).padStart(2, "0")}.000Z`,
    source: "user",
    ...(e.type === "start" || e.type === "substitute" || e.type === "schedule_change" ? { schedule: SCHED } : {}),
    ...e,
  } as RoutineEvent;
}
const ids = (items: { productId: string }[]) => items.map((i) => i.productId).sort();

describe("E03 currentRoutine", () => {
  it("start on D includes D; stop on D excludes D", () => {
    const events = [ev({ type: "start", effectiveDate: "2026-10-01" }), ev({ type: "stop", effectiveDate: "2026-10-05" })];
    expect(ids(currentRoutine(events, "2026-09-30"))).toEqual([]);
    expect(ids(currentRoutine(events, "2026-10-01"))).toEqual(["a"]);
    expect(ids(currentRoutine(events, "2026-10-04"))).toEqual(["a"]);
    expect(ids(currentRoutine(events, "2026-10-05"))).toEqual([]);
  });

  it("schedule change applies from D and does not move since", () => {
    const pm = { slot: "PM" as const, days: [1] };
    const events = [ev({ type: "start", effectiveDate: "2026-10-01" }), ev({ type: "schedule_change", effectiveDate: "2026-10-03", schedule: pm })];
    expect(currentRoutine(events, "2026-10-02")[0]!.schedule).toEqual(SCHED);
    expect(currentRoutine(events, "2026-10-03")[0]).toEqual({ productId: "a", schedule: pm, since: "2026-10-01" });
  });

  it("a substitution is a new event: old ends and new starts on D; input not mutated", () => {
    const events = Object.freeze([
      ev({ type: "start", effectiveDate: "2026-10-01" }),
      ev({ type: "substitute", effectiveDate: "2026-10-04", toProductId: "b" }),
    ]);
    expect(ids(currentRoutine(events, "2026-10-03"))).toEqual(["a"]);
    expect(currentRoutine(events, "2026-10-04")).toEqual([{ productId: "b", schedule: SCHED, since: "2026-10-04" }]);
    expect(events).toHaveLength(2);
  });

  it("a stop with no start and a double start are harmless", () => {
    const events = [
      ev({ type: "stop", effectiveDate: "2026-09-01" }),
      ev({ type: "start", effectiveDate: "2026-10-01" }),
      ev({ type: "start", effectiveDate: "2026-10-02", schedule: { slot: "AM", days: [1] } }),
    ];
    expect(currentRoutine(events, "2026-10-03")).toEqual([{ productId: "a", schedule: SCHED, since: "2026-10-01" }]);
  });

  it("a second start of OTHER_PRODUCT_ID while active is ignored", () => {
    const pm = { slot: "PM" as const, days: [1] };
    const events = [
      ev({ type: "start", productId: OTHER_PRODUCT_ID, effectiveDate: "2026-10-01" }),
      ev({ type: "start", productId: OTHER_PRODUCT_ID, effectiveDate: "2026-10-02", schedule: pm }),
    ];
    expect(currentRoutine(events, "2026-10-03")).toEqual([{ productId: OTHER_PRODUCT_ID, schedule: SCHED, since: "2026-10-01" }]);
  });

  it("same-day order is recordedAt, then eventId", () => {
    const start = ev({ type: "start", recordedAt: "2026-10-01T10:00:00.000Z" });
    const stop = ev({ type: "stop", recordedAt: "2026-10-01T09:00:00.000Z" });
    expect(ids(currentRoutine([start, stop], "2026-10-01"))).toEqual(["a"]); // stop came first
    const t = "2026-10-01T09:00:00.000Z";
    const s1 = ev({ type: "start", recordedAt: t, eventId: "00000000-0000-4000-8000-00000000000a" });
    const s2 = ev({ type: "stop", recordedAt: t, eventId: "00000000-0000-4000-8000-00000000000b" });
    expect(ids(currentRoutine([s2, s1], "2026-10-01"))).toEqual([]); // start (…0a) then stop (…0b)
  });

  it("a substitute whose productId is not active still starts toProductId", () => {
    const events = [ev({ type: "substitute", effectiveDate: "2026-10-02", toProductId: "b" })];
    expect(ids(currentRoutine(events, "2026-10-02"))).toEqual(["b"]);
  });

  it("a substitute into an already-active product replaces its schedule from D, keeping since", () => {
    const am = { slot: "AM" as const, days: [2] };
    const events = [
      ev({ type: "start", productId: "a", effectiveDate: "2026-10-01" }),
      ev({ type: "start", productId: "b", effectiveDate: "2026-09-20" }),
      ev({ type: "substitute", productId: "a", toProductId: "b", effectiveDate: "2026-10-03", schedule: am }),
    ];
    expect(currentRoutine(events, "2026-10-03")).toEqual([{ productId: "b", schedule: am, since: "2026-09-20" }]);
  });
});
