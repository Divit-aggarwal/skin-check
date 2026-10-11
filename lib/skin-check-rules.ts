import type { SkinScanResult, SkinScanScores } from "@/types/skin-scan";
import { POSITIVE_TRAITS, healthValue } from "@/lib/skin-check-score";

// Recomputed on every render from the already-stored scores/region_raw, not
// stored itself (yet - step 5). Bump this string whenever BAND_THRESHOLDS or
// SKU_RULES below change, so a future scans.scoring_version column lets old
// rows be recomputed under the version that actually produced their bands
// instead of silently reinterpreting them under new cut points.
export const SCORING_VERSION = "v0-provisional";

export type Band = "Low" | "Moderate" | "Elevated";

// pores is excluded from every rule: it reads 0.0 on every real photo (a
// broken metric, see pores.py:81), so a band would falsely say "no concern".
// Re-include once pores.py is fixed upstream.
export type BandableMetric = Exclude<keyof SkinScanScores, "pores">;

const BANDABLE_METRICS: BandableMetric[] = [
  "redness",
  "oiliness",
  "texture",
  "blemishes",
  "hydration",
  "pigment",
];

// ============================================================================
// WHAT THESE THRESHOLDS ACTUALLY CUT - READ BEFORE CHANGING OR TRUSTING THEM.
//
// scores[metric] (toConcern()'s input, below) is NOT a calibrated severity
// measurement. Every src/pipeline/maps/*.py map in the CV service z-scores
// THIS PHOTO'S OWN face pixels and then min-max stretches the result back to
// [0,1] - see redness.py:83-97 for the canonical example: `z_scores =
// (a_decoded - mu) / sigma` computed from that image's own face_vals, then
// stretched against `z_scores[face_mask].min()`/`.max()`, also that image's
// own. CALIBRATION.md names this directly: "A min-max normalized array
// always spans close to [0, 1] regardless of how severe the underlying
// condition actually is... the severity signal gets divided out by the
// normalization step, before the score is even computed."
//
// So bands are NOT comparable across users or across scans of the same
// user: never read them as population data or as "improved since last scan".
// The fix is to derive bands from region_hist (fixed-edge histograms, stored
// since PIPELINE_VERSION 0.1.1) once a labeled photo set exists.
// ============================================================================
//
// Cut points against CONCERN-space value in [0,1] (0 = no concern this
// metric represents, 1 = max concern) - keyed per metric, even though every
// metric starts on the same numbers today, so recalibrating one metric
// against real labeled data is a value edit here, not a refactor. See
// toConcern() below for how a metric's raw [0,1] score maps into this
// shared space (hydration inverts; the other five don't).
//
// Skewed toward Low/Moderate: uncalibrated scores should not call skin
// Elevated without strong evidence (concern >= 0.45). 0.20/0.45 only separate
// what the fixture photo showed; they are not calibrated.
export const BAND_THRESHOLDS: Record<BandableMetric, { low: number; moderate: number }> = {
  redness: { low: 0.20, moderate: 0.45 },
  oiliness: { low: 0.20, moderate: 0.45 },
  texture: { low: 0.20, moderate: 0.45 },
  blemishes: { low: 0.20, moderate: 0.45 },
  hydration: { low: 0.20, moderate: 0.45 },
  pigment: { low: 0.20, moderate: 0.45 },
};

// scores[key] is concern-framed for 6 of the 7 categories (higher = more of
// that concern) and positively framed for hydration (higher = healthier) -
// see lib/skin-check-score.ts's POSITIVE_TRAITS. healthValue() already
// encodes that distinction; concern is just 1 - health, so every metric
// lands in the same [0,1] "how much of a concern is this" space regardless
// of which way its raw score points.
// Exported so display sites (e.g. the numeric score next to each band on the
// results dashboard) derive their number from the exact same concern-space
// value that produced the band next to it — computing the two from different
// formulas is how you get a number and a band that quietly disagree.
export function toConcern(scores: SkinScanScores, metric: BandableMetric): number {
  return 1 - healthValue(scores, metric);
}

// Band words mean concern level for every metric (Low = least concern). No
// per-metric flip: hydration is labelled "Dryness" instead.
function bandForConcern(metric: BandableMetric, concern: number): Band {
  const t = BAND_THRESHOLDS[metric];
  if (concern < t.low) return "Low";
  if (concern < t.moderate) return "Moderate";
  return "Elevated";
}

