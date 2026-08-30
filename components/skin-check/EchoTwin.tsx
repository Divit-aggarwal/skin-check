"use client";

import { useEffect, useMemo, useState } from "react";
import { ConfidenceBadge } from "@/components/primitives/ConfidenceBadge";
import { ScoreRadar } from "./ScoreRadar";
import type { SkinScanOverlays, SkinScanScores } from "@/types/skin-scan";

const CATEGORY_LABELS: Record<keyof SkinScanScores, string> = {
  redness: "Redness",
  oiliness: "Oiliness",
  texture: "Texture",
  pores: "Pores",
  blemishes: "Blemishes",
  hydration: "Hydration",
  pigment: "Pigment",
};

const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as (keyof SkinScanScores)[];
const DEFAULT_CATEGORY: keyof SkinScanScores = "redness";

interface EchoTwinProps {
  /** The user's own captured photo (Step 2) — the hero's base layer. Null only if a scan is in progress and the dashboard doesn't render this yet. */
  photo: Blob | null;
  /** Null when the scan failed — no overlays to show, tabs don't render. */
  overlays: SkinScanOverlays | null;
  /** Null when the scan failed — no real per-category data to ring, so it doesn't render. */
  scores: SkinScanScores | null;
  score: number | null;
  confidence: "high" | "medium" | "low" | null;
  summary: string;
}

// The dashboard's centerpiece, not a sidebar widget — but no longer a
// rendered 3D face. Two prior attempts (procedural particles, then a
// generic head) both added render-risk without adding anything a skin
// product actually needs: proof the analysis is real. The user's own photo,
// with the 7 real heatmaps switchable on top, IS that proof. No chat entry
// point here — Echo/Gemini is deferred from v1 (see /echo, kept intact but
// unreached from this flow).
export function EchoTwin({ photo, overlays, scores, score, confidence, summary }: EchoTwinProps) {
  const [activeCategory, setActiveCategory] = useState<keyof SkinScanScores>(DEFAULT_CATEGORY);

  const photoUrl = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo]);
  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative aspect-[3/4] w-full max-w-[340px] overflow-hidden rounded-[28px] bg-[#FAF4EF]">
        {photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- transient object URL, not a static asset
          <img src={photoUrl} alt="Your captured photo" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {overlays?.[activeCategory] && (
          // eslint-disable-next-line @next/next/no-img-element -- base64 data URI from the scan service, not a static asset
          <img
            src={overlays[activeCategory]}
            alt={`${CATEGORY_LABELS[activeCategory]} heatmap overlay`}
            // Tint over the photo, not a replacement for it — the overlay's
            // own alpha varies a lot by category (some maps cover much more
            // of the face than others), so this opacity is a uniform ceiling
            // on top of that ensuring the original face reads through
            // regardless of which tab is active. 60% is a starting point,
            // not a fixed spec — tune by eye against a real photo.
            className="absolute inset-0 h-full w-full object-cover opacity-60"
          />
        )}
      </div>

      {overlays && (
        <div className="flex flex-wrap justify-center gap-2">
          {CATEGORY_KEYS.map((key) => {
            const active = key === activeCategory;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveCategory(key)}
                aria-pressed={active}
                className={
                  active
                    ? "rounded-full bg-[#E02D79] px-3 py-1.5 text-xs font-medium text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
                    : "rounded-full bg-[#FAF4EF] px-3 py-1.5 text-xs font-medium text-[#1A1A1A]/60 transition-colors hover:bg-[#FAF4EF]/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
                }
              >
                {CATEGORY_LABELS[key]}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex flex-col items-center gap-2 text-center">
        {score !== null && (
          <span className="text-[length:var(--home-text-h1,3rem)] font-semibold leading-none text-[#1A1A1A]">
            {score}
          </span>
        )}
        {confidence && <ConfidenceBadge level={confidence} />}
        <p className="max-w-[85%] text-sm text-[#1A1A1A]/70">{summary}</p>
      </div>

      {scores && <ScoreRadar scores={scores} />}
    </div>
  );
}
