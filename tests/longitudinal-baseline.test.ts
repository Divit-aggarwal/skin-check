import { describe, expect, it } from "vitest";
import { pickBaseline, sortStates } from "@/lib/longitudinal/baseline";
import { BASELINE_CAPTURE_METHOD_RULE, BASELINE_ONE_PER_DAY_RULE, BASELINE_RULE } from "@/lib/longitudinal/settings";
import type { SkinState2 } from "@/lib/skin-state-2";

// D01 baseline window (design §2.4 steps 3-5). Minimal synthetic states: only the fields the window reads.
const st = (day: number, build: string | null = "A", pipeline = "scan-0.1.6-provisional", ref = `users/u/scanAnalyses/s${day}`) =>
  ({
    identity: { analysisRef: ref, scanId: `s${day}` },
    provenance: { analyzedAt: new Date(Date.UTC(2026, 9, day)).toISOString() },
    engine: { pipelineVersion: pipeline, build },
    input: { captureMethod: "native" },
  }) as unknown as SkinState2;
const days = (p: ReturnType<typeof pickBaseline>) => p.candidates.map((s) => s.identity.scanId);

describe("D01 baseline window", () => {
  it("the rule is first_3_comparable_scans, named and marked provisional", () => {
    expect(BASELINE_RULE).toEqual({ rule: "first_3_comparable_scans", scans: 3, status: "provisional" });
    expect(Object.isFrozen(BASELINE_RULE)).toBe(true);
  });

  it("D06 settings are named and marked provisional (TD-14 (3), (4))", () => {
    expect(BASELINE_CAPTURE_METHOD_RULE).toEqual({ rule: "skip_other_capture_method", status: "provisional" });
    expect(BASELINE_ONE_PER_DAY_RULE).toEqual({ rule: "one_scan_per_calendar_day", timeZone: "Asia/Kolkata", status: "provisional" });
    expect(Object.isFrozen(BASELINE_CAPTURE_METHOD_RULE) && Object.isFrozen(BASELINE_ONE_PER_DAY_RULE)).toBe(true);
  });

  it("0 to 3 states give fewer than 3 candidates: one scan is never a baseline", () => {
    expect(pickBaseline([])).toEqual({ latest: null, candidates: [], window: [], engineBoundary: false });
    for (const n of [1, 2, 3]) {
      const p = pickBaseline(Array.from({ length: n }, (_, i) => st(i + 1)));
      expect(p.candidates.length).toBe(n - 1);
      expect(p.latest?.identity.scanId).toBe(`s${n}`);
    }
  });

  it("the latest is never a candidate; candidates are the first three in time order, whatever the input order", () => {
    const p = pickBaseline([st(5), st(2), st(9), st(1), st(3)]);
    expect(days(p)).toEqual(["s1", "s2", "s3"]);
    expect(p.latest?.identity.scanId).toBe("s9");
    expect(p.window.map((s) => s.identity.scanId)).toEqual(["s1", "s2", "s3", "s5", "s9"]);
  });

  it("leading unknown-build states are skipped, not counted and not a boundary", () => {
    const p = pickBaseline([st(1, null, "scan-0.1.5-provisional"), st(2), st(3), st(4), st(5)]);
    expect(days(p)).toEqual(["s2", "s3", "s4"]);
    expect(p.engineBoundary).toBe(false);
  });

  it("A A A then B B B B: the baseline stays on A and the window crosses a boundary", () => {
    const p = pickBaseline([st(1), st(2), st(3), st(4, "B"), st(5, "B"), st(6, "B"), st(7, "B")]);
    expect(days(p)).toEqual(["s1", "s2", "s3"]);
    expect(p.engineBoundary).toBe(true);
  });

  it("A A A, B, A and a pipeline change are boundaries; a usable-filter skip never crosses one", () => {
    expect(pickBaseline([st(1), st(2), st(3), st(4, "B"), st(5)]).engineBoundary).toBe(true);
    expect(pickBaseline([st(1), st(2), st(3), st(4, "A", "scan-0.1.7-provisional")]).engineBoundary).toBe(true);
    const p = pickBaseline([st(1), st(2), st(3), st(4), st(5)], (s) => s.identity.scanId !== "s2");
    expect(days(p)).toEqual(["s1", "s3", "s4"]);
    expect(p.engineBoundary).toBe(false);
    // Skipping the A scans does not let the baseline start on B: B scans are candidates only by time.
    const q = pickBaseline([st(1), st(2), st(3, "B"), st(4, "B"), st(5, "B"), st(6, "B")], (s) => s.engine.build !== "A");
    expect(days(q)).toEqual(["s3", "s4", "s5"]);
  });

  it("ties on analyzedAt are ordered by analysisRef", () => {
    const a = st(1, "A", "p", "users/u/scanAnalyses/b");
    const b = st(1, "A", "p", "users/u/scanAnalyses/a");
    expect(sortStates([a, b]).map((s) => s.identity.analysisRef)).toEqual(["users/u/scanAnalyses/a", "users/u/scanAnalyses/b"]);
  });
});

// G-1: one shared starting-check count for the engine and the dashboard.
describe("G-1 shared starting checks", () => {
  const rec = (day: number, scanId: string, persist: "primary" | "recovery" = "primary", ref = `users/u/scanAnalyses/${scanId}-${day}-${persist}`) =>
    ({
      identity: { analysisRef: ref, scanId },
      provenance: { analyzedAt: new Date(Date.UTC(2026, 9, day)).toISOString(), persistAttempt: persist },
      engine: { pipelineVersion: "scan-0.1.6-provisional", build: "A" },
      input: { captureMethod: "native" },
    }) as unknown as SkinState2;

  it("onePerCheck keeps one record per check: the primary before a recovery, then the newest", async () => {
    const { onePerCheck } = await import("@/lib/longitudinal/baseline");
    const picked = onePerCheck([rec(1, "a"), rec(2, "a"), rec(3, "a", "recovery"), rec(4, "b", "recovery")]);
    expect(picked.map((s) => s.identity.analysisRef).sort()).toEqual(["users/u/scanAnalyses/a-2-primary", "users/u/scanAnalyses/b-4-recovery"]);
  });

  it("startingCheckCount counts checks, capped at the rule's number", async () => {
    const { startingChecks, startingCheckCount } = await import("@/lib/longitudinal/baseline");
    expect(startingCheckCount(startingChecks([rec(1, "a"), rec(2, "a"), rec(3, "b"), rec(9, "z")]))).toBe(2);
    expect(startingCheckCount(startingChecks([rec(1, "a"), rec(2, "b"), rec(3, "c"), rec(4, "d"), rec(9, "z")]))).toBe(3);
  });

  it("the engine and the dashboard both use it, and nothing else picks a baseline", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("lib/longitudinal/engine.ts", "utf8")).toMatch(/startingChecks\(states, usable\)/);
    const page = readFileSync("components/dashboard/state.ts", "utf8");
    expect(page).toMatch(/startingChecks\(/);
    expect(page).toMatch(/startingCheckCount\(pick\)/);
    for (const f of ["lib/longitudinal/engine.ts", "components/dashboard/state.ts"]) expect(readFileSync(f, "utf8"), f).not.toMatch(/pickBaseline\(/);
  });
});
