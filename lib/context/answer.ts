import type { ContextPackage } from "@/lib/contracts/context-package";
import type { EchoChatMessage } from "@/lib/gemini";
import { renderSystemInstruction, responseSchema } from "./renderer";
import { validateAnswer, type Validation } from "./validator";
import { COMPARISON_LEAD, DOCTOR_REFERRAL_COPY, REFERRAL_COPY } from "./prefilter";
import type { SafetyState } from "@/lib/contracts/safety-state";
import { COPY } from "@/lib/rules/settings";
import { OWN_PRODUCTS, PRODUCT_DOCTOR_LINE, PRODUCT_DOCTOR_LINE_ON, RESULT_QUESTION, RESULT_QUESTION_LINE } from "./products";
const OWN_PRODUCT_NAMES = OWN_PRODUCTS.map((p) => p.name);

// Reject, retry and fallback (docs/lanes/context-design.md §3.7).

export type Generate = (systemInstruction: string, messages: EchoChatMessage[], schema: Record<string, unknown>) => Promise<{ text: string; modelId: string }>;

export interface ValidatorRecord {
  passed: boolean;
  failures: string[];
  regenerated: boolean;
  fallback: boolean;
}

/** A suggested own product and Gemini's reason, both checked (TD-34). The app draws the card from the catalogue. */
export interface ShownProduct {
  productId: string;
  reason: string;
}

export interface AnswerOutcome {
  reply: string;
  referral: boolean;
  modelId: string;
  validator: ValidatorRecord;
  /** TD-34: only from an answer that passed; empty otherwise. */
  products: ShownProduct[];
  /** The reply without the claims that cite a product: what a red-flag user may see. */
  withoutProducts: string;
  /** Any suggested product or any claim citing one: the guards apply. */
  productContent: boolean;
}

/** The reading texts for the focus region (or the whole face), then one uncertainty text. Package text only, one per line. */
export function fallbackLines(pkg: ContextPackage): string[] {
  const readings = pkg.skin?.readings ?? [];
  const focus = readings.filter((r) => r.region === pkg.regionFocus);
  return [...(focus.length > 0 ? focus : readings.filter((r) => r.region === "all")).map((r) => r.text), pkg.uncertainty[0].text];
}

