import { z } from "zod";

// ─── Card 1 — Primary concern + timeline ───────────────────────────────────

export const ConcernSchema = z.enum([
  "acne_breakouts",
  "aging_fine_lines",
  "pigmentation_dark_spots",
  "sensitivity_redness",
  "dullness_texture",
]);

export const ConcernDurationSchema = z.enum([
  "just_started",
  "few_months",
  "over_a_year",
  "years_on_and_off",
]);

// ─── Card 2 — Symptoms ─────────────────────────────────────────────────────

export const SymptomSchema = z.enum([
  "itching",
  "burning",
  "tightness",
  "flaking",
  "sensitivity_to_touch",
  "none",
]);

// ─── Card 3 — Self-perceived skin type ─────────────────────────────────────

export const SkinTypeSchema = z.enum(["oily", "dry", "combination", "sensitive"]);

// ─── Card 4 — Prior treatments tried ───────────────────────────────────────

export const PriorTreatmentSchema = z.enum([
  "otc_products",
  "prescription_treatment",
  "home_remedies",
  "dermatologist_visit",
  "nothing_yet",
]);

// ─── Card 5 — Allergies / medications / diagnosed conditions (hard gate) ───

export const AllergyStatusSchema = z.enum([
  "no_known_allergies",
  "currently_on_medication",
  "diagnosed_condition",
]);

// ─── Card 6 — Age + sex/gender ──────────────────────────────────────────────

export const AgeRangeSchema = z.enum(["under_18", "18_24", "25_34", "35_44", "45_plus"]);

export const GenderSchema = z.enum([
  "female",
  "male",
  "non_binary",
  "prefer_not_to_say",
]);

// ─── Full assessment state ─────────────────────────────────────────────────

export const AssessmentAnswersSchema = z
  .object({
    concern: ConcernSchema,
    concern_duration: ConcernDurationSchema,
    symptoms: z.array(SymptomSchema).min(1),
    skin_type: SkinTypeSchema,
    prior_treatments: z.array(PriorTreatmentSchema).min(1),
    allergy_status: AllergyStatusSchema,
    medication_details: z.string().optional(),
    condition_details: z.string().optional(),
    age_range: AgeRangeSchema,
    gender: GenderSchema,
  })
  .superRefine((data, ctx) => {
    if (
      data.allergy_status === "currently_on_medication" &&
      !data.medication_details?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["medication_details"],
        message: "Please specify.",
      });
    }
    if (
      data.allergy_status === "diagnosed_condition" &&
      !data.condition_details?.trim()
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["condition_details"],
        message: "Please specify.",
      });
    }
  });

export type AssessmentAnswers = z.infer<typeof AssessmentAnswersSchema>;
export type Concern = z.infer<typeof ConcernSchema>;
export type ConcernDuration = z.infer<typeof ConcernDurationSchema>;
export type Symptom = z.infer<typeof SymptomSchema>;
export type SkinType = z.infer<typeof SkinTypeSchema>;
export type PriorTreatment = z.infer<typeof PriorTreatmentSchema>;
export type AllergyStatus = z.infer<typeof AllergyStatusSchema>;
export type AgeRange = z.infer<typeof AgeRangeSchema>;
export type Gender = z.infer<typeof GenderSchema>;

export type PartialAssessmentAnswers = Partial<AssessmentAnswers>;