export interface RuleTraceEntry {
  /** Stable id, e.g. "band:redness" or "sku:sunscreen-baseline". Not user-facing - for explainability/debugging and, eventually, Echo narration. */
  rule: string;
  /** The value this rule evaluated - a concern-space number for band rules, a Band for SKU rules, null where there's nothing to key on (e.g. the always-on baseline). */
  input: number | Band | null;
  /** Whether this rule's action applied. Band rules are true unless excluded (pores). SKU rules are true only when their condition matched - the false entries are what make a recommendation explainable later: which rules were considered and didn't fire, not just which ones did. */
  fired: boolean;
  /** One-line human-readable reason, independent of `rule`/`input` so a trace reader doesn't have to reverse-engineer the code to know what happened. */
  detail: string;
}

export interface SkuRule {
  sku: string;
  /** Null for the always-on baseline. Otherwise evaluated against each metric's band - bands mean concern-level uniformly now, so this reads as "is there concern here" for every metric including hydration with no flip to account for. */
  condition: ((bands: Record<BandableMetric, Band>) => boolean) | null;
  detail: string;
}

// Provisional placeholder catalog - these are stand-in identifiers, not real
// Shopify product/variant IDs (none exist in this codebase yet; see
// PROJECT_CONTEXT.md's "four SKUs" note). Replace wholesale, alongside
// BAND_THRESHOLDS, once real product data and real calibration exist -
// that's the "one edit" this file is designed for, not a rewrite.
export const SKU_RULES: SkuRule[] = [
  {
    sku: "sunscreen-spf50-provisional",
    condition: null,
    detail: "Always-on baseline recommendation, independent of any band.",
  },
  {
    sku: "niacinamide-serum-provisional",
    condition: (b) => b.pigment !== "Low" || b.blemishes !== "Low",
    detail: "Pigment or blemish concern at Moderate or Elevated.",
  },
  {
    sku: "gentle-cleanser-provisional",
    condition: (b) => b.oiliness !== "Low",
    detail: "Oiliness concern at Moderate or Elevated.",
  },
  {
    sku: "hydrating-moisturizer-provisional",
    condition: (b) => b.hydration !== "Low" || b.texture !== "Low",
    // b.hydration is concern-level like every other metric now (Low concern
    // = well hydrated), so "!== Low" means "there IS a hydration concern" -
    // same comparison shape as every other rule here, no flip to remember.
    detail: "Hydration concern at Moderate or Elevated, or texture concern at Moderate or Elevated.",
  },
];

interface BandedScores {
  bands: Record<BandableMetric, Band>;
  trace: RuleTraceEntry[];
}

// Bands one SkinScanScores (whole face or one region): the same thresholds
// for callers that have no full SkinScanResult.
export function bandScores(scores: SkinScanScores): BandedScores {
  const trace: RuleTraceEntry[] = [];
  const bands = {} as Record<BandableMetric, Band>;

  for (const metric of BANDABLE_METRICS) {
    const concern = toConcern(scores, metric);
    const band = bandForConcern(metric, concern);
    bands[metric] = band;

    trace.push({
      rule: `band:${metric}`,
      input: Number(concern.toFixed(4)),
      fired: true,
      detail: POSITIVE_TRAITS.includes(metric)
        ? `concern=${concern.toFixed(3)} (1 - raw hydration score, hydration is positively framed) -> ${band}`
        : `concern=${concern.toFixed(3)} -> ${band}`,
    });
  }

  trace.push({
    rule: "band:pores",
    input: Number(scores.pores.toFixed(4)),
    fired: false,
    detail:
      "Excluded - pores.py returns exactly 0.0 on every real photo today (known-broken metric, not a genuine reading). Not banded, not used for SKU selection.",
  });

  return { bands, trace };
}

export interface SkinCheckRulesResult {
  bands: Record<BandableMetric, Band>;
  skus: string[];
  rule_trace: RuleTraceEntry[];
  scoring_version: string;
}

// Pure function: same SkinScanResult in, same output out, no I/O, no LLM.
// Deterministic by construction - see SKU_RULES' comment above and the
// project's locked decision that an LLM never selects a SKU, only narrates
// one already selected here.
export function runSkinCheckRules(result: SkinScanResult): SkinCheckRulesResult {
  const { bands, trace } = bandScores(result.scores);

  const skus: string[] = [];
  for (const rule of SKU_RULES) {
    const fired = rule.condition === null || rule.condition(bands);
    if (fired) skus.push(rule.sku);
    trace.push({
      rule: `sku:${rule.sku}`,
      input: null,
      fired,
      detail: rule.detail,
    });
  }

  return { bands, skus, rule_trace: trace, scoring_version: SCORING_VERSION };
}
