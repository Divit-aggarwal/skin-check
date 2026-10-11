import type { SkinScanScores } from "@/types/skin-scan";
import type { Band, BandableMetric } from "@/lib/skin-check-rules";
import { isShownMetric } from "@/lib/skin-check-skus";

// hydration is the one skin-scan map framed positively (higher = more
// hydrated = healthier). The other 6 are concern-framed, so they invert
// before any comparison. Kept exported because skin-check-rules.ts derives
// concern space from it — one definition of direction, not two.
export const POSITIVE_TRAITS: (keyof SkinScanScores)[] = ["hydration"];

export function healthValue(scores: SkinScanScores, key: keyof SkinScanScores): number {
  const raw = scores[key];
  return POSITIVE_TRAITS.includes(key) ? raw : 1 - raw;
}

// No composite 0-100 score or confidence level, by locked decision: results
// are bands, never numbers. Instead, a summary of the concerns that banded
// highest, from the same rule engine as the display.

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
  // The five shown readings (TD-40); never Dryness.
  const ranked = (Object.keys(bands) as BandableMetric[])
    .filter((m) => isShownMetric(m) && bands[m] !== "Low")
    .sort((a, b) => (1 - healthValue(scores, b)) - (1 - healthValue(scores, a)));

  return { topConcerns: ranked, summaryLine: summaryLineFor(ranked) };
}

function summaryLineFor(ranked: BandableMetric[]): string {
  if (ranked.length === 0) {
    // No claim about the user's routine (red team I02, E-F5).
    return "Nothing stood out in this photo.";
  }
  if (ranked.length === 1) {
    return `${cap(CONCERN_NOUNS[ranked[0]!])} is the one thing worth attention right now.`;
  }
  const [first, second] = ranked;
  return `${cap(CONCERN_NOUNS[first!])} and ${CONCERN_NOUNS[second!]} came through strongest.`;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