/** A package text as a sentence: our fact texts ("Redness, ...: Moderate") have no full stop of their own. */
export const sentence = (text: string): string => (/[.!?:]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`);

// ponytail: a short word list, two hits make Hinglish; a wrong guess only changes the lead's language.
const HINGLISH_WORD = /\b(?:mera|mere|meri|merko|mujhe|mujhko|kya|kaise|kyun|kyu|batao|btao|bataiye|batayein|hai|hain|nahi|nahin|aap|aapka|aapki|acc?ha|kuch|ke|ki|ka|baa?re|mei|mein|karo|kare|karu|yeh|ye|wala|wali|liye|chahiye|samjhao|bolo)\b/gi;
export const isHinglish = (message: string): boolean => new Set((message.match(HINGLISH_WORD) ?? []).map((w) => w.toLowerCase())).size >= 2;

/** The lead of the fixed answer, in the user's language (English, or Hinglish in Latin letters). */
export const FALLBACK_LEAD = "Echo couldn't answer that in a way we can check. Here is what this photo showed:";
export const FALLBACK_LEAD_HINGLISH = "Echo iska jawab check karke nahi de saki. Is photo mein yeh dikha:";

/** F28: a card reason never repeats its lead-in ("You told us You told us …"). */
export const oneLeadIn = (reason: string): string => reason.trim().replace(/\b(you told us|aapne bataya)(?:[\s:,]+\1\b)+/gi, "$1");

/** F-row 2026-10-11: a lead line, then each fact as its own sentence on its own line, never joined fragments. */
export const fallbackAnswer = (pkg: ContextPackage, message = ""): string =>
  [isHinglish(message) ? FALLBACK_LEAD_HINGLISH : FALLBACK_LEAD, ...fallbackLines(pkg).map(sentence)].join("\n");

/** F11: the line added to the fixed reply when the check has no questionnaire answers. */
export const FINISH_QUESTIONNAIRE_COPY = "Finish the Skin Check questions for this check, so Echo can help with your questions.";
export const comparisonAnswer = (pkg: ContextPackage): string => [COMPARISON_LEAD, ...fallbackLines(pkg).map(sentence)].join("\n");

const NO_RETRY_CHECKS = new Set(["non_latin_script", "malformed_output"]);

const names = (...vs: Validation[]) => Array.from(new Set(vs.flatMap((v) => v.failures.map((f) => f.check))));

export async function answerFromPackage(
  pkg: ContextPackage,
  message: string,
  history: EchoChatMessage[],
  opts: { generate: Generate }
): Promise<AnswerOutcome> {
  const contents = [...history, { role: "user" as const, text: message }];
  const schema = responseSchema(pkg);

  const first = await opts.generate(renderSystemInstruction(pkg), contents, schema);
  const v1 = validateAnswer(first.text, pkg, message);
  const done = (v: Validation[], regenerated: boolean, modelId: string): AnswerOutcome => {
    const last = v[v.length - 1]!;
    // Either signal wins (GEMINI_BOUNDARY §6): the model asking for a referral is never overruled.
    // Red team pass 2 (I02 P2-1): a claim that reads as self-harm or another red flag is a referral too.
    const flagged = v.some((x) => x.redFlag);
    // F16: the model's own medical words in a refusal ("I cannot recommend any medicines") are no crisis
    // when it also said "no distress"; the user's turns already passed the full pre-filter.
    const doctorOnly = !v.some((x) => x.crisis) && v.every((x) => x.answer?.distress === false);
    const plain = (reply: string, referral: boolean, validator: ValidatorRecord): AnswerOutcome => ({ reply, referral, modelId, validator, products: [], withoutProducts: reply, productContent: false });
    if (flagged) return plain(doctorOnly ? DOCTOR_REFERRAL_COPY : REFERRAL_COPY, true, { passed: false, failures: names(...v), regenerated, fallback: false });
    // F16: the crisis line goes with any distress, and with any referral that does not say "no distress" explicitly.
    if (last.answer?.needs_referral || last.answer?.distress === true) {
      const reply = last.answer.distress === false ? DOCTOR_REFERRAL_COPY : REFERRAL_COPY;
      return plain(reply, true, { passed: last.passed, failures: names(...v), regenerated, fallback: false });
    }
    if (last.passed) {
      const claims = last.answer!.claims;
      // F27: in Hinglish, each claim on its own line, so our English fact texts never run into Hinglish words.
      const join = (cs: typeof claims) => cs.map((c) => sentence(c.text)).join(isHinglish(message) ? "\n" : " ");
      return {
        reply: join(claims),
        referral: false,
        modelId,
        validator: { passed: true, failures: names(...v), regenerated, fallback: false },
        products: (last.answer!.products ?? []).map((p) => ({ productId: p.product_id, reason: oneLeadIn(p.reason) })),
        // Under a red flag only claims that cite a fact and no product remain: no uncited sales lead-in (safety review).
        withoutProducts: join(claims.filter((c) => c.fact_ids.length > 0 && !c.fact_ids.some((id) => id.startsWith("rec.")))),
        productContent: (last.answer!.products ?? []).length > 0 || claims.some((c) => c.fact_ids.some((id) => id.startsWith("rec."))),
      };
    }
    return plain(fallbackAnswer(pkg, message), false, { passed: false, failures: names(...v), regenerated, fallback: true });
  };

  if (v1.passed || v1.answer?.needs_referral || v1.answer?.distress === true) return done([v1], false, first.modelId);
  // F20 (owner, 2026-10-10): the retry depends on the answer only, never on the safety state, which can
  // come from a hidden answer: every user gets the same calls. The guards are applied after (productGuard).
  const unsafeToRetry = v1.userPremise || v1.failures.some((f) => NO_RETRY_CHECKS.has(f.check));
  if (unsafeToRetry) return done([v1], false, first.modelId);

  const second = await opts.generate(renderSystemInstruction(pkg, names(v1)), contents, schema);
  return done([v1, validateAnswer(second.text, pkg, message)], true, second.modelId);
}

// ─── TD-34 guards: in code, after Gemini answered ───────────────────────────
//
// Applied to the reply the user sees, never to what Gemini receives: the
// stored turn (Gemini's later history) keeps the unguarded text, so two users
// who differ only in a hidden answer still send Gemini the same requests.

export type ProductGuard = "red_flag" | "doctor_line" | "result_question" | null;

/**
 * A result question first; then a pregnancy, breastfeeding or prescription answer (the extra-caution list), while the doctor line is on.
 * Owner decision TD-45 (2026-10-11): a questionnaire red flag no longer blocks products; the opening shows the note once (openingNote).
 * "red_flag" is set by the caller only for a red-flag chat message earlier on this check.
 */
export function productGuard(safety: SafetyState, message = ""): ProductGuard {
  // Our own product names ("Clear Seal") are not a result word.
  const asked = OWN_PRODUCT_NAMES.reduce((t, n) => t.replace(new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " "), message);
  if (RESULT_QUESTION.test(asked)) return "result_question";
  return safety.extraCaution && PRODUCT_DOCTOR_LINE_ON ? "doctor_line" : null;
}

/** TD-45: the dermatologist note, once, as the opening's first line (the app shows it as its own panel). */
export const openingNote = (safety: SafetyState, reply: string): string => (safety.redFlag ? `${COPY.referral}\n${reply}` : reply);

/**
 * What the user sees. Under a red flag: the dermatologist line first and no
 * product at all (cards or claims). With the doctor line: the fixed line after
 * any product content. The opening is always product content.
 */
export function guardedReply(
  outcome: Pick<AnswerOutcome, "reply" | "products" | "withoutProducts" | "productContent">,
  guard: ProductGuard,
  opening = false
): { reply: string; products: ShownProduct[] } {
  const productContent = outcome.productContent || outcome.products.length > 0;
  if (guard === "red_flag" && (productContent || opening)) return { reply: [COPY.referral, outcome.withoutProducts].filter((t) => t.trim()).join("\n"), products: [] };
  if (guard === "result_question" && productContent) return { reply: [outcome.withoutProducts, RESULT_QUESTION_LINE].filter((t) => t.trim()).join("\n"), products: [] };
  if (guard === "doctor_line" && productContent) return { reply: `${outcome.reply}\n${PRODUCT_DOCTOR_LINE}`, products: outcome.products };
  return { reply: outcome.reply, products: outcome.products };
}
