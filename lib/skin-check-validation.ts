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

// ─── Optional questionnaire (TD-33 (1), docs/design/optional-questionnaire.md) ─

/** The optional questions: everything after the photo except the final save step. */
export const QUESTION_SECTION_IDS = new Set(["your-skin", "personal-context", "diet-hydration", "sun-protection"]);

/** The one hand-typed estimate behind "about N minutes". */
export const SECONDS_PER_QUESTION = 10;

/** The optional questions this user would be asked (the gender branch decides one). */
export function questionSteps(answers: SkinCheckAnswers): StepConfig[] {
  return SECTIONS.filter((s) => QUESTION_SECTION_IDS.has(s.id)).flatMap((s) =>
    s.steps.filter((step) => !step.condition || step.condition(answers))
  );
}

export const questionMinutes = (count: number) => Math.max(1, Math.ceil((count * SECONDS_PER_QUESTION) / 60));

export const QUESTION_STEP_IDS = new Set(
  SECTIONS.filter((s) => QUESTION_SECTION_IDS.has(s.id)).flatMap((s) => s.steps.map((step) => step.id))
);

/** Whether any optional question is answered (own keys only). Name, age and gender do not count. */
export function hasQuestionAnswers(answers: Record<string, unknown>): boolean {
  return Object.keys(answers).some((id) => QUESTION_STEP_IDS.has(id) && Object.hasOwn(answers, id));
}

/**
 * Safety review (TD-33, MED-1): the questions done "enough" for Echo. Every
 * question the safety and red-flag rules read, of those this user is asked
 * (the female branch only for female), has a valid answer. Anything less is
 * no answers (F11), so missing answers never read as "no red flag".
 */
export const SAFETY_QUESTION_IDS = ["primary_concerns", "breakout_pattern", "pih_scar_tendency", "current_products", "female_skin_context"] as const;
export function safetyQuestionsAnswered(answers: Record<string, unknown>): boolean {
  return SAFETY_QUESTION_IDS.every((id) => {
    const step = SECTIONS.flatMap((s) => s.steps).find((s) => s.id === id)!;
    if (step.condition && !step.condition(answers as SkinCheckAnswers)) return true;
    const v = Object.hasOwn(answers, id) ? answers[id] : undefined;
    return (typeof v === "string" || (Array.isArray(v) && v.every((x) => typeof x === "string"))) && isStepAnswerValid(step, v as StepAnswerValue);
  });
}

/** Only the optional questions' answers: what an answer-later record may hold. */
export function questionAnswersOnly(answers: SkinCheckAnswers): SkinCheckAnswers {
  return Object.fromEntries(Object.entries(answers).filter(([id]) => QUESTION_STEP_IDS.has(id)));
}

const BASIC_IDS = ["name", "age", "gender"];

/**
 * TD-33 (1): the last check skipped the questions, so only name, age and
 * gender carry over and the user is offered the choice again, with no
 * re-confirm steps. null for an under-18 answer or missing basics.
 */
export function reusableBasics(answers: SkinCheckAnswers): SkinCheckAnswers | null {
  if (hasQuestionAnswers(answers) || answers.age === "under-18") return null;
  const step = (id: string) => SECTIONS[0]!.steps.find((s) => s.id === id)!;
  const basics = Object.fromEntries(BASIC_IDS.flatMap((id) => (typeof answers[id] === "string" ? [[id, answers[id]]] : [])));
  return BASIC_IDS.every((id) => isStepAnswerValid(step(id), basics[id] ?? "")) ? basics : null;
}

// ─── Product-name boxes (TD-33 (2)) ─────────────────────────────────────────

export const PRODUCT_NAME_MAX = 200;

/** current_products option → its key in `productNames`. The only two free-text fields. */
export const PRODUCT_NAME_OPTIONS = { prescription: "prescription", other_products: "other" } as const;
export type ProductNameKey = (typeof PRODUCT_NAME_OPTIONS)[keyof typeof PRODUCT_NAME_OPTIONS];
export type ProductNames = Partial<Record<ProductNameKey, string>>;

/** A stored productNames value, read safely: only the two keys, only non-empty strings. */
export function productNamesFrom(raw: unknown): ProductNames {
  const out: ProductNames = {};
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return out;
  for (const key of Object.values(PRODUCT_NAME_OPTIONS)) {
    const v = (raw as Record<string, unknown>)[key];
    if (typeof v === "string" && v) out[key] = v;
  }
  return out;
}

/** Each name's heading where it is shown back: its option's own label in the questionnaire. */
export function productNameLabel(key: ProductNameKey): string {
  const step = SECTIONS.flatMap((s) => s.steps).find((s) => s.id === "current_products");
  const option = Object.entries(PRODUCT_NAME_OPTIONS).find(([, k]) => k === key)![0];
  return step && "options" in step ? step.options.find((o) => o.value === option)?.label ?? option : option;
}

/**
 * The names to keep for this current_products answer: only for options still
 * picked, trimmed, never empty, at most PRODUCT_NAME_MAX. Kept out of
 * `answers` everywhere, so nothing that reads answers can reach them.
 */
export function keptProductNames(currentProducts: StepAnswerValue | undefined, names: ProductNames): ProductNames {
  const picked = Array.isArray(currentProducts) ? currentProducts : [];
  const out: ProductNames = {};
  for (const [option, key] of Object.entries(PRODUCT_NAME_OPTIONS)) {
    // Over the limit is dropped, not cut: a cut can split an emoji in two.
    const text = names[key]?.trim();
    if (picked.includes(option) && text && text.length <= PRODUCT_NAME_MAX) out[key] = text;
  }
  return out;
}
