import { createHash } from "node:crypto";
import type {
  ContextBand,
  ContextLongitudinal,
  ContextMetric,
  ContextPackage,
  ContextRecommendation,
  ContextRegion,
  Fact,
  GeminiAnswerField,
  MeasuredReading,
  MissingItem,
  SelfReportedStatement,
  UncertaintyStatement,
} from "@/lib/contracts/context-package";
import type { LongitudinalResult, NotEnoughEvidenceReasonCode, QuantityPath } from "@/lib/contracts/longitudinal-result";
import type { RecommendationResult } from "@/lib/contracts/recommendation-result";
import type { SafetyState } from "@/lib/contracts/safety-state";
import { GEMINI_FIELD_INVENTORY, withoutCautionAnswers } from "@/lib/gemini";
import { extraCautionAnswers } from "@/lib/rules/safety";
import { SECTIONS } from "@/lib/skin-check-steps";
import { describeStepAnswerParts } from "@/lib/skin-check-format";
import { bandScores, SCORING_VERSION } from "@/lib/skin-check-rules";
import { SCAN_ANALYSIS_SCHEMA_VERSION } from "@/lib/scan-analysis-record";
import type { EchoRegion } from "@/lib/echo-regions";
import type { SkinCheckAnswers } from "@/types/skin-check";
import type { SkinScanScores } from "@/types/skin-scan";
import {
  BAND_NAME, CAUSE, CHANGE, CONFIDENCE, DIAGNOSIS, FORECAST, FORMAT_CHARS, INSTRUCTION, MEASUREMENT, MEDICAL, NON_LATIN, NUMBER,
  PAST_EVENT, PRODUCT_INTENT, UNMEASURED_WORDS, normalizeForMatch,
} from "./lexicon";

// F01 + F04 (docs/lanes/context-design.md §3.3, §3.4). Deterministic: the
// same inputs give the same package. Every field is constructed here from
// our own text; nothing from an input object is spread or copied whole, and
// serializePackage() then copies only allowlisted keys.

export const PACKAGE_VERSION = "ctx-1";

const METRICS: ContextMetric[] = ["redness", "oiliness", "texture", "blemishes", "pigment"];

const METRIC_LABELS: Record<ContextMetric, string> = {
  redness: "Redness",
  oiliness: "Oiliness",
  texture: "Texture irregularity",
  blemishes: "Blemishes",
  pigment: "Pigmentation",
};

const WHERE: Record<ContextRegion, string> = {
  all: "the whole face",
  forehead: "the forehead",
  cheeks: "the cheeks",
  nose: "the nose",
  chin: "the chin",
};

/** Proposed decision CTX-1: which metric a skinstate quantity reads. Pinned by a test. */
export const QUANTITY_METRIC: Record<QuantityPath, ContextMetric> = {
  "colour.corrected.aStarMean": "redness",
  "colour.corrected.aStarP90": "redness",
  "colour.corrected.aStarSd": "redness",
  "colour.corrected.aStarHist": "redness",
  "colour.native.aStarMean": "redness",
  "colour.native.aStarP90": "redness",
  "colour.native.aStarSd": "redness",
  "colour.native.aStarHist": "redness",
  "colour.corrected.bStarMean": "pigment",
  "colour.native.bStarMean": "pigment",
  "colour.corrected.lStarMeanPostClahe": "pigment",
  "colour.corrected.lStarSdPostClahe": "pigment",
  "colour.native.lStarMean": "pigment",
  "colour.native.lStarSd": "pigment",
  "texture.laplacianVarMean": "texture",
  "texture.lbpEntropy": "texture",
  "texture.gradientMean": "texture",
  "texture.localLContrastHist": "texture",
  "colour.native.localLContrastHist": "texture",
  "specular.fraction": "oiliness",
};

const REGION_OF: Record<string, Exclude<ContextRegion, "all">> = {
  forehead: "forehead",
  nose: "nose",
  chin: "chin",
  cheeks: "cheeks",
  cheek_image_left: "cheeks",
  cheek_image_right: "cheeks",
};

