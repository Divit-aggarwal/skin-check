// Wave 2 shared shape. Types only. No lane edits lib/contracts/ (docs/lanes/README.md, TD-13).
//
// The deterministic recommender's answer and audit record (RECOMMENDATION_MODEL
// §2, §6; D-08, D-09, D-19). Internal: triggers, limits, notices and
// exclusions can name sensitive answers (pregnancy, prescription), so Gemini
// never sees them. The context package carries only ContextRecommendation.

import type { SafetyState } from "./safety-state";

/**
 * Self-reported quiz answers only (RECOMMENDATION_MODEL §2, §4: quiz-keyed).
 * Never image bands (D-09), and never the routine record: the routine is
 * the user's own record, shown to them beside their own checks (TD-24 (2),
 * which replaced the no-join part of R-1 A), never an input to the rules.
 */
export interface RuleTrigger {
  source: "self_reported";
  /** Step id from lib/skin-check-steps.ts, e.g. "current_products". */
  field: string;
  value: string;
  /** false when the answer was reused from an earlier check without re-confirmation (D-19). */
  fresh: boolean;
}

export interface FiredRule {
  ruleId: string;
  triggeredBy: RuleTrigger[];
}

export interface RecommendedItem {
  productId: string;
  productVersionId: string;
  slot: "AM" | "PM" | "AM_PM";
  /**
   * Order key (RECOMMENDATION_MODEL §2 step 5; a convention, labelled as such).
   * One key per item across all slots: sorting any slot's items by it gives
   * that slot's order. An AM_PM item has one position, and the order is the
   * same in both of its slots. Not a dense 1..n per slot.
   */
  position: number;
  /** The rule that put it here. */
  ruleId: string;
}

/** A rule that narrowed the selection, with fixed copy, e.g. "Keep following your prescriber's routine." */
export interface AppliedLimit {
  ruleId: string;
  text: string;
}

/** A fixed line shown without changing the selection, e.g. the pregnancy notice (RECOMMENDATION_MODEL §2). */
export interface Notice {
  ruleId: string;
  text: string;
}

export interface UnknownInput {
  field: string;
  text: string;
}

export interface ExcludedOption {
  productId: string;
  ruleId: string;
  reason: string;
}

export interface RecommendationResult {
  rulesetVersion: string;
  catalogVersion: string;
  /**
   * SHA-256 of the canonical JSON of the exact inputs the rules read, so the
   * result is reproducible (§6; owner decision TD-15): the ruleset version, the
   * catalogue version, a digest of the catalogue content, and the normalised
   * reading of each rule field. Answers the rules do not read (name, phone,
   * others) are left out. Equal hashes give equal results.
   */
  inputSha256: string;
  /** Clinical lists are provisional until a clinical reviewer signs off (E05); off in production until then. */
  reviewStatus: "provisional" | "clinically_reviewed";
  fired: FiredRule[];
  items: RecommendedItem[];
  limits: AppliedLimit[];
  notices: Notice[];
  unknowns: UnknownInput[];
  excluded: ExcludedOption[];
  /** The red-flag state it was built under. redFlag true means base routine only (RECOMMENDATION_MODEL §4, §6). */
  safety: SafetyState;
}
