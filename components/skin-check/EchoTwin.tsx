"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { METRIC_LABELS, BAND_STYLE } from "@/lib/skin-check-skus";
import { bandScores, toConcern, type Band, type BandableMetric } from "@/lib/skin-check-rules";
import { ECHO_REGION_LABELS, isEchoRegion } from "@/lib/echo-regions";
import type { SkinScanOverlays, SkinScanScores } from "@/types/skin-scan";

export interface AnalysisCategory {
  key: BandableMetric;
  label: string;
  scorePct: number;
  band: Band;
}

interface EchoTwinProps {
  /** The user's captured photo — the hero's base layer. */
  photo: Blob | null;
  /** Every traversable category, in display order. Empty on the error path. */
  categories: AnalysisCategory[];
  /** All overlays the scan actually returned — every requested category lands
   * here in one response now (see PhotoCapture's single combined request), so
   * this is never a partial fetch-in-progress state. */
  overlays: SkinScanOverlays | null;
  /** The one authoritative selected category — owned by the dashboard, not
   * duplicated here, so the image/score/explanation can never disagree with
   * the selector. Null only on the error path. */
  selected: BandableMetric | null;
  onSelect: (key: BandableMetric) => void;
  /** Real per-region breakdown for the selected category — region_scores,
   * keyed by the same region names as `regions`. Null on the error path. */
  regionScores: Record<string, SkinScanScores> | null;
  regions: string[];
  regionLowConfidence: Record<string, boolean> | null;
  /** True only for an actual completed scan — never true on the error path. */
  analyzed: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Generic, image-relative, non-clinical — no per-metric fabricated content.
// METRIC_LABELS is already written for the CONCERN (e.g. "Dryness" for
// hydration), and toConcern()/bandScores() already put every metric in the
// same "how much of a concern is this" space, so one template covers all six
// without a flip for hydration.
function interpretationFor(band: Band, noun: string): string {
  switch (band) {
    case "Low":
      // "Little sign of X" reads correctly for both mass nouns ("redness")
      // and the plural concern nouns ("breakouts", "dark marks") — "Little
      // breakouts" doesn't.
      return `Little sign of ${noun} in this photo, relative to the rest of your face.`;
    case "Moderate":
      return `Some ${noun} showed up — moderate relative to the rest of this photo.`;
    case "Elevated":
      return `${cap(noun)} stood out more than other areas in this photo.`;
  }
}

/**
 * The dashboard's centrepiece: the user's own photo with the real heatmap for
 * whichever category is selected, plus that category's score and a plain-
 * language read — all three always derived from the same `selected` key, so
 * switching categories can never leave the image, score, and text out of
 * sync with each other.
 *
 * Removed from the previous version:
 *  - the 0-100 composite at 3rem (fabricated precision; see skin-check-score.ts)
 *  - ConfidenceBadge (its input was a hardcoded "high")
 *  - ScoreRadar (7 axes of per-image-normalised heuristics at 340px, plotted
 *    "further out = healthier" directly beneath tiles that read
 *    "Low = better" — two opposite conventions, adjacent, uncaptioned)
 *  - the Original/Analysis two-way toggle — redundant now that the category
 *    tabs themselves are the "which layer am I looking at" control
 *  - the old 7-tab category switcher's tabs were interactive but inert
 *    (AUDIT.md S0-1 — no overlay was ever fetched for any of them). These
 *    tabs are real: every category's overlay was requested in the same scan
 *    call that produced the scores (lib/skin-check-skus.ts's
 *    OVERLAY_CATEGORIES), so switching tabs never needs a network round trip.
 */
export function EchoTwin({
  photo,
  categories,
  overlays,
  selected,
  onSelect,
  regionScores,
  regions,
  regionLowConfidence,
  analyzed,
}: EchoTwinProps) {
  // Object URL creation and revocation must live in the SAME effect, not a
  // useMemo + separate useEffect pair — under React 18 StrictMode's
  // mount->cleanup->remount dev cycle, a memoized URL is stable across both
  // passes, so a cleanup keyed only on that URL fires on the phantom first
  // unmount and revokes the URL the still-mounted <img> is using, breaking
  // every photo render in dev. Creating a fresh URL per real effect run
  // keeps create/revoke paired correctly.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!photo) {
      setPhotoUrl(null);
      return;
    }
    const url = URL.createObjectURL(photo);
    setPhotoUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const [overlayFailed, setOverlayFailed] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  // Overlay decode failures are per-image — reset when the selected category
  // (and therefore the src) changes, so a failure on one category doesn't
  // permanently hide every other category's overlay.
  useEffect(() => setOverlayFailed(false), [selected]);

  const tabRefs = useRef<Partial<Record<BandableMetric, HTMLButtonElement | null>>>({});

