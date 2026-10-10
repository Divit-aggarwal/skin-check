import type { ContextPackage } from "@/lib/contracts/context-package";
import type { EchoChatMessage } from "@/lib/gemini";
import { renderSystemInstruction, responseSchema } from "./renderer";
import { validateAnswer, type Validation } from "./validator";
import { COMPARISON_LEAD, DOCTOR_REFERRAL_COPY, REFERRAL_COPY } from "./prefilter";
import type { SafetyState } from "@/lib/contracts/safety-state";
import { COPY } from "@/lib/rules/settings";
import { PRODUCT_DOCTOR_LINE, PRODUCT_DOCTOR_LINE_ON } from "./products";

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
}

/** The reading texts for the focus region (or the whole face), then one uncertainty text. Package text only, one per line. */
export function fallbackLines(pkg: ContextPackage): string[] {
  const readings = pkg.skin?.readings ?? [];
  const focus = readings.filter((r) => r.region === pkg.regionFocus);
  return [...(focus.length > 0 ? focus : readings.filter((r) => r.region === "all")).map((r) => r.text), pkg.uncertainty[0].text];
}

export const fallbackAnswer = (pkg: ContextPackage): string => fallbackLines(pkg).join("\n");

/** F11: the line added to the fixed reply when the check has no questionnaire answers. */
export const FINISH_QUESTIONNAIRE_COPY = "Finish the Skin Check questions for this check, so Echo can help with your questions.";
export const comparisonAnswer = (pkg: ContextPackage): string => [COMPARISON_LEAD, ...fallbackLines(pkg)].join("\n");

const NO_RETRY_CHECKS = new Set(["non_latin_script", "malformed_output"]);

const names = (...vs: Validation[]) => Array.from(new Set(vs.flatMap((v) => v.failures.map((f) => f.check))));

export async function answerFromPackage(
  pkg: ContextPackage,
  message: string,
  history: EchoChatMessage[],
  opts: { generate: Generate; redFlag: boolean }
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
    const plain = (reply: string, referral: boolean, validator: ValidatorRecord): AnswerOutcome => ({ reply, referral, modelId, validator, products: [], withoutProducts: reply });
    if (flagged) return plain(doctorOnly ? DOCTOR_REFERRAL_COPY : REFERRAL_COPY, true, { passed: false, failures: names(...v), regenerated, fallback: false });
    // F16: the crisis line goes with any distress, and with any referral that does not say "no distress" explicitly.
    if (last.answer?.needs_referral || last.answer?.distress === true) {
      const reply = last.answer.distress === false ? DOCTOR_REFERRAL_COPY : REFERRAL_COPY;
      return plain(reply, true, { passed: last.passed, failures: names(...v), regenerated, fallback: false });
    }
    if (last.passed) {
      const claims = last.answer!.claims;
      const join = (cs: typeof claims) => cs.map((c) => c.text.trim()).join(" ");
      return {
        reply: join(claims),
        referral: false,
        modelId,
        validator: { passed: true, failures: names(...v), regenerated, fallback: false },
        products: (last.answer!.products ?? []).map((p) => ({ productId: p.product_id, reason: p.reason.trim() })),
        // Under a red flag only claims that cite a fact and no product remain: no uncited sales lead-in (safety review).
        withoutProducts: join(claims.filter((c) => c.fact_ids.length > 0 && !c.fact_ids.some((id) => id.startsWith("rec.")))),
      };
    }
    return plain(fallbackAnswer(pkg), false, { passed: false, failures: names(...v), regenerated, fallback: true });
  };

  if (v1.passed || v1.answer?.needs_referral || v1.answer?.distress === true) return done([v1], false, first.modelId);
  const unsafeToRetry = opts.redFlag || v1.userPremise || v1.failures.some((f) => NO_RETRY_CHECKS.has(f.check));
  if (unsafeToRetry) return done([v1], false, first.modelId);

  const second = await opts.generate(renderSystemInstruction(pkg, names(v1)), contents, schema);
  return done([v1, validateAnswer(second.text, pkg, message)], true, second.modelId);
}

// ─── TD-34 guards: in code, after Gemini answered ───────────────────────────
//
// Applied to the reply the user sees, never to what Gemini receives: the
// stored turn (Gemini's later history) keeps the unguarded text, so two users
// who differ only in a hidden answer still send Gemini the same requests.

export type ProductGuard = "red_flag" | "doctor_line" | null;

/** A red flag first; then a pregnancy, breastfeeding or prescription answer (the extra-caution list), while the doctor line is on. */
export function productGuard(safety: SafetyState): ProductGuard {
  if (safety.redFlag) return "red_flag";
  return safety.extraCaution && PRODUCT_DOCTOR_LINE_ON ? "doctor_line" : null;
}

/**
 * What the user sees. Under a red flag: the dermatologist line first and no
 * product at all (cards or claims). With the doctor line: the fixed line after
 * any product content. The opening is always product content.
 */
export function guardedReply(
  outcome: Pick<AnswerOutcome, "reply" | "products" | "withoutProducts">,
  guard: ProductGuard,
  opening = false
): { reply: string; products: ShownProduct[] } {
  const productContent = outcome.products.length > 0 || outcome.withoutProducts !== outcome.reply;
  if (guard === "red_flag" && (productContent || opening)) return { reply: [COPY.referral, outcome.withoutProducts].filter((t) => t.trim()).join("\n"), products: [] };
  if (guard === "doctor_line" && productContent) return { reply: `${outcome.reply}\n${PRODUCT_DOCTOR_LINE}`, products: outcome.products };
  return { reply: outcome.reply, products: outcome.products };
}
