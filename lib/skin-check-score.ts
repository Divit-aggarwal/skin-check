import type { SkinScanScores } from "@/types/skin-scan";
import type { Band, BandableMetric } from "@/lib/skin-check-rules";

// hydration is the one skin-scan map framed positively (higher = more
// hydrated = healthier). The other 6 are concern-framed, so they invert
// before any comparison. Kept exported because skin-check-rules.ts derives
// concern space from it — one definition of direction, not two.
export const POSITIVE_TRAITS: (keyof SkinScanScores)[] = ["hydration"];

export function healthValue(scores: SkinScanScores, key: keyof SkinScanScores): number {
  const raw = scores[key];
  return POSITIVE_TRAITS.includes(key) ? raw : 1 - raw;
}

// ============================================================================
// WHAT WAS REMOVED HERE, AND WHY IT IS NOT COMING BACK
//
// This file used to export computeCompositeScore(), returning a 0-100 number
// plus a confidence level, both of which the dashboard rendered — the number
// at 3rem, directly over the user's face.
//
// Three separate problems, any one of which is disqualifying:
//
//   1. It contradicted the project's own locked decision: results are shown
//      as BANDS, never numbers. A two-digit score next to a face is
//      fabricated precision that reads as a clinical claim.
//
//   2. It was arithmetically wrong. The mean ran over all 7 keys including
//      `pores`, which returns exactly 0.0 on every real photo. healthValue()
//      inverts that to a perfect 1.0, so a metric that measures nothing
//      contributed a guaranteed ~14.3 points to every user's score. The
//      scale had a floor of 14 and a systematic upward bias.
//
//   3. `confidence: "high"` was a hardcoded literal. Every successful scan
//      claimed high confidence, on heuristics that CALIBRATION.md says are
//      not comparable across users or across repeat scans of the same user.
//      That badge was the most legally exposed element on the page and it
//      was a constant.
//
// What replaces it is a summary of which concerns actually banded highest —
// derived from the same rule engine that drives the display and the SKU
// selection, so the sentence and the tiles can never disagree.
// ============================================================================

export interface ConcernSummary {
  /** Metrics that banded Elevated, then Moderate, ordered by concern desc. */
  topConcerns: BandableMetric[];
  /** One line, derived from topConcerns. Never contains a number. */
  summaryLine: string;
}

// Kept as an alias so the deferred /echo surface, the chat route schema and
// the session context keep compiling. Those consumers only ever read
// summaryLine; the score and confidence fields they used are gone.
export type CompositeScore = ConcernSummary;

const CONCERN_NOUNS: Record<BandableMetric, string> = {
  redness: "redness",
  oiliness: "oiliness",
  texture: "texture",
  blemishes: "breakouts",
  hydration: "dryness",
  pigment: "dark marks",
};

export function summarizeConcerns(
  scores: SkinScanScores,
  bands: Record<BandableMetric, Band>
): ConcernSummary {
  const ranked = (Object.keys(bands) as BandableMetric[])
    .filter((m) => bands[m] !== "Low")
    .sort((a, b) => (1 - healthValue(scores, b)) - (1 - healthValue(scores, a)));

  return { topConcerns: ranked, summaryLine: summaryLineFor(ranked) };
}

function summaryLineFor(ranked: BandableMetric[]): string {
  if (ranked.length === 0) {
    return "Nothing stood out in this photo. Keep doing what you're doing.";
  }
  if (ranked.length === 1) {
    return `${cap(CONCERN_NOUNS[ranked[0]!])} is the one thing worth attention right now.`;
  }
  const [first, second] = ranked;
  return `${cap(CONCERN_NOUNS[first!])} and ${CONCERN_NOUNS[second!]} came through strongest.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