/** Our own sentence per reason, in a fixed order. The producer's text is never sent. */
export const REASON_TEXT: Record<NotEnoughEvidenceReasonCode, string> = {
  too_few_scans_for_baseline: "There are not enough checks yet to set a starting point.",
  noise_table_empty: "There is no checked measure yet of how much this reading varies from photo to photo.",
  histogram_quantity: "This reading is a spread of values, so there is no single value to compare.",
  not_comparable: "These checks were taken in ways that cannot be matched up.",
  engine_boundary: "The analysis software was updated between these checks.",
  legacy_record: "An older check was saved in a format that cannot be matched up.",
  bad_raw_data: "Some of the photo data could not be read.",
  conflicting_scans: "The starting checks do not agree with each other closely enough.",
  identical_scan: "Both readings are from the same photo.",
  persistence_not_available: "Whether a reading holds steady across checks cannot be told yet.",
};

const SELF_TOPICS: Record<GeminiAnswerField, string> = {
  primary_concerns: "main skin concerns",
  skin_type: "skin type",
  breakout_pattern: "usual breakouts",
  acne_areas: "breakout areas",
  pih_scar_tendency: "marks after a breakout",
  skin_tone: "skin's response to sun",
  current_products: "current products",
  male_skin_context: "patterns you notice",
  skin_factors: "recent skin factors",
  diet: "regular diet",
  water_intake: "daily water",
  sunscreen_habit: "sunscreen use",
};

export const UNCERTAINTY: UncertaintyStatement = {
  id: "uncert.all.within_photo",
  text: "These readings compare areas within one photo. They are not a measurement scale.",
  source: "uncertainty",
};

export const UNCERTAINTY_BANDS: UncertaintyStatement = {
  id: "uncert.all.bands",
  text: "Low, Moderate and Elevated are rough groupings, not exact amounts.",
  source: "uncertainty",
};

export const MISSING_TEXT = {
  hydration: "Photos cannot measure skin hydration.",
  pores: "Pore visibility has no reliable photo reading.",
  trend: "Readings from different checks cannot be lined up yet.",
  routine: "Your routine is not shared with Echo.",
  skin: "There is no photo reading for this check.",
  selfReported: "There are no quiz answers to draw on.",
  // One sentence for every cause, so a left-out section cannot point at a red flag.
  recommendation: "Product suggestions were not included here.",
} as const;

const missing = (key: string, about: MissingItem["about"], text: string): MissingItem => ({ id: `missing.all.${key}`, text, about });

const SCREENS = [CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST, CONFIDENCE, INSTRUCTION, NUMBER, PAST_EVENT, MEASUREMENT, BAND_NAME, UNMEASURED_WORDS];

/**
 * Outside text (catalog names, claims) must pass the same lexicons as Gemini's
 * answer, plus an instruction screen. A quote of it is exempt in the
 * validator, so it may carry no band, measurement or past-event word either.
 */
export function screenExternalText(text: string): boolean {
  if (!text.trim() || text.length > 300 || FORMAT_CHARS.test(text) || NON_LATIN.test(text.normalize("NFKC"))) return false;
  const folded = normalizeForMatch(text);
  return !SCREENS.some((re) => re.test(folded));
}

const SLUG = /^[a-z0-9-]{1,40}$/;

export interface TrustedSkin {
  scores: SkinScanScores;
  regionScores: Record<string, SkinScanScores>;
  regionLowConfidence: Record<string, boolean>;
  pipelineVersion: string | null;
}

export interface ProductLookup {
  productId: string;
  name: string;
  claimText: string;
}

export interface BuildInput {
  regionFocus: EchoRegion | null;
  message: string;
  skin: TrustedSkin | null;
  answers: SkinCheckAnswers;
  longitudinal?: LongitudinalResult[] | undefined;
  recommendation?: { result: RecommendationResult; products: ProductLookup[] } | undefined;
  safety?: SafetyState | undefined;
}

