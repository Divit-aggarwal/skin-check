// TD-33 browser test users (scripts/seed-lane-questionnaire.ts writes them).
// Phone numbers +9199999009xx. One user per width for every test that saves.

export type QUser = { uid: string; phoneNumber: string; check?: "skipped" | "named" };

const u = (n: number, uid: string, check?: QUser["check"]): QUser => ({ uid: `seed-q-${uid}`, phoneNumber: `+9199999009${String(n).padStart(2, "0")}`, ...(check ? { check } : {}) });

export const WIDTHS = ["390", "768", "1280"] as const;
export type Width = (typeof WIDTHS)[number];

export const Q_SEED = {
  // No checks: the choice screen and the camera states (nothing is saved).
  flow: { "390": u(1, "flow-390"), "768": u(2, "flow-768"), "1280": u(3, "flow-1280") },
  // One measured check whose questions were skipped: Home and Account cards, Echo's notice, answering later.
  skipped: { "390": u(11, "skipped-390", "skipped"), "768": u(12, "skipped-768", "skipped"), "1280": u(13, "skipped-1280", "skipped") },
  // One measured, answered check with both product names: shown on the opened check only.
  named: u(21, "named", "named"),
  // A returning user whose last check skipped the questions.
  returning: u(22, "returning-skipped", "skipped"),
  // No checks: the whole skip path through a real scan.
  skipFlow: u(23, "skip-flow"),
} as const;

export const SEEDED_NAMES = { prescription: "Seed Tretinoin cream 0.025%", other: "Seed brand vitamin C serum" };

export const allQUsers = (): QUser[] => [
  ...Object.values(Q_SEED.flow),
  ...Object.values(Q_SEED.skipped),
  Q_SEED.named,
  Q_SEED.returning,
  Q_SEED.skipFlow,
];
