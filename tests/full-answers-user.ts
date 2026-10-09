// A made-up user with every questionnaire answer filled in and readings for
// every face area, so Echo's fact list is as long as it gets (tracker F19).
// The real failure on 2026-10-09 was a user like this asking about the
// forehead. All values are synthetic.
import type { BuildInput } from "@/lib/context/builder";
import { SKINSTATE_FIELD_PATHS } from "@/lib/comparability";
import { longitudinalResult } from "@/lib/longitudinal/engine";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { toSkinState2, type SkinState2Result } from "@/lib/skin-state-2";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

export const FULL_UID = "made-up-full-answers";
export const FULL_SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

/**
 * Every questionnaire step with an answer, the multi-selects with several
 * values. Male, because male_skin_context is sent to Gemini and
 * female_skin_context is not, so a male user has one more fact.
 */
export const FULL_ANSWERS = {
  name: "Made Up",
  age: "25-34",
  gender: "male",
  primary_concerns: ["blemishes", "pigment", "redness", "texture", "pores", "hydration", "oiliness"],
  skin_type: "combination",
  breakout_pattern: ["small_bumps", "red_inflamed", "deep_painful", "leaves_dark_marks", "leaves_scars"],
  acne_areas: ["forehead", "nose", "cheeks", "chin_jawline", "neck", "shoulders_back_chest"],
  pih_scar_tendency: "dark_mark_lingers",
  skin_tone: "fitz_4",
  current_products: ["cleanser_moisturizer", "actives"],
  male_skin_context: ["shaving_irritation", "sweat_gear_irritation", "exercise_sweat_breakouts"],
  skin_factors: ["stress", "poor_sleep", "heat_humidity_sweat", "recent_diet_changes"],
  diet: ["dairy", "whey_protein", "sugar_desserts", "fried_packaged"],
  water_intake: "1to2",
  sunscreen_habit: "occasionally",
};

const score = (base: number) => ({ redness: base, oiliness: base + 0.1, texture: base - 0.1, pores: 0.4, blemishes: base + 0.05, hydration: 0.5, pigment: base - 0.05 });

/** Readings for the whole face and all four areas, as the trusted context gives them. */
export const FULL_SKIN = {
  scores: score(0.5),
  regionScores: { forehead: score(0.6), nose: score(0.7), cheeks: score(0.45), chin: score(0.55) },
  regionLowConfidence: {},
  pipelineVersion: "scan-0.1.6-provisional",
  schemaVersion: 1,
};

/** A one-check series, as lib/skin-state-2-loader.ts gives it for a first check. */
export function fullSeries(): SkinState2Result[] {
  const sha = "a".repeat(64);
  const result = { ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec" };
  const data = {
    ...buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId: FULL_SCAN_ID, inputSha256: sha, requestId: "r-full", captureMethod: "native" }),
    createdAt: new Date("2026-10-09T10:00:00Z"),
  };
  return [toSkinState2(data, `users/${FULL_UID}/scanAnalyses/${scanAnalysisDocId(FULL_SCAN_ID, sha)}`, FULL_UID)];
}

const REGIONS = ["forehead", "nose", "chin", "cheeks", "cheek_image_left", "cheek_image_right"] as const;

/** The package input as lib/context/chat.ts builds it for this user (no recommendation section in production). */
export function fullAnswersInput(regionFocus: BuildInput["regionFocus"], safety: BuildInput["safety"]): BuildInput {
  const series = fullSeries();
  return {
    regionFocus,
    message: "What does my reading here mean?",
    skin: FULL_SKIN,
    answers: FULL_ANSWERS,
    longitudinal: SKINSTATE_FIELD_PATHS.flatMap((q) => REGIONS.map((r) => longitudinalResult(series, q, r))),
    safety,
  };
}