function readings(scores: SkinScanScores, region: ContextRegion, lowConfidence: boolean): MeasuredReading[] {
  const { bands } = bandScores(scores);
  return METRICS.map((metric) => {
    const band: ContextBand = bands[metric];
    const suffix = lowConfidence ? " (limited skin area visible)" : "";
    return {
      id: `state.${region}.${metric}`,
      text: `${METRIC_LABELS[metric]}, photo-based estimate for ${WHERE[region]}: ${band}${suffix}`,
      source: "measured",
      region,
      metric,
      band,
      lowConfidence,
    };
  });
}

/** One fact per (metric, region); "not enough evidence" only (owner decision O-3). Pairwise inputs are dropped. */
function longitudinalFacts(results: LongitudinalResult[]): { facts: ContextLongitudinal[]; droppedPairwise: boolean } {
  const groups = new Map<string, { metric: ContextMetric; region: Exclude<ContextRegion, "all">; comparable: boolean; codes: Set<NotEnoughEvidenceReasonCode> }>();
  let droppedPairwise = false;
  for (const r of results) {
    if (r.evidence !== "not_enough_evidence") {
      droppedPairwise = true;
      continue;
    }
    const metric = QUANTITY_METRIC[r.measured.quantity];
    const region = REGION_OF[r.measured.region];
    if (!metric || !region) continue;
    const key = `${region}.${metric}`;
    const g = groups.get(key) ?? { metric, region, comparable: true, codes: new Set() };
    g.comparable &&= r.comparability.verdict === "comparable";
    for (const reason of r.reasons) if (reason.code in REASON_TEXT) g.codes.add(reason.code);
    groups.set(key, g);
  }
  const order = Object.keys(REASON_TEXT) as NotEnoughEvidenceReasonCode[];
  const facts = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, g]): ContextLongitudinal[] => {
      const reasons = order.filter((c) => g.codes.has(c)).map((code) => ({ code, text: REASON_TEXT[code] }));
      if (reasons.length === 0) return [];
      return [
        {
          id: `long.${key}`,
          text: `${METRIC_LABELS[g.metric]}, ${WHERE[g.region]}: not enough evidence yet to say anything across checks.`,
          source: "measured",
          measured: { metric: g.metric, region: g.region },
          evidence: "not_enough_evidence",
          comparable: g.comparable,
          change: "not_evaluated",
          reasons: reasons as [(typeof reasons)[number], ...typeof reasons],
        },
      ];
    });
  return { facts, droppedPairwise };
}

function selfReported(answers: SkinCheckAnswers): SelfReportedStatement[] {
  const out: SelfReportedStatement[] = [];
  for (const step of SECTIONS.flatMap((s) => s.steps)) {
    if (GEMINI_FIELD_INVENTORY[step.id] !== "sent" || !(step.id in SELF_TOPICS)) continue;
    const field = step.id as GeminiAnswerField;
    // A slider option with no sublabel renders "1–2 L ()" in today's prompt; that text is left as it is there.
    const parts = describeStepAnswerParts(step, answers[step.id]).map((p) => p.replace(/ \(\)$/, ""));
    if (parts.length === 0) continue;
    // fresh: read from this check's own record. Reuse markers are a request (design §6).
    out.push({ id: `self.all.${field}`, text: `You told us your ${SELF_TOPICS[field]}: ${parts.join("; ")}`, source: "self_reported", field, fresh: true });
  }
  return out;
}

