// Wave 2 shared shape. Types only. No lane edits lib/contracts/ (docs/lanes/README.md, TD-13).
//
// The ONLY data Gemini may receive (D-14; GEMINI_BOUNDARY §2, §4, §5). These
// are standalone types, not Omit<> views of the internal results: TypeScript
// lets a wider object pass for an Omit<> type, which would leak numbers and
// triggers. The builder constructs every field and serialises through an
// allowlist. Every section except uncertainty and missing is
// optional: send only what the user's question needs, and say in `missing`
// what was left out and why.
//
// Every item Gemini may cite is a fact: a stable `id` ("{kind}.{region|all}.{metric}",
// GEMINI_BOUNDARY §4) and a pre-rendered `text`. The validator checks
// citations, numbers and band words against these (§5 rules 1-3, 6).
//
// Privacy: nothing the privacy pin excludes can appear (privacy-report §5;
// tests/privacy-gemini-inventory): no name, age, gender, female_skin_context,
// phone, photo, uid, scanId, consent fields, raw or numeric scores, Pores, or
// the Dryness band. Bands go for the whole face plus the focus region only,
// as today. The longitudinal, recommendation and uncertainty sections and the
// version labels are D-14 additions: new data to Gemini, sent only after the
// owner approves D-14, and then added to the pin test. Version strings contain
// digits; they are labels, never citable numbers. Pairwise metric wording is
// about a photo statistic, not the skin itself (D-24).

import type { BeyondNoiseReasonCode, ConfounderCode, NotEnoughEvidenceReasonCode, Reasons, WithinNoiseReasonCode } from "./longitudinal-result";

/** The 4 regions the engine masks (lib/echo-regions.ts), plus the whole face. No left/right cheeks. */
export type ContextRegion = "all" | "forehead" | "cheeks" | "nose" | "chin";

/** No pores and no hydration ("Dryness"): neither is sent (D-05, privacy decision 8). */
export type ContextMetric = "redness" | "oiliness" | "texture" | "blemishes" | "pigment";

export type ContextBand = "Low" | "Moderate" | "Elevated";

/** Exactly the step ids lib/gemini.ts GEMINI_FIELD_INVENTORY marks "sent" (tests/contracts.test.ts pins it). */
export type GeminiAnswerField =
  | "primary_concerns"
  | "skin_type"
  | "breakout_pattern"
  | "acne_areas"
  | "pih_scar_tendency"
  | "skin_tone"
  | "current_products"
  | "male_skin_context"
  | "skin_factors"
  | "diet"
  | "water_intake"
  | "sunscreen_habit";

/** Something Gemini may cite. `text` is pre-rendered by our code; every number and band word in it is ours. */
export interface Fact {
  id: string;
  text: string;
}

/** One band reading from the current scan. Measured, so `source` is fixed. */
export interface MeasuredReading extends Fact {
  source: "measured";
  region: ContextRegion;
  metric: ContextMetric;
  band: ContextBand;
  lowConfidence: boolean;
}

/** The current scan. Bands come from the scoring table, not from SkinState (D-23 has no bands). */
export interface ContextSkinState {
  /** Version of the SkinState the scan was read from. */
  contractVersion: string;
  /** Version of the band thresholds (SCORING_VERSION). */
  scoringVersion: string;
  pipelineVersion: string;
  readings: MeasuredReading[];
}

/**
 * Number-free view of a LongitudinalResult: no values, dates, scan references
 * or internal quantity names (the builder maps the quantity to the metric it
 * reads). Same two arms. A pairwise arm needs settled wording first: the
 * tier-1 sentence ("by more than photo-to-photo variation") trips the
 * GEMINI_BOUNDARY §5 rule 4 lexicon, so the builder emits only
 * "not_enough_evidence" until that is resolved (context brief).
 */
export type ContextLongitudinal = Fact & {
  source: "measured";
  measured: { metric: ContextMetric; region: ContextRegion };
} & (
    | { evidence: "not_enough_evidence"; comparable: boolean; change: "not_evaluated"; reasons: Reasons<NotEnoughEvidenceReasonCode> }
    | ({
        evidence: "pairwise";
        comparable: true;
        /** Named next to the statement (LONGITUDINAL_METHOD §5); each is a citable fact. */
        confounders: [Fact & { code: ConfounderCode }, ...(Fact & { code: ConfounderCode })[]];
      } & (
        | { change: "beyond_noise"; reasons: Reasons<BeyondNoiseReasonCode> }
        | { change: "within_noise"; reasons: Reasons<WithinNoiseReasonCode> }
      ))
  );

