// E02/E05 settings (docs/lanes/rules-design.md). Every clinical list here is
// PROVISIONAL until a named clinical reviewer signs it off (tracker E05).
// Bump RULESET_VERSION on any change to a list or to the copy: the reviewer
// signs a specific version, and tests/rules-settings.test.ts pins it.

export const RULESET_VERSION = "rules-0-provisional";

/** Flip to "clinically_reviewed" only in the reviewed change that records the sign-off. */
export const REVIEW_STATUS: "provisional" | "clinically_reviewed" = "provisional";

/**
 * Fails closed: before clinical sign-off, on only when NODE_ENV is exactly
 * "test" or "development" (off in production builds, and when unset).
 * No environment override, on purpose.
 */
export function rulesEnabledFor(nodeEnv: string | undefined, reviewStatus: typeof REVIEW_STATUS): boolean {
  return reviewStatus === "clinically_reviewed" || nodeEnv === "test" || nodeEnv === "development";
}

export const RULES_ENABLED = rulesEnabledFor(process.env.NODE_ENV, REVIEW_STATUS);

export class RulesDisabledError extends Error {
  constructor() {
    super("Rules are off in production builds until clinical sign-off (tracker E05).");
  }
}

/** One condition: the field's answer includes any of these values. */
export interface Condition {
  field: string;
  anyOf: readonly string[];
}

/** A rule fires when every condition matches. */
export interface Rule {
  id: string;
  when: readonly Condition[];
}

/** The only fields the rules read. Nothing else is read or hashed. */
export const RULE_INPUT_FIELDS = [
  "gender",
  "primary_concerns",
  "breakout_pattern",
  "pih_scar_tendency",
  "current_products",
  "female_skin_context",
] as const;

export type RuleInputField = (typeof RULE_INPUT_FIELDS)[number];

// ─── Clinical lists (PROVISIONAL) ───────────────────────────────────────────

/** RECOMMENDATION_MODEL §4. Any one gives the base routine plus the referral line only. */
export const RED_FLAG_RULES: readonly Rule[] = [
  { id: "red_flag.deep_painful_breakouts", when: [{ field: "breakout_pattern", anyOf: ["deep_painful"] }] },
  { id: "red_flag.scarring_breakouts", when: [{ field: "breakout_pattern", anyOf: ["leaves_scars"] }] },
  { id: "red_flag.scar_or_indent", when: [{ field: "pih_scar_tendency", anyOf: ["scar_or_indent"] }] },
  { id: "red_flag.lingering_dark_mark", when: [{ field: "pih_scar_tendency", anyOf: ["dark_mark_lingers"] }] },
  {
    id: "red_flag.irregular_periods_with_breakouts",
    when: [
      { field: "female_skin_context", anyOf: ["irregular_periods"] },
      { field: "primary_concerns", anyOf: ["blemishes"] },
    ],
  },
];

/** Privacy decision 8. The one extra-caution list: evaluateSafety and extraCautionAnswers (today's Echo, the context builder) read it. Any one turns the flag on. */
export const EXTRA_CAUTION_TRIGGERS: readonly Condition[] = [
  { field: "female_skin_context", anyOf: ["pregnant_or_breastfeeding"] },
  { field: "current_products", anyOf: ["prescription"] },
];

export const PRESCRIBER_RULE: Rule = {
  id: "constraint.prescriber_routine",
  when: [{ field: "current_products", anyOf: ["prescription"] }],
};

export const PREGNANCY_ACTIVES_RULE: Rule = {
  id: "notice.pregnancy_actives",
  when: [
    { field: "female_skin_context", anyOf: ["pregnant_or_breastfeeding"] },
    { field: "current_products", anyOf: ["actives"] },
  ],
};

/** Any one triggers the conditional active. */
export const ACTIVE_TRIGGERS: readonly Condition[] = [
  { field: "primary_concerns", anyOf: ["pigment", "blemishes"] },
  { field: "pih_scar_tendency", anyOf: ["dark_mark_fades", "dark_mark_lingers"] },
];

/** Ingredient classes that make a product an active. A base product has none of them and no declared active. */
export const ACTIVE_CLASSES = ["niacinamide", "retinoid", "aha", "bha", "vitamin-c"] as const;

/** The conditional active: a serum whose only active class is this one. */
export const ACTIVE_PRODUCT = { category: "serum", ingredientClass: "niacinamide" } as const;

/** Base routine for everyone, including under a red flag. */
export const BASE_CATEGORIES = ["cleanser", "moisturiser", "sunscreen"] as const;

/** Display order of selected items (RECOMMENDATION_MODEL §2 step 5; a convention). */
export const POSITION_ORDER = ["cleanser", "serum", "moisturiser", "sunscreen"] as const;

/** Catalogue contraindication → the answer that matches it. */
export const CONTRAINDICATION_MATCH: Record<string, Condition> = {
  pregnant_or_breastfeeding: { field: "female_skin_context", anyOf: ["pregnant_or_breastfeeding"] },
  prescription_in_use: { field: "current_products", anyOf: ["prescription"] },
};

// ─── Rule ids with no clinical list ─────────────────────────────────────────

export const RULE_IDS = {
  base: "base.routine",
  active: "active.niacinamide",
  extraCaution: "extra_caution",
  baseOnly: "red_flag.base_routine_only",
  referral: "red_flag.referral",
  redFlag: "red_flag",
  needsConfirmation: "active.needs_confirmation",
  needsAnswers: "active.needs_answers",
  notTriggered: "active.not_triggered",
  activeOneOnly: "active.one_only",
  oneAtATime: "notice.one_at_a_time",
  onePerStep: "base.one_per_step",
  unavailable: "catalogue.unavailable",
  contraindicated: "catalogue.contraindicated",
  notInRuleset: "catalogue.not_in_ruleset",
  gap: "catalogue.gap",
} as const;

// ─── Copy (every string passes the D-12 word check; tested) ─────────────────

export const COPY = {
  referral: "What you described is worth showing a dermatologist.",
  baseOnly: "Only the basic daily routine is shown for now.",
  prescriber: "Keep following your prescriber's routine.",
  extraCaution: "Ask a doctor before starting anything new.",
  pregnancyActives:
    "If any of your current products contain a retinoid, check with your doctor while pregnant or breastfeeding.",
  oneAtATime: "Add one new product at a time.",
  needsConfirmation: "Confirm your answers on this check to see more options.",
  needsAnswers: "Answer the remaining questions to see more options.",
  gap: "No matching product is available right now.",
  unknownMissing: "Not answered.",
  unknownInvalid: "Could not be read.",
  unknownStale: "Not confirmed on this check.",
  excluded: {
    redFlag: "Only the basic routine is shown for what you described.",
    prescriber: "Not added while you follow a prescriber's routine.",
    extraCaution: "Not added while extra caution applies.",
    needsConfirmation: "Not added until your answers are confirmed on this check.",
    needsAnswers: "Not added while some answers are missing.",
    notTriggered: "Not added: none of your stated concerns call for it.",
    activeOneOnly: "Another product already fills this step.",
    onePerStep: "Another product already fills this step.",
    unavailable: "Not available right now.",
    contraindicated: "Not suitable with one of your answers.",
    notInRuleset: "Not part of the current routine rules.",
  },
} as const;
