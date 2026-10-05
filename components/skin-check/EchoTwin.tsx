"use client";

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { motion, AnimatePresence, type PanInfo, type Variants } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { METRIC_LABELS } from "@/lib/skin-check-skus";
import type { Band, BandableMetric } from "@/lib/skin-check-rules";
import type { SkinScanOverlays, SkinScanScores } from "@/types/skin-scan";

// TD-25 (3): the results screen follows the dashboard rule. Band words only,
// all in ink: no score out of 100, no Dryness, no band colour.
export interface AnalysisCategory {
  key: BandableMetric;
  label: string;
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
  /** True only for an actual completed scan — never true on the error path. */
  analyzed: boolean;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// Slide direction for the score/interpretation panel — same shape as
// SkinCheckFlow's section transition, driven by whichever way the category
// index just moved (swipe, tab click, or keyboard arrow — see
// slideDirection below).
const scorePanelVariants: Variants = {
  enter: (dir: number) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: number) => ({ opacity: 0, x: dir * -24 }),
};

// Generic, image-relative, non-clinical — no per-metric fabricated content.
// METRIC_LABELS names each metric for its concern, so one template covers
// every metric shown here (Dryness is not shown: TD-25 (3)).
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

  // Keeps the active tab in view when selection changes off-screen — most
  // relevant now that a swipe on the photo can move selection past what's
  // currently visible in the (intentionally scrollable) tab strip.
  useEffect(() => {
    if (!selected) return;
    tabRefs.current[selected]?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [selected]);

  // Swipe-to-switch on the photo (PART: "use a proper slider" for the
  // category results) — an additional input method alongside the tab strip
  // and keyboard arrows below, not a replacement. `onSelect` stays the one
  // place selection actually changes, so a swipe can never desync the
  // overlay/score/interpretation from the tab strip.
  const currentIndex = categories.findIndex((c) => c.key === selected);
  const goToRelative = useCallback(
    (delta: number) => {
      if (categories.length < 2 || currentIndex === -1) return;
      const next = categories[(currentIndex + delta + categories.length) % categories.length]!;
      onSelect(next.key);
    },
    [categories, currentIndex, onSelect]
  );
  const SWIPE_THRESHOLD_PX = 60;
  const handlePhotoDragEnd = useCallback(
    (_event: unknown, info: PanInfo) => {
      if (info.offset.x <= -SWIPE_THRESHOLD_PX) goToRelative(1);
      else if (info.offset.x >= SWIPE_THRESHOLD_PX) goToRelative(-1);
    },
    [goToRelative]
  );

  // Which way the score/interpretation panel below should slide in from —
  // derived by comparing this render's index to the last one, so it reacts
  // the same way whether the change came from a swipe, a tab click, or a
  // keyboard arrow.
  const slideDirection = useRef(1);
  const prevIndexRef = useRef(currentIndex);
  if (currentIndex !== prevIndexRef.current) {
    slideDirection.current = currentIndex > prevIndexRef.current ? 1 : -1;
    prevIndexRef.current = currentIndex;
  }

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

  return (
    <div className="flex flex-col items-center gap-4">
      <motion.div
        drag={categories.length > 1 ? "x" : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.2}
        onDragEnd={handlePhotoDragEnd}
        whileDrag={{ cursor: "grabbing" }}
        className={`relative aspect-[3/4] w-full max-w-[340px] touch-pan-y overflow-hidden rounded-media bg-surface ${
          categories.length > 1 ? "cursor-grab" : ""
        }`}
      >
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
        {categories.length > 1 && (
          <>
            {/* Explicit slider controls alongside the swipe gesture — not
                everyone discovers drag-to-switch, and these give keyboard/
                pointer users a visible way to move through the same slider. */}
            <button
              type="button"
              aria-label="Previous category"
              onClick={() => goToRelative(-1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-canvas/80 text-text backdrop-blur-sm transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              aria-label="Next category"
              onClick={() => goToRelative(1)}
              onPointerDown={(e) => e.stopPropagation()}
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-canvas/80 text-text backdrop-blur-sm transition-colors hover:bg-canvas focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}
      </motion.div>

      {categories.length > 0 && (
        <div
          role="tablist"
          aria-label="Analysis categories"
          // Edge fade, not a second indicator row — a dot strip duplicating
          // these same labels read as clutter (caught in review). The real
          // problem it was covering for is that a horizontally-clipped tab
          // ("TEXTU") looks broken, not scrollable — the mask fades it out
          // instead, which reads as "more to scroll" the way it's supposed to.
          className="flex w-full max-w-[420px] flex-wrap justify-center gap-2 px-1 py-1"
        >
          {categories.map((cat) => {
            const active = cat.key === selected;
            return (
              // G03: chips in the store style; the selected chip is filled ink, every other chip the same.
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
                className="min-h-11 shrink-0 rounded-full border border-brand-line bg-brand-paper px-4 text-sm font-medium aria-selected:border-brand-action aria-selected:bg-brand-action aria-selected:text-white"
              >
                {cat.label}
              </button>
            );
          })}
        </div>
      )}

      {selectedCategory && (
        <div className="relative w-full max-w-[420px] overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={slideDirection.current}>
            <motion.div
              key={selectedCategory.key}
              custom={slideDirection.current}
              variants={scorePanelVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: 0.2, ease: [0.19, 1, 0.22, 1] }}
              className="flex flex-col items-center gap-1 text-center"
            >
              <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-brand-muted">{selectedCategory.label}</h2>
              <p className="font-display text-2xl font-semibold text-brand-ink">{selectedCategory.band}</p>
              <p className="max-w-[85%] text-brand-muted">
                {interpretationFor(selectedCategory.band, METRIC_LABELS[selectedCategory.key].toLowerCase())}
              </p>
              {overlayUnavailable && (
                <p className="max-w-[85%] text-label text-muted-foreground">
                  Spatial visualization unavailable for this category.
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}

/** Re-exported for the dashboard's own typing convenience. */
export type { SkinScanScores };