function recommendation(input: NonNullable<BuildInput["recommendation"]>): { section: ContextRecommendation | null; screened: boolean } {
  const { result, products } = input;
  if (!/^[\w.-]{1,40}$/.test(result.rulesetVersion)) return { section: null, screened: true };
  let screened = false;
  const seen = new Set<string>();
  const items: ContextRecommendation["items"] = [];
  for (const item of result.items) {
    if (seen.has(item.productId)) continue;
    seen.add(item.productId);
    const product = products.find((p) => p.productId === item.productId);
    if (!product || !SLUG.test(product.productId) || !screenExternalText(product.name) || !screenExternalText(product.claimText)) {
      screened = true;
      continue;
    }
    items.push({ id: `rec.${product.productId}`, text: product.claimText, productId: product.productId, productName: product.name });
  }
  return { section: items.length > 0 ? { rulesetVersion: result.rulesetVersion, items } : null, screened };
}

export function buildContextPackage(input: BuildInput): ContextPackage {
  // One list (lib/rules/settings.ts). The answers evaluateSafety named, plus the
  // same matcher over these answers in case the two inputs ever differ: the
  // flag can only be added, never removed.
  const raised = [...(input.safety?.extraCautionRaisedBy ?? []), ...extraCautionAnswers(input.answers)];
  const extraCaution = raised.length > 0;
  const missingItems: MissingItem[] = [
    missing("hydration", "hydration", MISSING_TEXT.hydration),
    missing("pores", "pores", MISSING_TEXT.pores),
    missing("routine", "routine", MISSING_TEXT.routine),
  ];

  const pkg: ContextPackage = {
    packageVersion: PACKAGE_VERSION,
    regionFocus: input.regionFocus,
    routine: { status: "not_shared", decision: "R-1 A" },
    safety: { extraCaution },
    uncertainty: [UNCERTAINTY, UNCERTAINTY_BANDS],
    missing: missingItems,
    // routine_as_directed is left out: R-1 A gives it nothing to cite.
    allowedClaims: ["descriptive", "self_reported_echo", "uncertainty", "comparability", "smalltalk", "clarify", "out_of_scope"],
    forbiddenClaims: [
      "unknown_fact_id", "citation_rule", "made_up_number", "medical_or_efficacy_term", "comparative_or_change", "non_latin_script",
      "band_mismatch", "made_up_past_event", "cause", "product_claim", "contradicts_package", "missing_uncertainty",
      "self_report_as_measurement", "diagnosis", "forecast", "self_assigned_confidence",
    ],
  };

  if (input.skin) {
    const focus = input.regionFocus;
    const focusScores = focus ? input.skin.regionScores[focus] : undefined;
    pkg.skin = {
      // Honest provenance: bands come from the scanAnalyses record, not a SkinState read (request to main).
      contractVersion: `scan-analysis-${SCAN_ANALYSIS_SCHEMA_VERSION}`,
      scoringVersion: SCORING_VERSION,
      pipelineVersion: input.skin.pipelineVersion ?? "unknown",
      readings: [
        ...readings(input.skin.scores, "all", false),
        ...(focus && focusScores ? readings(focusScores, focus, input.skin.regionLowConfidence[focus] === true) : []),
      ],
    };
  } else {
    missingItems.push(missing("skin", "skin", MISSING_TEXT.skin));
  }

  const { facts, droppedPairwise } = longitudinalFacts(input.longitudinal ?? []);
  if (facts.length > 0) pkg.longitudinal = facts;
  if (facts.length === 0 || droppedPairwise) missingItems.push(missing("trend", "trend", MISSING_TEXT.trend));

  // No red-flag special case: under a red flag the rules result is already base-routine-only.
  const rec = input.recommendation && PRODUCT_INTENT.test(input.message) ? recommendation(input.recommendation) : null;
  if (rec?.section) pkg.recommendation = rec.section;
  if (!rec?.section || rec.screened) missingItems.push(missing("recommendation", "recommendation", MISSING_TEXT.recommendation));

  // While extraCaution is on, the answer that set it is left out (privacy-report §5).
  const statements = selfReported(withoutCautionAnswers(input.answers, raised));
  if (statements.length > 0) pkg.selfReported = statements;
  else missingItems.push(missing("self_reported", "selfReported", MISSING_TEXT.selfReported));

  return pkg;
}

