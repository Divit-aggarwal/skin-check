// Dashboard lane seed users (docs/lanes/dashboard-design.md §6): written by
// scripts/seed-lane-dashboard.ts, signed in as by the browser tests. One user
// per dashboard state and per browser test that changes data.

export type Check = { days: number; kind: "measured" | "legacy" | "questions" | "failed"; build?: string; verdict?: "pass" | "override" | "unchecked"; lowForehead?: boolean; badScores?: boolean; kept?: boolean };
/** TD-47: Home settings (users/{uid}/settings/home) and a routine whose steps were logged on these days ago. */
export type HomeSeed = { city?: { name: string; region: string; country: string; latE1: number; lonE1: number }; asked?: boolean; routineLoggedDaysAgo?: number[] };
export type User = { uid: string; phoneNumber: string; checks: Check[]; aiShare?: boolean; fullAnswers?: boolean; home?: HomeSeed };

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
  unreadable: { uid: "seed-dash-unreadable", phoneNumber: "+919999900815", checks: [{ days: 3, kind: "legacy", badScores: true }] },
  newer: { uid: "seed-dash-newer", phoneNumber: "+919999900816", checks: [m(5), { days: 1, kind: "questions" }], aiShare: true },
  // G03 / TD-25 (2): one check with a kept photo (a synthetic test pattern in local S3), one without.
  kept: { uid: "seed-dash-kept", phoneNumber: "+919999900817", checks: [m(6, { kept: true }), m(2)] },
  // TD-47 Home v2 (tests/browser/home-v2.spec.ts). Each city has its own position, so the weather cache never mixes tests.
  homeDue: { uid: "seed-home-due", phoneNumber: "+919999900830", checks: [m(30), m(8, { verdict: "pass" })], fullAnswers: true, aiShare: true, home: { asked: true, city: { name: "Bengaluru", region: "Karnataka", country: "India", latE1: 130, lonE1: 776 }, routineLoggedDaysAgo: [1, 2] } },
  homeToday: { uid: "seed-home-today", phoneNumber: "+919999900831", checks: [m(7, { verdict: "pass" })], home: { asked: true } },
  homeAnalysing: { uid: "seed-home-analysing", phoneNumber: "+919999900832", checks: [m(5), { days: 0, kind: "questions" }], home: { asked: true } },
  permAllow: { uid: "seed-home-perm-allow", phoneNumber: "+919999900833", checks: [m(2)] },
  permAllow768: { uid: "seed-home-perm-allow-768", phoneNumber: "+919999900840", checks: [m(2)] },
  permAllow1280: { uid: "seed-home-perm-allow-1280", phoneNumber: "+919999900841", checks: [m(2)] },
  permNotNow: { uid: "seed-home-perm-notnow", phoneNumber: "+919999900834", checks: [m(2)] },
  permRefused: { uid: "seed-home-perm-refused", phoneNumber: "+919999900835", checks: [m(2)] },
  homeType: { uid: "seed-home-type", phoneNumber: "+919999900836", checks: [m(3)], home: { asked: true } },
  homeDown: { uid: "seed-home-down", phoneNumber: "+919999900837", checks: [m(3)], home: { asked: true, city: { name: "Kochi", region: "Kerala", country: "India", latE1: 100, lonE1: 763 } } },
  homeRoutine: { uid: "seed-home-routine", phoneNumber: "+919999900838", checks: [m(4)], home: { asked: true, routineLoggedDaysAgo: [] } },
  homeErase: { uid: "seed-home-erase", phoneNumber: "+919999900839", checks: [m(4)], home: { asked: true, city: { name: "Pune", region: "Maharashtra", country: "India", latE1: 185, lonE1: 739 } } },
};
