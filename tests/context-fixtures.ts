// Test data for the context lane. Every value is synthetic. The internal
// results carry numbers, dates, refs, rule ids and triggers on purpose, so
// tests can prove none of them reaches the package.
import type { LongitudinalResult } from "@/lib/contracts/longitudinal-result";
import type { RecommendationResult } from "@/lib/contracts/recommendation-result";
import type { SafetyState } from "@/lib/contracts/safety-state";
import type { BuildInput, ProductLookup } from "@/lib/context/builder";
import type { GeminiAnswer } from "@/lib/context/validator";

// Distinct non-round values: a leaked number is easy to spot.
export const SCORES = { redness: 0.731, oiliness: 0.512, texture: 0.268, pores: 0.444, blemishes: 0.613, hydration: 0.127, pigment: 0.389 };
export const CHEEK_SCORES = { redness: 0.211, oiliness: 0.877, texture: 0.512, pores: 0.444, blemishes: 0.1, hydration: 0.5, pigment: 0.9 };

export const ANSWERS = {
  name: "ZZNAMEZZ",
  phone_verify: "+919999999999",
  gender: "female",
  age: "25_34",
  skin_type: "oily",
  primary_concerns: ["redness", "oiliness"],
  current_products: ["actives", "prescription"],
  female_skin_context: ["pregnant_or_breastfeeding"],
  water_intake: "1to2",
  ZZUNKNOWNZZ: "ZZUNKNOWNZZ",
};

export const SECRETS = [
  "uid-ZZSECRET",
  "scan-ZZSECRET",
  "ref-ZZSECRET",
  "rule-ZZSECRET",
  "2026-09-01",
  "0.731",
  "42.42",
  "sha-ZZSECRET",
  "female_skin_context",
  "pregnant_or_breastfeeding",
  "ZZNAMEZZ",
  "9999999999",
  "ZZUNKNOWNZZ",
];

const detail = {
  baselineValue: 42.42,
  latestValue: 43.43,
  difference: 1.01,
  noiseFloorValue: 0.5,
  unit: "a*",
  baselineAnalysisRefs: ["ref-ZZSECRET", "ref-2"] as [string, string],
  latestAnalysisRef: "ref-ZZSECRET",
  windowFrom: "2026-09-01",
  windowTo: "2026-09-14",
  engineBuilds: ["sha-ZZSECRET"],
};

export function nee(quantity: LongitudinalResult["measured"]["quantity"], region: LongitudinalResult["measured"]["region"], comparable = false): LongitudinalResult {
  return {
    contractVersion: "skinstate-2",
    measured: { quantity, region },
    evidence: "not_enough_evidence",
    reasons: [{ code: "noise_table_empty", text: "PRODUCER TEXT with 42.42 and a date 2026-09-01" }],
    detail,
    compared: { baseline: { rule: "first_3_comparable_scans", status: "insufficient", scans: 1 }, latest: "latest_comparable_scan" },
    comparability: comparable
      ? { verdict: "comparable", key: { contractVersion: "skinstate-2", fieldPath: quantity, region, pipelineVersion: "p", engineBuild: "sha-ZZSECRET", inputVariant: "live", captureMethod: "native", captureMethodAssertedBy: "client" } }
      : { verdict: "not_comparable", reasons: ["quantity_not_validated"] },
    noiseFloor: { status: "unknown", calibrationId: null },
    change: "not_evaluated",
    passedNoiseFloor: null,
  };
}

export const PAIRWISE: LongitudinalResult = {
  contractVersion: "skinstate-2",
  measured: { quantity: "colour.native.aStarMean", region: "forehead" },
  evidence: "pairwise",
  confounders: ["lighting_or_background"],
  detail,
  compared: { baseline: { rule: "first_3_comparable_scans", status: "established", scans: 3 }, latest: "latest_comparable_scan" },
  comparability: { verdict: "comparable", key: { contractVersion: "skinstate-2", fieldPath: "colour.native.aStarMean", region: "forehead", pipelineVersion: "p", engineBuild: "sha-ZZSECRET", inputVariant: "live", captureMethod: "native", captureMethodAssertedBy: "client" } },
  noiseFloor: { status: "known", calibrationId: "cal-ZZSECRET", noiseTableVersion: "n-1", toneBandPolicy: "most_conservative" },
  change: "beyond_noise",
  passedNoiseFloor: true,
  reasons: [{ code: "beyond_noise", text: "Different from your starting checks by more than photo-to-photo variation." }],
};

export const SAFETY: SafetyState = { rulesetVersion: "s-1", reviewStatus: "provisional", extraCaution: false, redFlag: false };
export const RED_SAFETY: SafetyState = { rulesetVersion: "s-1", reviewStatus: "provisional", extraCaution: true, redFlag: true, raisedBy: ["rule-ZZSECRET"] };

export const RECOMMENDATION: RecommendationResult = {
  rulesetVersion: "r-1",
  catalogVersion: "catalog-0-synthetic",
  inputSha256: "sha-ZZSECRET",
  reviewStatus: "provisional",
  fired: [{ ruleId: "rule-ZZSECRET", triggeredBy: [{ source: "self_reported", field: "female_skin_context", value: "pregnant_or_breastfeeding", fresh: true }] }],
  items: [
    { productId: "gentle-cleanser", productVersionId: "v-ZZSECRET", slot: "AM_PM", position: 1, ruleId: "rule-ZZSECRET" },
    { productId: "light-gel", productVersionId: "v-ZZSECRET", slot: "PM", position: 2, ruleId: "rule-ZZSECRET" },
  ],
  limits: [{ ruleId: "rule-ZZSECRET", text: "Keep following your prescriber's routine." }],
  notices: [{ ruleId: "rule-ZZSECRET", text: "pregnancy notice" }],
  unknowns: [],
  excluded: [{ productId: "retinol-serum", ruleId: "rule-ZZSECRET", reason: "pregnant_or_breastfeeding" }],
  safety: SAFETY,
};

export const PRODUCTS: ProductLookup[] = [
  { productId: "gentle-cleanser", name: "Gentle Cleanser", claimText: "A mild face wash for daily use." },
  { productId: "light-gel", name: "Light Gel", claimText: "A light gel that feels comfortable on oily skin." },
];

/** Adds identity and internal keys to every object, so the allowlist test can prove none is copied. */
export function withExtraKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withExtraKeys) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = { uid: "uid-ZZSECRET", scanId: "scan-ZZSECRET", redFlag: true, raisedBy: ["rule-ZZSECRET"], ruleId: "rule-ZZSECRET" };
    for (const [k, v] of Object.entries(value)) out[k] = withExtraKeys(v);
    return out as T;
  }
  return value;
}

export function fullInput(overrides: Partial<BuildInput> = {}): BuildInput {
  return {
    regionFocus: "cheeks",
    message: "what products should I use for my routine?",
    skin: { scores: SCORES, regionScores: { cheeks: CHEEK_SCORES, forehead: SCORES }, regionLowConfidence: { cheeks: true }, pipelineVersion: "scan-0.1.6-provisional" },
    answers: ANSWERS,
    longitudinal: [nee("colour.native.aStarMean", "cheek_image_left"), nee("colour.corrected.aStarP90", "cheek_image_right", true), nee("texture.lbpEntropy", "forehead"), PAIRWISE],
    recommendation: { result: RECOMMENDATION, products: PRODUCTS },
    safety: SAFETY,
    ...overrides,
  };
}

export const answer = (a: GeminiAnswer) => JSON.stringify(a);
