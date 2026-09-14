import { SECTIONS } from "@/lib/skin-check-steps";
import type { SkinCheckAnswers, StepAnswerValue, StepConfig } from "@/types/skin-check";

function normalizeDigits(value: string) {
  return value.replace(/\D/g, "");
}

export function isValidPhone(value: string) {
  const digits = normalizeDigits(value);
  return digits.length === 10 || (digits.length === 12 && digits.startsWith("91"));
}

export function defaultAnswerFor(step: StepConfig): StepAnswerValue {
  return step.type === "multi-select-cards" || step.type === "body-map" ? [] : "";
}

export function isStepAnswerValid(step: StepConfig, value: StepAnswerValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!value.trim()) return false;
  if (step.type === "phone") return isValidPhone(value);
  return true;
}

// Answers that belong to one scan attempt and never carry into the next:
// identity is re-asserted by Firebase each time, and every scan needs its own
// photo and its own explicit "Get my results" tap.
const PER_SCAN_ANSWER_IDS = ["phone_verify", "skin_photo", "final_phone"];

/** Sections every scan goes through, even when the questionnaire is reused. */
export const PER_SCAN_SECTION_IDS = new Set(["verify", "skin-photo", "get-your-results"]);

/**
 * A previous scan's questionnaire, ready to reuse for a new scan, or null when
 * it can't be reused: an under-18 answer, or questions added since it was
 * saved — skipping those would store an incomplete record.
 */
export function reusableAnswers(answers: SkinCheckAnswers): SkinCheckAnswers | null {
  const reusable: SkinCheckAnswers = {};
  for (const [id, value] of Object.entries(answers)) {
    if (PER_SCAN_ANSWER_IDS.includes(id)) continue;
    if (typeof value === "string" || (Array.isArray(value) && value.every((v) => typeof v === "string"))) {
      reusable[id] = value;
    }
  }
  if (reusable.age === "under-18") return null;
  const complete = SECTIONS.every(
    (section) =>
      PER_SCAN_SECTION_IDS.has(section.id) ||
      section.steps
        .filter((step) => !step.condition || step.condition(reusable))
        .every((step) => isStepAnswerValid(step, reusable[step.id] ?? defaultAnswerFor(step)))
  );
  return complete ? reusable : null;
}
