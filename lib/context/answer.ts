import type { ContextPackage } from "@/lib/contracts/context-package";
import type { EchoChatMessage } from "@/lib/gemini";
import { renderSystemInstruction, responseSchema } from "./renderer";
import { validateAnswer, type Validation } from "./validator";
import { COMPARISON_LEAD, REFERRAL_COPY } from "./prefilter";

// Reject, retry and fallback (docs/lanes/context-design.md §3.7).

export type Generate = (systemInstruction: string, messages: EchoChatMessage[], schema: Record<string, unknown>) => Promise<{ text: string; modelId: string }>;

export interface ValidatorRecord {
  passed: boolean;
  failures: string[];
  regenerated: boolean;
  fallback: boolean;
}

export interface AnswerOutcome {
  reply: string;
  referral: boolean;
  modelId: string;
  validator: ValidatorRecord;
}

/** The reading texts for the focus region (or the whole face), then one uncertainty text. Package text only, one per line. */
export function fallbackLines(pkg: ContextPackage): string[] {
  const readings = pkg.skin?.readings ?? [];
  const focus = readings.filter((r) => r.region === pkg.regionFocus);
  return [...(focus.length > 0 ? focus : readings.filter((r) => r.region === "all")).map((r) => r.text), pkg.uncertainty[0].text];
}

export const fallbackAnswer = (pkg: ContextPackage): string => fallbackLines(pkg).join("\n");
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
    if (last.answer?.needs_referral) return { reply: REFERRAL_COPY, referral: true, modelId, validator: { passed: last.passed, failures: names(...v), regenerated, fallback: false } };
    if (last.passed) return { reply: last.answer!.claims.map((c) => c.text.trim()).join(" "), referral: false, modelId, validator: { passed: true, failures: names(...v), regenerated, fallback: false } };
    return { reply: fallbackAnswer(pkg), referral: false, modelId, validator: { passed: false, failures: names(...v), regenerated, fallback: true } };
  };

  if (v1.passed || v1.answer?.needs_referral) return done([v1], false, first.modelId);
  const unsafeToRetry = opts.redFlag || v1.userPremise || v1.failures.some((f) => NO_RETRY_CHECKS.has(f.check));
  if (unsafeToRetry) return done([v1], false, first.modelId);

  const second = await opts.generate(renderSystemInstruction(pkg, names(v1)), contents, schema);
  return done([v1, validateAnswer(second.text, pkg, message)], true, second.modelId);
}
