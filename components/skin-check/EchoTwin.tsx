"use client";

import { useEffect, useMemo } from "react";
import { METRIC_LABELS } from "@/lib/skin-check-skus";
import type { SkinScanOverlays, SkinScanScores } from "@/types/skin-scan";
import type { BandableMetric } from "@/lib/skin-check-rules";

interface EchoTwinProps {
  /** The user's captured photo — the hero's base layer. */
  photo: Blob | null;
  /** Only ever holds the ONE category requested at scan time. */
  overlays: SkinScanOverlays | null;
  /** Which category that is — the user's stated primary concern. */
  focus: BandableMetric | null;
  summary: string;
}

/**
 * The dashboard's centrepiece: the user's own photo with one real heatmap on
 * it, and a sentence.
 *
 * Removed from the previous version:
 *  - the 0-100 composite at 3rem (fabricated precision; see skin-check-score.ts)
 *  - ConfidenceBadge (its input was a hardcoded "high")
 *  - ScoreRadar (7 axes of per-image-normalised heuristics at 340px, plotted
 *    "further out = healthier" directly beneath tiles that read
 *    "Low = better" — two opposite conventions, adjacent, uncaptioned)
 *  - the 7-tab category switcher (each tab pulled its own base64 heatmap;
 *    all seven cost 1.11MB for a screen that shows one at a time)
 *
 * What's left is the only claim on this screen that's actually defensible:
 * this is your face, and this is where the thing you told us you cared about
 * shows up on it.
 */
export function EchoTwin({ photo, overlays, focus, summary }: EchoTwinProps) {
  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  const overlaySrc = focus ? overlays?.[focus] : undefined;

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-[3/4] w-full max-w-[340px] overflow-hidden rounded-media bg-surface">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- transient object URL
          <img
            src={photoUrl}
            alt="The photo you captured"
            className="absolute inset-0 h-full w-full object-cover"
          />
        )}
        {overlaySrc && (
          // eslint-disable-next-line @next/next/no-img-element -- base64 data URI from the scan service
          <img
            src={overlaySrc}
            alt={`${METRIC_LABELS[focus!]} heatmap over your photo`}
            // Tint, not replacement. The overlay's own alpha varies a lot by
            // category, so this is a uniform ceiling on top of that — the
            // face has to read through for the overlay to mean anything.
            // 60% is a starting point; tune by eye against a real photo.
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
      </div>

      {focus && overlaySrc && (
        <p className="text-label uppercase text-muted">
          Showing {METRIC_LABELS[focus]}
        </p>
      )}

      <p className="max-w-[85%] text-center text-body text-text/70">{summary}</p>
    </div>
  );
}

/** Re-exported for the dashboard's own typing convenience. */
export type { SkinScanScores };
