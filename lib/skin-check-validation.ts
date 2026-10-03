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

/**
 * What a phone step stores once Firebase has verified the number (D-19): a
 * marker, never the number. The number lives in Firebase Auth and
 * users/{uid}.phoneNumber only.
 */
export const PHONE_VERIFIED = "verified";

export function isStepAnswerValid(step: StepConfig, value: StepAnswerValue): boolean {
  if (Array.isArray(value)) return value.length > 0;
  if (!value.trim()) return false;
  // A legacy number still validates, so drafts saved before D-19 restore.
  if (step.type === "phone") return value === PHONE_VERIFIED || isValidPhone(value);
  return true;
}

// Answers that belong to one scan attempt and never carry into the next:
// identity is re-asserted by Firebase each time, and every scan needs its own
// photo and its own explicit "Get my results" tap.
const PER_SCAN_ANSWER_IDS = ["phone_verify", "skin_photo", "final_phone"];

/**
 * Asked again on every scan, never carried over silently (D-19): a months-old
 * pregnancy, contraception or prescription answer must not be reused by
 * default. Decision 10(a): the step starts blank; last time's answer is shown
 * as a hint only (lastAnswerHints in useSkinCheckFlow), never pre-filled.
 */
export const RECONFIRM_EACH_SCAN_IDS = ["current_products", "female_skin_context"];

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
    if (PER_SCAN_ANSWER_IDS.includes(id) || RECONFIRM_EACH_SCAN_IDS.includes(id)) continue;
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
        // Re-confirmed steps are asked again on this scan, so their absence
        // doesn't make the saved questionnaire incomplete.
        .filter((step) => !RECONFIRM_EACH_SCAN_IDS.includes(step.id))
        .every((step) => isStepAnswerValid(step, reusable[step.id] ?? defaultAnswerFor(step)))
  );
  return complete ? reusable : null;
}
