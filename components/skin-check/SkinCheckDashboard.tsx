"use client";

import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getSkinScanResult } from "@/lib/api";
import { computeCompositeScore } from "@/lib/skin-check-score";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import type { SkinScanScores, SkinScanState } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { EchoTwin } from "./EchoTwin";

const MAP_LABELS: Record<keyof SkinScanScores, string> = {
  redness: "Redness",
  oiliness: "Oiliness",
  texture: "Texture",
  pores: "Pores",
  blemishes: "Blemishes",
  hydration: "Hydration",
  pigment: "Pigment",
};

interface SkinCheckDashboardProps {
  scan: SkinScanState;
  onScanChange: (scan: SkinScanState) => void;
  answers: SkinCheckAnswers;
}

// The payoff screen after /skin-check completes — Echo first, the composite
// score docked beneath it as the twin's own readout, then the 7 real
// sub-scores + heatmaps, then a light next-steps note. Rendered in place of
// the old "complete" screen, straight from the same scan state Step 2 already
// holds.
export function SkinCheckDashboard({ scan, onScanChange, answers }: SkinCheckDashboardProps) {
  const { setSession } = useSkinCheckSession();

  // Mirrors the completed scan into the shared (marketing)-layout session
  // (Step 4b) so /echo can ground region-scoped chat without prop-drilling
  // across a route change — in-memory only, per that session's own
  // refresh-loses-it contract.
  useEffect(() => {
    if (scan.status !== "success") return;
    setSession({
      answers,
      result: scan.result,
      composite: computeCompositeScore(scan.result.scores),
      photo: scan.photo,
      original: scan.original,
      captureMethod: scan.captureMethod,
    });
  }, [scan, answers, setSession]);

  if (scan.status === "idle") return null;

  if (scan.status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="aspect-square w-full max-w-[340px] self-center rounded-[28px]" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (scan.status === "error") {
    const { message, photo, original, captureMethod } = scan;
    const handleRetry = async () => {
      onScanChange({ status: "loading" });
      try {
        const result = await getSkinScanResult(photo);
        onScanChange({ status: "success", result, photo, original, captureMethod });
      } catch (err) {
        console.error("Skin scan retry failed:", err);
        onScanChange({ status: "error", message, photo, original, captureMethod });
      }
    };

    return (
      <div className="flex flex-col gap-4">
        {/* No fabricated score here — a scan failure means there's no real
            measurement to synthesize a number from, so Echo shows without one
            rather than displaying a fake/zero composite score. The captured
            photo still renders — it's real, the scan just failed to read it. */}
        <EchoTwin
          photo={photo}
          overlays={null}
          scores={null}
          regionScores={null}
          score={null}
          confidence={null}
          summary="Echo's still here — we just couldn't read your photo this time."
        />
        <div className="flex flex-col gap-3 rounded-2xl border border-[#1A1A1A]/10 bg-white p-4">
          <p className="text-sm text-[#1A1A1A]/70">{message}</p>
          <Button type="button" variant="outlineLight" size="sm" onClick={handleRetry} className="self-start">
            Try analyzing again
          </Button>
        </div>
      </div>
    );
  }

  const { scores, overlays, region_scores } = scan.result;
  const composite = computeCompositeScore(scores);
  const keys = Object.keys(MAP_LABELS) as (keyof typeof MAP_LABELS)[];

  return (
    <div className="flex flex-col gap-6">
      <EchoTwin
        photo={scan.photo}
        overlays={overlays}
        scores={scores}
        regionScores={region_scores}
        score={composite.score}
        confidence={composite.confidence}
        summary={composite.summaryLine}
      />

      <div className="flex flex-col gap-3">
        <p className="text-[length:var(--home-text-label,0.8125rem)] font-semibold uppercase tracking-[0.12em] text-[#98415A]/70">
          Your seven signals
        </p>
        <div className="grid grid-cols-2 gap-3">
          {keys.map((key) => (
            <div key={key} className="flex flex-col gap-2 rounded-2xl border border-[#1A1A1A]/10 bg-[#FAF4EF] p-3">
              {overlays[key] && (
                // eslint-disable-next-line @next/next/no-img-element -- base64 data URI from the scan service, not a static asset
                <img
                  src={overlays[key]}
                  alt={`${MAP_LABELS[key]} heatmap`}
                  className="aspect-square w-full rounded-xl object-cover"
                />
              )}
              <div className="flex items-center justify-between">
                <span className="text-sm text-[#1A1A1A]/80">{MAP_LABELS[key]}</span>
                <span className="text-sm font-medium text-[#98415A]">
                  {Math.round(scores[key] * 100)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl bg-[#FAF4EF] p-4">
        <p className="text-[length:var(--home-text-label,0.8125rem)] font-semibold uppercase tracking-[0.12em] text-[#98415A]/70">
          Next steps
        </p>
        <p className="text-sm leading-relaxed text-[#1A1A1A]/75">
          Based on your answers and photo, a simple routine may help more than a
          complicated one right now. Echo can walk through specifics whenever you&apos;re ready.
        </p>
      </div>
    </div>
  );
}
