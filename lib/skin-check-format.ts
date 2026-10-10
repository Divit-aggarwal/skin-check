import { SECTIONS } from "@/lib/skin-check-steps";
import { RECONFIRM_EACH_SCAN_IDS } from "@/lib/skin-check-validation";
import { bandScores } from "@/lib/skin-check-rules";
import { isPhotoMetric, type PhotoMetric } from "@/lib/skin-check-skus";
import type { SkinCheckAnswers, StepAnswerValue, StepConfig } from "@/types/skin-check";
import type { SkinScanScores } from "@/types/skin-scan";

export function formatPrompt(prompt: string, answers: SkinCheckAnswers): string {
  const name = answers.name;
  const nameStr = typeof name === "string" && name.trim() ? name.trim() : "there";
  return prompt.replace(/\{name\}/g, nameStr);
}

// Turns a raw /skin-check answer (a value slug, e.g. "4" or ["papules_pustules"])
// into the human-readable label/reflection text a person would recognize — used
// to ground Echo's chat context in plain language instead of opaque slugs.
// One entry per selected option (the context builder keeps them apart).
export function describeStepAnswerParts(step: StepConfig, value: StepAnswerValue | undefined): string[] {
  if (value === undefined) return [];
  if (typeof value === "string" && !value.trim()) return [];

  switch (step.type) {
    case "text":
      return typeof value === "string" ? [value] : [];
    case "phone":
    case "photo-capture":
      // Contact info and the capture action itself carry no skin signal.
      return [];
    case "single-select-chips": {
      const label = step.options.find((o) => o.value === value)?.label;
      return label ? [label] : [];
    }
    case "single-select-cards": {
      const option = step.options.find((o) => o.value === value);
      return option ? [`${option.label} — ${option.description}`] : [];
    }
    case "multi-select-cards":
    case "body-map":
      if (!Array.isArray(value)) return [];
      // Unknown values are dropped, never echoed: answers are browser-written
      // (users/{uid}/skinChecks) and this text lands in Echo's systemInstruction
      // (gate 02). Only option labels from our own config reach the prompt.
      return value.flatMap((v) => step.options.find((o) => o.value === v)?.label ?? []);
    case "scale-1-5": {
      const reflection = typeof value === "string" ? step.reflections[value] : undefined;
      return reflection ? [reflection] : [];
    }
    case "segmented-slider": {
      const option = step.options.find((o) => o.value === value);
      return option ? [`${option.label} (${option.sublabel})`] : [];
    }
    default:
      return [];
  }
}

function describeStepAnswer(step: StepConfig, value: StepAnswerValue | undefined): string | null {
  const parts = describeStepAnswerParts(step, value);
  return parts.length > 0 ? parts.join(", ") : null;
}

// Human-readable grounding text for Echo's chat context (lib/gemini.ts) — the
// /skin-check funnel's answers are stored as opaque value slugs, so this maps
// each answered step back to its prompt + selected label/reflection text.
//
// H03b: `isSent` is the allowlist. lib/gemini.ts always passes one built from
// GEMINI_FIELD_INVENTORY, so only steps marked "sent" reach the prompt.
export function summarizeSkinCheckAnswers(answers: SkinCheckAnswers, isSent: (stepId: string) => boolean = () => true): string {
  const lines: string[] = [];
  for (const section of SECTIONS) {
    for (const step of section.steps) {
      if (!isSent(step.id)) continue;
      const described = describeStepAnswer(step, answers[step.id]);
      if (described) lines.push(`${step.prompt} ${described}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "No quiz answers provided.";
}

/**
 * Decision 10(a): "Last time you said: …" for each re-confirmed step the
 * previous scan answered, keyed by step id. Only labels from our own config,
 * like summarizeSkinCheckAnswers. For display under a blank step; never an answer.
 */
export function reconfirmHints(previous: SkinCheckAnswers): Record<string, string> {
  const hints: Record<string, string> = {};
  for (const step of SECTIONS.flatMap((s) => s.steps)) {
    if (!RECONFIRM_EACH_SCAN_IDS.includes(step.id)) continue;
    const described = describeStepAnswer(step, previous[step.id]);
    if (described) hints[step.id] = `Last time you said: ${described}`;
  }
  return hints;
}

// hydration is labeled "Dryness" - see lib/skin-check-skus.ts's METRIC_LABELS
// comment. Same reasoning, same relabel, kept in sync across every site
// (this one feeds Echo's prompt context, not a screen, but Echo should
// narrate the same label a user already saw).
const SKIN_SCAN_CATEGORY_LABELS: Record<keyof SkinScanScores, string> = {
  redness: "Redness",
  oiliness: "Oiliness",
  texture: "Texture irregularity",
  pores: "Pore visibility",
  blemishes: "Blemishes",
  hydration: "Dryness",
  pigment: "Pigmentation",
};

// Matches the bands now shown on the dashboard (Step 3) — Low/Moderate/
// Elevated, not raw numbers (bands-not-numbers is a locked decision, see
// lib/skin-check-rules.ts). Pores has no band (see that file's exclusion
// comment) and is left out here rather than printed with a fake one.
// Gemini-only. Hydration ("Dryness") is not sent either (H03, owner decision
// 8): a photo can't measure it, and Echo should not narrate it.
export function summarizeSkinScanScores(scores: SkinScanScores): string {
  const { bands } = bandScores(scores);
  return (Object.keys(SKIN_SCAN_CATEGORY_LABELS) as (keyof SkinScanScores)[])
    // TD-37 (1): Redness and Oiliness only.
    .filter((key): key is PhotoMetric => isPhotoMetric(key))
    .map((key) => `${SKIN_SCAN_CATEGORY_LABELS[key]}: ${bands[key]}`)
    .join("\n");
}