/**
 * Owner decision R-1 A (TD-07): routine data is "not sent to Gemini", and
 * users are told so (ROUTINE_PURPOSE_COPY). The only value is "not shared".
 * A shared variant, and any adherence summary, needs the owner to reopen
 * R-1 A and change that copy, and then a new package version (tracker F05).
 */
export interface ContextRoutine {
  status: "not_shared";
  decision: "R-1 A";
}

/** Gemini may mention only these products, with only this whitelisted claim text (RECOMMENDATION_MODEL §7). */
export interface ContextRecommendation {
  rulesetVersion: string;
  /** Each item is a fact ("rec.{productId}"); its text is the whitelisted claim text. */
  items: (Fact & { productId: string; productName: string })[];
}

/*
 * No safety section (TD-17 (1), tracker H19). The extra-caution flag is no
 * longer sent: every user gets the same instruction (lib/gemini.ts
 * ECHO_SAFETY_INSTRUCTION). No red-flag boolean either: a quiz red flag can
 * come from female_skin_context (the hormonal-pattern rule), so a bare flag
 * would point at a hidden answer. A red flag reaches the user through fixed
 * referral copy and the base routine, and chat red flags never reach Gemini
 * (GEMINI_BOUNDARY §6).
 */

/**
 * What the user told us, kept apart from measured data. Labels come from our
 * own config. An answer that turns extra caution on is left out (e.g.
 * current_products "prescription"; tests/privacy-gemini-inventory, TD-17).
 */
export interface SelfReportedStatement extends Fact {
  source: "self_reported";
  field: GeminiAnswerField;
  /** false when it was answered on an earlier check. */
  fresh: boolean;
}

/** A fixed statement of what the readings cannot tell (e.g. "These readings compare areas within one photo"). */
export interface UncertaintyStatement extends Fact {
  source: "uncertainty";
}

export type ContextSection = "skin" | "longitudinal" | "routine" | "recommendation" | "selfReported";

/** A section left out, something the photo cannot measure, or "trend" when no change can be stated. Citable. */
export interface MissingItem extends Fact {
  about: ContextSection | "hydration" | "pores" | "trend";
}

/** GEMINI_BOUNDARY §5 claim_type. routine_as_directed is removed (TD-16 (3), TD-17 (3); tracker F10). */
export type AllowedClaim =
  | "descriptive"
  | "self_reported_echo"
  | "uncertainty"
  | "comparability"
  | "smalltalk"
  | "clarify"
  | "out_of_scope";

/** One per validator check, so a failed answer can name what it broke (GEMINI_BOUNDARY §5, context brief). */
export type ForbiddenClaim =
  | "unknown_fact_id" // §5 rule 1
  | "citation_rule" // §5 rule 2: missing or extra citation for the claim type
  | "made_up_number" // §5 rule 3
  | "medical_or_efficacy_term" // §5 rule 5
  | "comparative_or_change" // §5 rule 4: change and comparative lexicon, EN and Hinglish
  | "non_latin_script" // §5 rule 4b
  | "band_mismatch" // §5 rule 6
  | "made_up_past_event"
  | "cause"
  | "product_claim"
  | "contradicts_package"
  | "missing_uncertainty"
  | "self_report_as_measurement"
  | "diagnosis"
  | "forecast"
  | "self_assigned_confidence";

export interface ContextPackage {
  packageVersion: string;
  regionFocus: Exclude<ContextRegion, "all"> | null;
  skin?: ContextSkinState;
  longitudinal?: ContextLongitudinal[];
  routine?: ContextRoutine;
  recommendation?: ContextRecommendation;
  selfReported?: SelfReportedStatement[];
  /** Always at least one (CLAUDE.md: uncertainty is preserved). */
  uncertainty: [UncertaintyStatement, ...UncertaintyStatement[]];
  missing: MissingItem[];
  allowedClaims: AllowedClaim[];
  forbiddenClaims: ForbiddenClaim[];
}
