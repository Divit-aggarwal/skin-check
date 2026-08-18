import { z } from "zod";
import {
  ConcernSchema,
  ConcernDurationSchema,
  SymptomSchema,
  SkinTypeSchema,
  PriorTreatmentSchema,
  AllergyStatusSchema,
  AgeRangeSchema,
  GenderSchema,
  type PartialAssessmentAnswers,
} from "@/types/assessment";

// ─── Shared ─────────────────────────────────────────────────────────────────

export const ConfidenceSchema = z.enum(["high", "medium", "low"]);
export const SeveritySchema = z.enum(["none", "mild", "moderate", "noticeable"]);

// ─── Vision result (analyzeSkinImage) ──────────────────────────────────────

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});

export const VisionCategorySchema = z.enum([
  "breakouts",
  "texture",
  "redness",
  "pigmentation",
  "oiliness",
  "dryness",
  "dark_circles",
  "puffiness",
]);

export const VisionZoneSchema = z.enum([
  "forehead",
  "left_cheek",
  "right_cheek",
  "chin",
  "nose",
  "under_eyes",
  "jawline",
]);

export const VisionRegionSchema = z.object({
  category: VisionCategorySchema,
  zone: VisionZoneSchema,
  severity: SeveritySchema,
  bounding_box: BoundingBoxSchema,
});

export const VisionCategorySummarySchema = z.object({
  breakouts: SeveritySchema,
  texture: SeveritySchema,
  redness: SeveritySchema,
  pigmentation: SeveritySchema,
  oiliness: SeveritySchema,
  dryness: SeveritySchema,
  dark_circles: SeveritySchema,
  puffiness: SeveritySchema,
});

export const VisionAnalyzableResultSchema = z.object({
  analyzable: z.literal(true),
  overall_confidence: ConfidenceSchema,
  regions: z.array(VisionRegionSchema),
  category_summary: VisionCategorySummarySchema,
});

export const VisionUnanalyzableResultSchema = z.object({
  analyzable: z.literal(false),
  reason: z.string(),
});

export const VisionResultSchema = z.discriminatedUnion("analyzable", [
  VisionAnalyzableResultSchema,
  VisionUnanalyzableResultSchema,
]);

export type BoundingBox = z.infer<typeof BoundingBoxSchema>;
export type VisionRegion = z.infer<typeof VisionRegionSchema>;
export type VisionAnalyzableResult = z.infer<typeof VisionAnalyzableResultSchema>;
export type VisionResult = z.infer<typeof VisionResultSchema>;

// ─── Synthesis result (computeSkinAssessment) ──────────────────────────────

export const RecommendationSchema = z.object({
  type: z.enum(["look_for", "avoid"]),
  text: z.string(),
});

export const SubScoresSchema = z.object({
  breakouts: z.number(),
  texture: z.number(),
  redness: z.number(),
  hydration: z.number(),
});

export const SynthesisResultSchema = z.object({
  overall_score: z.number(),
  confidence: ConfidenceSchema,
  summary_line: z.string(),
  sub_scores: SubScoresSchema,
  root_cause_tags: z.array(z.string()),
  recommendations_blocked: z.boolean(),
  recommendations: z.array(RecommendationSchema),
});

export type Recommendation = z.infer<typeof RecommendationSchema>;
export type SubScores = z.infer<typeof SubScoresSchema>;
export type SynthesisResult = z.infer<typeof SynthesisResultSchema>;

// computeSkinAssessment's quiz input — reuses AssessmentContext's shape as-is.
// Partial because the allergy hard-gate must tolerate a missing/incomplete
// allergy_status rather than assume the zod-required shape always holds.
export type QuizAnswers = PartialAssessmentAnswers;

// Request-body validation for the compute routes. Built from the same atomic
// field schemas as AssessmentAnswersSchema (types/assessment.ts) rather than
// calling .partial() on it directly — that schema is wrapped in superRefine(),
// which only ZodObject exposes .partial() on, not the resulting ZodEffects.
export const QuizAnswersSchema = z
  .object({
    concern: ConcernSchema,
    concern_duration: ConcernDurationSchema,
    symptoms: z.array(SymptomSchema),
    skin_type: SkinTypeSchema,
    prior_treatments: z.array(PriorTreatmentSchema),
    allergy_status: AllergyStatusSchema,
    medication_details: z.string(),
    condition_details: z.string(),
    age_range: AgeRangeSchema,
    gender: GenderSchema,
  })
  .partial();
