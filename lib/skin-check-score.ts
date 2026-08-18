import type { SkinScanScores } from "@/types/skin-scan";

// hydration is the one skin-scan map that's framed positively (higher =
// more hydrated = healthier). The other 6 are concern-framed — higher means
// more of that concern (more redness, more oiliness, etc.) — so they invert
// before averaging. Equal weighting across all 7 for now; there's no
// evidence-based weighting model yet, revisit with real product input
// rather than guessing at weights.
// Exported so ScoreRadar.tsx uses the identical convention — a chart where
// "further out = healthier" but the axis used raw scores would plot high
// redness as a strength, contradicting this same score's own
// higher-is-healthier reading directly above it.
export const POSITIVE_TRAITS: (keyof SkinScanScores)[] = ["hydration"];

export function healthValue(scores: SkinScanScores, key: keyof SkinScanScores): number {
  const raw = scores[key];
  return POSITIVE_TRAITS.includes(key) ? raw : 1 - raw;
}

export interface CompositeScore {
  score: number; // 0-100, higher = healthier
  confidence: "high" | "medium" | "low";
  summaryLine: string;
}

// Deterministic, local — no LLM call. computeSkinAssessment() in lib/gemini.ts
// is a real Gemini synthesis call keyed to the old QuizAnswers/VisionResult
// shapes and would burn quota needlessly for a value derivable directly from
// the 7 numbers the skin-scan service already returns.
export function computeCompositeScore(scores: SkinScanScores): CompositeScore {
  const keys = Object.keys(scores) as (keyof SkinScanScores)[];

  const healthSum = keys.reduce((sum, key) => sum + healthValue(scores, key), 0);

  const score = Math.round((healthSum / keys.length) * 100);

  return {
    score,
    // A real photo was measured across all 7 maps — this is the
    // photo-inclusive, higher-confidence path (see CLAUDE.md's confidence
    // rule). The scan-failure path never reaches this function at all.
    confidence: "high",
    summaryLine: summaryLineFor(score),
  };
}

function summaryLineFor(score: number): string {
  if (score >= 80) return "Your skin looks calm today — keep this up.";
  if (score >= 60) return "Mostly steady, with a couple of things worth watching.";
  if (score >= 40) return "A few areas may be asking for a little more attention.";
  return "Your skin may be going through a rough patch right now.";
}
