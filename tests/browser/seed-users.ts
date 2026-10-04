// Dashboard lane seed users (docs/lanes/dashboard-design.md §6): written by
// scripts/seed-lane-dashboard.ts, signed in as by the browser tests. One user
// per dashboard state and per browser test that changes data.

export type Check = { days: number; kind: "measured" | "legacy" | "questions" | "failed"; build?: string; verdict?: "pass" | "override" | "unchecked"; lowForehead?: boolean };
export type User = { uid: string; phoneNumber: string; checks: Check[]; aiShare?: boolean; fullAnswers?: boolean };

const m = (days: number, extra: Partial<Check> = {}): Check => ({ days, kind: "measured", ...extra });

/** Phone numbers +9199999008xx. */
export const DASHBOARD_SEED: Record<string, User> = {
  empty: { uid: "seed-dash-empty", phoneNumber: "+919999900801", checks: [] },
  one: { uid: "seed-dash-one", phoneNumber: "+919999900802", checks: [m(1, { verdict: "pass", lowForehead: true })] },
  building: { uid: "seed-dash-building", phoneNumber: "+919999900803", checks: [m(20), m(10, { verdict: "override" }), m(2, { verdict: "pass" })] },
  set: { uid: "seed-dash-set", phoneNumber: "+919999900804", checks: [m(40), m(30), m(20), m(10), m(1, { verdict: "unchecked" })] },
  boundary: { uid: "seed-dash-boundary", phoneNumber: "+919999900805", checks: [m(10), m(1, { build: "sha-0000000000000000000000000000000000000000" })] },
  legacy: { uid: "seed-dash-legacy", phoneNumber: "+919999900806", checks: [{ days: 60, kind: "legacy" }] },
  noreading: { uid: "seed-dash-noreading", phoneNumber: "+919999900807", checks: [{ days: 5, kind: "questions" }, { days: 1, kind: "failed" }] },
  withdraw: { uid: "seed-dash-withdraw", phoneNumber: "+919999900808", checks: [m(3)], aiShare: true },
  echo: { uid: "seed-dash-echo", phoneNumber: "+919999900809", checks: [m(2)] },
  scan: { uid: "seed-dash-scan", phoneNumber: "+919999900810", checks: [] },
  returning: { uid: "seed-dash-returning", phoneNumber: "+919999900811", checks: [m(7)], fullAnswers: true },
  routine: { uid: "seed-dash-routine", phoneNumber: "+919999900812", checks: [] },
  erase: { uid: "seed-dash-erase", phoneNumber: "+919999900813", checks: [m(4)] },
  capture: { uid: "seed-dash-capture", phoneNumber: "+919999900814", checks: [] },
};
