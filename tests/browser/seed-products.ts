// TD-34 browser test users (scripts/seed-lane-products.ts writes them).
// Phone numbers +9199999010xx. Each has one measured check with every safety
// question answered (male, so the female branch is not asked).

export type PUser = { uid: string; phoneNumber: string; aiShare: boolean; answers: Record<string, string | string[]> };

const ANSWERS = {
  age: "25-34",
  gender: "male",
  primary_concerns: ["oiliness", "redness"],
  skin_type: "oily",
  breakout_pattern: ["small_bumps"],
  pih_scar_tendency: "fades_no_trace",
  current_products: ["cleanser_moisturizer"],
  male_skin_context: ["shaving_irritation"],
  sunscreen_habit: "occasionally",
};

const u = (n: number, uid: string, over: Partial<PUser> = {}): PUser => ({
  uid: `seed-p-${uid}`,
  phoneNumber: `+9199999010${String(n).padStart(2, "0")}`,
  aiShare: true,
  answers: ANSWERS,
  ...over,
});

export const P_SEED = {
  plain: { "390": u(1, "plain-390"), "768": u(2, "plain-768"), "1280": u(3, "plain-1280") },
  redFlag: u(11, "red-flag", { answers: { ...ANSWERS, breakout_pattern: ["deep_painful"] } }),
  prescription: u(12, "prescription", { answers: { ...ANSWERS, current_products: ["prescription"] } }),
  consent: u(13, "consent", { aiShare: false }),
  ask: u(14, "ask"),
} as const;

export const allPUsers = (): PUser[] => [...Object.values(P_SEED.plain), P_SEED.redFlag, P_SEED.prescription, P_SEED.consent, P_SEED.ask];
