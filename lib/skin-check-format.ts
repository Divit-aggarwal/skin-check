import { SECTIONS } from "@/lib/skin-check-steps";
import { bandScores } from "@/lib/skin-check-rules";
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
function describeStepAnswer(step: StepConfig, value: StepAnswerValue | undefined): string | null {
  if (value === undefined) return null;
  if (Array.isArray(value) && value.length === 0) return null;
  if (typeof value === "string" && !value.trim()) return null;

  switch (step.type) {
    case "text":
      return typeof value === "string" ? value : null;
    case "phone":
    case "photo-capture":
      // Contact info and the capture action itself carry no skin signal.
      return null;
    case "single-select-chips":
      return step.options.find((o) => o.value === value)?.label ?? null;
    case "single-select-cards": {
      const option = step.options.find((o) => o.value === value);
      return option ? `${option.label} — ${option.description}` : null;
    }
    case "multi-select-cards":
    case "body-map": {
      if (!Array.isArray(value)) return null;
      // Unknown values are dropped, never echoed: answers are browser-written
      // (users/{uid}/skinChecks) and this text lands in Echo's systemInstruction
      // (gate 02). Only option labels from our own config reach the prompt.
      const labels = value.flatMap((v) => step.options.find((o) => o.value === v)?.label ?? []);
      return labels.length > 0 ? labels.join(", ") : null;
    }
    case "scale-1-5":
      return typeof value === "string" ? step.reflections[value] ?? null : null;
    case "segmented-slider": {
      const option = step.options.find((o) => o.value === value);
      return option ? `${option.label} (${option.sublabel})` : null;
    }
    default:
      return null;
  }
}

// Human-readable grounding text for Echo's chat context (lib/gemini.ts) — the
// /skin-check funnel's answers are stored as opaque value slugs, so this maps
// each answered step back to its prompt + selected label/reflection text.
export function summarizeSkinCheckAnswers(answers: SkinCheckAnswers): string {
  const lines: string[] = [];
  for (const section of SECTIONS) {
    for (const step of section.steps) {
      const described = describeStepAnswer(step, answers[step.id]);
      if (described) lines.push(`${step.prompt} ${described}`);
    }
  }
  return lines.length > 0 ? lines.join("\n") : "No quiz answers provided.";
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
export function summarizeSkinScanScores(scores: SkinScanScores): string {
  const { bands } = bandScores(scores);
  return (Object.keys(SKIN_SCAN_CATEGORY_LABELS) as (keyof SkinScanScores)[])
    .filter((key) => key !== "pores")
    .map((key) => `${SKIN_SCAN_CATEGORY_LABELS[key]}: ${bands[key]}`)
    .join("\n");
}
