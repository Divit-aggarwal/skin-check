import type { BandableMetric } from "@/lib/skin-check-rules";

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
  /** Tailwind colour token from tokens.css. */
  accent: string;
  /** Plain-language line. What it does, not what it claims. */
  blurb: string;
}

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
