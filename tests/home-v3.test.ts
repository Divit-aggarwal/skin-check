import { describe, expect, it } from "vitest";
import { mainAction, ringValues, slotNow, topReadings, type DueStep } from "@/lib/home/today";

// TD-48: the phone Today card's main button and ring.
const step = (productId: string, slot: "AM" | "PM", status: DueStep["status"] = "unknown"): DueStep => ({ productId, slot, status });

describe("Today card", () => {
  it("ring: used steps out of all due today; skipped and not logged are not done", () => {
    expect(ringValues([step("a", "AM", "used"), step("b", "AM", "skipped"), step("c", "PM")])).toEqual({ done: 1, total: 3 });
    expect(ringValues([])).toEqual({ done: 0, total: 0 });
  });

  it("main button: a due check comes first", () => {
    expect(mainAction({ checkDue: true, steps: [step("a", "AM")], slot: "AM" })).toEqual({ kind: "check" });
  });

  it("main button: else the next undone step of the current time of day, in routine order", () => {
    const steps = [step("a", "AM", "used"), step("b", "AM", "skipped"), step("c", "PM")];
    expect(mainAction({ checkDue: false, steps, slot: "AM" })).toEqual({ kind: "step", step: steps[1] });
    expect(mainAction({ checkDue: false, steps, slot: "PM" })).toEqual({ kind: "step", step: steps[2] });
  });

  it("main button: all done today is a quiet state; this time of day done while the other waits", () => {
    expect(mainAction({ checkDue: false, steps: [step("a", "AM", "used"), step("c", "PM", "used")], slot: "PM" })).toEqual({ kind: "allDone" });
    expect(mainAction({ checkDue: false, steps: [step("a", "AM", "used"), step("c", "PM")], slot: "AM" })).toEqual({ kind: "slotDone" });
    expect(mainAction({ checkDue: false, steps: [], slot: "AM" })).toEqual({ kind: "none" });
  });

  it("time of day in the user's own zone: evening from 15:00", () => {
    expect(slotNow(new Date("2026-10-12T09:29:00Z"), "Asia/Kolkata")).toBe("AM"); // 14:59
    expect(slotNow(new Date("2026-10-12T09:30:00Z"), "Asia/Kolkata")).toBe("PM"); // 15:00
  });

  it("the two highest levels, ties in table order, and how many more", () => {
    const bands = [{ m: "r", band: "Moderate" as const }, { m: "o", band: "Elevated" as const }, { m: "b", band: "Low" as const }, { m: "t", band: "Moderate" as const }, { m: "d", band: "Elevated" as const }];
    expect(topReadings(bands)).toEqual({ top: [bands[1], bands[4]], more: 3 });
    expect(topReadings(bands.slice(0, 1))).toEqual({ top: [bands[0]], more: 0 });
  });
});
