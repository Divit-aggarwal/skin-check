import type { Band, BandableMetric } from "@/lib/skin-check-rules";

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