  const handleTabKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      if (categories.length === 0) return;
      const currentIndex = categories.findIndex((c) => c.key === selected);
      let nextIndex: number | null = null;
      if (e.key === "ArrowRight") nextIndex = (currentIndex + 1) % categories.length;
      else if (e.key === "ArrowLeft") nextIndex = (currentIndex - 1 + categories.length) % categories.length;
      else if (e.key === "Home") nextIndex = 0;
      else if (e.key === "End") nextIndex = categories.length - 1;
      if (nextIndex === null) return;
      e.preventDefault();
      const next = categories[nextIndex]!;
      onSelect(next.key);
      tabRefs.current[next.key]?.focus();
    },
    [categories, selected, onSelect]
  );

  const selectedCategory = categories.find((c) => c.key === selected) ?? null;
  const overlaySrc = selected ? overlays?.[selected] : undefined;
  const showOverlay = Boolean(overlaySrc) && !overlayFailed;
  // Only a real "unavailable" claim once the scan has actually completed and
  // this specific category's overlay genuinely isn't in the response —
  // never shown while still analyzing.
  const overlayUnavailable = analyzed && Boolean(selected) && !overlaySrc;

  const regionRows =
    selected && regionScores
      ? regions
          .map((region) => {
            const scores = regionScores[region];
            if (!scores) return null;
            const pct = Math.round(toConcern(scores, selected) * 100);
            const band = bandScores(scores).bands[selected];
            const label = isEchoRegion(region) ? ECHO_REGION_LABELS[region] : cap(region);
            return { region, label, pct, band, lowConfidence: regionLowConfidence?.[region] ?? false };
          })
          .filter((r): r is NonNullable<typeof r> => r !== null)
      : [];

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-[3/4] w-full max-w-[340px] overflow-hidden rounded-media bg-surface">
        {photoUrl && !photoFailed ? (
          // eslint-disable-next-line @next/next/no-img-element -- transient object URL
          <img
            src={photoUrl}
            alt="The photo you captured"
            className="absolute inset-0 h-full w-full object-cover"
            onError={() => setPhotoFailed(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-label text-muted-foreground">
            {photoUrl ? "Your photo couldn't be displayed." : ""}
          </div>
        )}
        {overlaySrc && !overlayFailed && (
          // key={selected} remounts the <img> per category so the built-in
          // fade-in animation (tailwindcss-animate) replays on every switch —
          // a 200ms crossfade instead of an instant pixel swap.
          // eslint-disable-next-line @next/next/no-img-element -- base64 data URI from the scan service
          <img
            key={selected}
            src={overlaySrc}
            alt={selectedCategory ? `${selectedCategory.label} heatmap over your photo` : "Analysis heatmap"}
            // Tint, not replacement. The overlay's own alpha varies a lot by
            // category, so this is a uniform ceiling on top of that — the
            // face has to read through for the overlay to mean anything.
            className={`absolute inset-0 h-full w-full object-cover animate-in fade-in duration-200 ${
              showOverlay ? "opacity-60" : "opacity-0"
            }`}
            onError={() => setOverlayFailed(true)}
          />
        )}
        {analyzed && (
          <div className="absolute left-2 top-2 rounded-pill bg-canvas/80 px-2 py-1 text-label uppercase tracking-label text-muted-foreground backdrop-blur-sm">
            Analysis complete
          </div>
        )}
      </div>

      {categories.length > 0 && (
        <div
          role="tablist"
          aria-label="Analysis categories"
          className="flex w-full max-w-[340px] gap-2 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {categories.map((cat) => {
            const active = cat.key === selected;
            return (
              <button
                key={cat.key}
                ref={(el) => {
                  tabRefs.current[cat.key] = el;
                }}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                onClick={() => onSelect(cat.key)}
                onKeyDown={handleTabKeyDown}
                className={`shrink-0 rounded-pill px-3 py-1.5 text-label uppercase tracking-label transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active ? "bg-text text-canvas" : "border border-border text-muted-foreground hover:text-text"
                }`}
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      )}

      {selectedCategory && (
        <div className="flex flex-col items-center gap-1 text-center transition-opacity duration-150">
          <h2 className="text-label uppercase tracking-label text-muted-foreground">{selectedCategory.label}</h2>
          <p className="flex items-baseline gap-1 tabular-nums text-text">
            <span className="text-3xl font-semibold">{selectedCategory.scorePct}</span>
            <span className="text-label text-muted-foreground">/100</span>
          </p>
          <p className={`text-body ${BAND_STYLE[selectedCategory.band]}`}>{selectedCategory.band}</p>
          <p className="max-w-[85%] text-body text-text/70">
            {interpretationFor(selectedCategory.band, METRIC_LABELS[selectedCategory.key].toLowerCase())}
          </p>
          {overlayUnavailable && (
            <p className="max-w-[85%] text-label text-muted-foreground">
              Spatial visualization unavailable for this category.
            </p>
          )}
        </div>
      )}

      {regionRows.length > 0 && (
        <div className="w-full max-w-[340px]">
          <h3 className="mb-2 text-label uppercase tracking-label text-muted-foreground">By region</h3>
          <ul className="flex flex-col divide-y divide-border rounded border border-border">
            {regionRows.map((row) => (
              <li key={row.region} className="flex items-center justify-between px-3 py-2">
                <span className="text-body text-text">
                  {row.label}
                  {row.lowConfidence && <span className="text-muted-foreground"> *</span>}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-body tabular-nums text-muted-foreground">{row.pct}/100</span>
                  <span className={`text-body ${BAND_STYLE[row.band]}`}>{row.band}</span>
                </span>
              </li>
            ))}
          </ul>
          {regionRows.some((r) => r.lowConfidence) && (
            <p className="mt-1 text-label text-muted-foreground">* harder to read clearly in this photo</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Re-exported for the dashboard's own typing convenience. */
export type { SkinScanScores };