// ─── Allowlist serialiser ───────────────────────────────────────────────────

const fact = (f: Fact) => ({ id: f.id, text: f.text });

/** The only JSON Gemini sees. Every key is named here; an extra key on any input object is never copied. */
export function serializePackage(pkg: ContextPackage): Record<string, unknown> {
  const out: Record<string, unknown> = { packageVersion: pkg.packageVersion, regionFocus: pkg.regionFocus };
  if (pkg.skin) {
    out.skin = {
      contractVersion: pkg.skin.contractVersion,
      scoringVersion: pkg.skin.scoringVersion,
      pipelineVersion: pkg.skin.pipelineVersion,
      readings: pkg.skin.readings.map((r) => ({ ...fact(r), source: r.source, region: r.region, metric: r.metric, band: r.band, lowConfidence: r.lowConfidence })),
    };
  }
  if (pkg.longitudinal) {
    out.longitudinal = pkg.longitudinal.map((l) => ({
      ...fact(l),
      source: l.source,
      measured: { metric: l.measured.metric, region: l.measured.region },
      evidence: l.evidence,
      comparable: l.comparable,
      change: l.change,
      reasons: l.reasons.map((r) => ({ code: r.code, text: r.text })),
      ...(l.evidence === "pairwise" ? { confounders: l.confounders.map((c) => ({ ...fact(c), code: c.code })) } : {}),
    }));
  }
  if (pkg.routine) out.routine = { status: pkg.routine.status, decision: pkg.routine.decision };
  if (pkg.recommendation) {
    out.recommendation = {
      rulesetVersion: pkg.recommendation.rulesetVersion,
      items: pkg.recommendation.items.map((i) => ({ ...fact(i), productId: i.productId, productName: i.productName })),
    };
  }
  out.safety = { extraCaution: pkg.safety.extraCaution };
  if (pkg.selfReported) out.selfReported = pkg.selfReported.map((s) => ({ ...fact(s), source: s.source, field: s.field, fresh: s.fresh }));
  out.uncertainty = pkg.uncertainty.map((u) => ({ ...fact(u), source: u.source }));
  out.missing = pkg.missing.map((m) => ({ ...fact(m), about: m.about }));
  out.allowedClaims = [...pkg.allowedClaims];
  out.forbiddenClaims = [...pkg.forbiddenClaims];
  return out;
}

export const packageJson = (pkg: ContextPackage): string => JSON.stringify(serializePackage(pkg));
export const packageSha256 = (pkg: ContextPackage): string => createHash("sha256").update(packageJson(pkg)).digest("hex");

export type FactKind = "state" | "long" | "rec" | "self" | "uncert" | "missing" | "confounder";

export interface CitableFact extends Fact {
  kind: FactKind;
  band?: ContextBand;
  metric?: ContextMetric;
  region?: ContextRegion;
  productName?: string;
}

/** Every citable fact in the package, with the bits the validator needs. Ids are unique (tested). */
export function packageFacts(pkg: ContextPackage): CitableFact[] {
  return [
    ...(pkg.skin?.readings ?? []).map((r) => ({ ...fact(r), kind: "state" as const, band: r.band, metric: r.metric, region: r.region })),
    ...(pkg.longitudinal ?? []).flatMap((l) => [
      { ...fact(l), kind: "long" as const, metric: l.measured.metric, region: l.measured.region },
      ...(l.evidence === "pairwise" ? l.confounders.map((c) => ({ ...fact(c), kind: "confounder" as const })) : []),
    ]),
    ...(pkg.recommendation?.items ?? []).map((i) => ({ ...fact(i), kind: "rec" as const, productName: i.productName })),
    ...(pkg.selfReported ?? []).map((s) => ({ ...fact(s), kind: "self" as const })),
    ...pkg.uncertainty.map((u) => ({ ...fact(u), kind: "uncert" as const })),
    ...pkg.missing.map((m) => ({ ...fact(m), kind: "missing" as const })),
  ];
}
