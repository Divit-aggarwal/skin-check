import type { SkinScanResult, SkinScanScores } from "@/types/skin-scan";
import { POSITIVE_TRAITS, healthValue } from "@/lib/skin-check-score";

// Recomputed on every render from the already-stored scores/region_raw, not
// stored itself (yet - step 5). Bump this string whenever BAND_THRESHOLDS or
// SKU_RULES below change, so a future scans.scoring_version column lets old
// rows be recomputed under the version that actually produced their bands
// instead of silently reinterpreting them under new cut points.
export const SCORING_VERSION = "v0-provisional";

export type Band = "Low" | "Moderate" | "Elevated";

// pores is excluded from every rule below, not merely unbanded by omission -
// it returns exactly 0.0 on every real photo today (a broken/non-measuring
// metric, confirmed empirically, not a genuinely low reading - see
// pores.py:81's duplicate pore_density/pore_density_per_kpx and the CV
// audit). Banding a metric that never measures anything would always
// produce the best possible band and silently claim "no pore concern" -
// worse, feeding that into SKU selection would recommend products off a
// signal that was never real. Re-include once pores.py is fixed upstream.
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
// Consequence: no choice of cut points below makes bands comparable ACROSS
// USERS, or across repeat scans of the SAME user. They only separate where
// one photo's own metrics landed relative to each other after that photo's
// own contrast was stretched to fill [0,1]. Do not read a distribution of
// bands as population data, and do not build a "your skin improved since
// last scan" feature on top of these - both would be reading noise as
// signal.
//
// The real fix already exists and isn't wired up here: region_hist (fixed-
// edge histograms, stored on every scan since PIPELINE_VERSION 0.1.1) is
// built specifically to let absolute thresholds be applied RETROACTIVELY
// once a real, labeled photo set exists - that's the entire reason those
// fixed edges were added instead of another per-image-relative statistic.
// Re-deriving bands from region_hist instead of scores is the post-
// collection recalibration this file is provisional pending on (see
// PROJECT_CONTEXT.md's dermatologist-rubric dependency) - not a hypothetical
// future nice-to-have, the specific next version of this file.
// ============================================================================
//
// Cut points against CONCERN-space value in [0,1] (0 = no concern this
// metric represents, 1 = max concern) - keyed per metric, even though every
// metric starts on the same numbers today, so recalibrating one metric
// against real labeled data is a value edit here, not a refactor. See
// toConcern() below for how a metric's raw [0,1] score maps into this
// shared space (hydration inverts; the other five don't).
//
// Skewed toward Low/Moderate, same reasoning as above: these scores are
// heuristics with no calibration behind them (CALIBRATION.md - "do not use
// [the CV service's own constants] to score real users" applies here too;
// nothing downstream is any more calibrated). Telling an early user their
// skin is Elevated on that basis is the wrong error to make, so Elevated
// requires strong evidence (concern >= 0.45) rather than a coin-flip
// threshold at 0.5 - v0's first cut (low: 0.45, moderate: 0.75) put 5 of 6
// concern values from the one real fixture photo below the Low ceiling,
// which is a constant function, not a conservative one; these numbers were
// picked to at least separate what was actually observed (redness 0.383 vs.
// oiliness 0.124), not because 0.20/0.45 are themselves calibrated - see the
// block above for why nothing here can be.
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

// The ONLY band a metric gets - no separate display-space value. Band words
// mean concern-level uniformly at every metric and every render site: Low
// always means least concern, Elevated always means most. There is
// deliberately no per-metric flip here (there used to be one, for
// hydration) - a flip meant "Low" carried opposite meanings on the same
// screen depending on which row it was next to (Redness: Low = good,
// Hydration: Low = bad), which a user has no way to know without reading
// this file. The metric that needed its own direction gets its own LABEL
// instead (see METRIC_LABELS/CATEGORY_LABELS/SKIN_SCAN_CATEGORY_LABELS'
// "Dryness" override for hydration, at each render site) - the word means
// one thing everywhere; the label is what tells you which trait it's about.
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

// Bands a single SkinScanScores object (whole-face `scores`, or one region's
// entry from `region_scores` - both are the same shape). Exported on its
// own, not just inlined into runSkinCheckRules() below, because /echo's
// region-scoped display (EchoPage.tsx) only ever has a bare SkinScanScores
// for one region, never a full SkinScanResult to build the whole-face
// engine's other outputs (skus, scoring_version) from - it still needs the
// identical threshold logic, not a second copy of it.
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
