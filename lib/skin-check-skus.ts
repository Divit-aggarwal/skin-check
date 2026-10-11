import type { Band, BandableMetric } from "@/lib/skin-check-rules";
import type { SkinCheckAnswers } from "@/types/skin-check";

/**
 * Display layer for the SKUs that lib/skin-check-rules.ts already selects.
 *
 * The rule engine returns placeholder ids (`sunscreen-spf50-provisional` etc.)
 * and a rule_trace explaining why each one fired — and until now the dashboard
 * discarded both and rendered a hardcoded paragraph identical for every user.
 * This maps those ids onto real products so the recommendation can actually
 * be shown, with the reason attached.
 *
 * `accent` matches the per-SKU colours defined in the Shopify theme's
 * settings_schema (color_sky, color_serum-lilac, color_mint, ...), so a
 * product looks like itself on both sides of the funnel.
 *
 * TWO THINGS TO CONFIRM BEFORE THIS SHIPS:
 *  - `handle` values are guesses. Replace with the real Shopify product
 *    handles; a wrong handle is a 404 at the most commercially important
 *    click in the flow.
 *  - The theme names colours for Sunscreen, Cleanser, Serum, Clear Seal and
 *    Active Boba. It does NOT name one for the moisturiser — `sku-active-boba`
 *    below is my assignment, not the theme's. Change it if that's wrong.
 */

export interface SkuDisplay {
  name: string;
  /** Shopify product handle — verify before shipping. */
  handle: string;
  /** Key into SKU_ACCENT_CLASS below — not a class name itself. */
  accent: string;
  /** Plain-language line. What it does, not what it claims. */
  blurb: string;
}

/**
 * Static lookup, not `` `bg-${accent}` `` — Tailwind's JIT compiler only
 * generates utilities it can see as literal strings in source, so an
 * interpolated class name purges silently instead of erroring.
 *
 * TODO(tokens): these colours aren't defined in tailwind.config.ts yet — the
 * retokenized config (sourced from the Shopify theme's settings_schema
 * defaults) hasn't landed, so these bars render as no-ops until it does.
 * Tracked separately; not this fix's scope.
 */
export const SKU_ACCENT_CLASS: Record<string, string> = {
  "sku-sunscreen-sky": "bg-sku-sunscreen-sky",
  "sku-serum": "bg-sku-serum",
  "sku-cleanser": "bg-sku-cleanser",
  "sku-active-boba": "bg-sku-active-boba",
};

export const SKU_DISPLAY: Record<string, SkuDisplay> = {
  "sunscreen-spf50-provisional": {
    name: "Protecting Sunscreen SPF 50 PA++++",
    handle: "protecting-sunscreen-spf-50",
    accent: "sku-sunscreen-sky",
    blurb: "Daily UV protection. Recommended for everyone, every scan.",
  },
  "niacinamide-serum-provisional": {
    name: "5% Encapsulated Niacinamide Serum",
    handle: "niacinamide-serum",
    accent: "sku-serum",
    blurb: "Targets uneven tone and post-breakout marks.",
  },
  "gentle-cleanser-provisional": {
    name: "Refreshing Cleanser",
    handle: "refreshing-cleanser",
    accent: "sku-cleanser",
    blurb: "Removes oil and buildup without stripping.",
  },
  "hydrating-moisturizer-provisional": {
    name: "Calming Moisturiser",
    handle: "calming-moisturiser",
    accent: "sku-active-boba",
    blurb: "Restores moisture and softens rough texture.",
  },
};

// Bands ride a WEIGHT ramp, not a colour ramp. The Purity theme ships no
// success/warning/error palette, and a red/amber/green traffic light next to
// someone's face is exactly the clinical claim this product has spent its
// whole design refusing to make. Elevated earns the rose rule; nothing earns
// red. Shared by the results list and the category selector's own score
// readout — both are the same band, styled once.
export const BAND_STYLE: Record<Band, string> = {
  Low: "text-muted-foreground",
  Moderate: "text-text",
  Elevated: "text-text font-medium",
};

/** Concern-noun labels, shared by the tiles and the summary line. */
export const METRIC_LABELS: Record<BandableMetric, string> = {
  redness: "Redness",
  oiliness: "Oiliness",
  texture: "Texture",
  blemishes: "Breakouts",
  // Labelled for the CONCERN, not the trait. Bands mean concern-level
  // uniformly everywhere, and hydration is the one metric whose concern is
  // the inverse of its name — calling it "Dryness" keeps "Low" meaning the
  // same thing in every row instead of flipping for this one.
  hydration: "Dryness",
  pigment: "Dark marks",
};

// The only readings drawn as an overlay on the photo (TD-37, TD-39).
export const PHOTO_METRICS = ["redness", "oiliness"] as const satisfies readonly BandableMetric[];

// TD-40: the five readings every table shows and Echo receives, in table
// order. Replaces TD-37 (1), which hid the last three.
export const SHOWN_METRICS = ["redness", "oiliness", "blemishes", "texture", "pigment"] as const satisfies readonly BandableMetric[];
export type ShownMetric = (typeof SHOWN_METRICS)[number];
export const isShownMetric = (m: string): m is ShownMetric => (SHOWN_METRICS as readonly string[]).includes(m);

// TD-40: tagged "early estimate" in the table header and in Echo's data.
export const EARLY_ESTIMATE_METRICS = ["blemishes", "texture", "pigment"] as const satisfies readonly ShownMetric[];
export const isEarlyEstimate = (m: string) => (EARLY_ESTIMATE_METRICS as readonly string[]).includes(m);

// The overlays PhotoCapture and the retry request in the one scan call (the
// skin-scan service takes a comma-separated `overlays` list). Overlays are
// never stored, so asking for fewer changes no saved value.
export const OVERLAY_CATEGORIES: BandableMetric[] = [...PHOTO_METRICS];

// The user's own stated primary concern(s) from the quiz. No screen uses it
// since TD-39 removed the results chips (it once picked the first chip); it
// never decided which overlays get requested.
//
// `primary_concerns` is a multi-select (up to 3, lib/skin-check-steps.ts) —
// the first selection is treated as "the" stated concern (array order is
// selection order, see ImageCardMultiSelect's toggle()), skipping "pores"
// since it's not a bandable metric. Values are unchanged from the old
// single-select `primary_concern` field, so this stays a straight lookup
// against METRIC_LABELS with no translation layer needed.
export function resolveStatedConcern(answers: SkinCheckAnswers): BandableMetric | null {
  const stated = answers.primary_concerns;
  if (!Array.isArray(stated)) return null;
  const first = stated.find((v) => v !== "pores" && v in METRIC_LABELS);
  return (first as BandableMetric | undefined) ?? null;
}
