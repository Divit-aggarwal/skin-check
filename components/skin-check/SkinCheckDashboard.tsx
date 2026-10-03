"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { canRetrySamePhoto, retrySkinScan } from "@/lib/scan-retry";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { runSkinCheckRules, toConcern, type Band, type BandableMetric } from "@/lib/skin-check-rules";
import { METRIC_LABELS, BAND_STYLE, OVERLAY_CATEGORIES, resolveStatedConcern } from "@/lib/skin-check-skus";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import type { SkinScanState } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { EchoTwin, type AnalysisCategory } from "./EchoTwin";

// The category the results screen shows FIRST — the user's own stated
// primary concern from the quiz if they gave one, else whichever metric
// banded highest. Every category's overlay already exists in scan.result
// (PhotoCapture requests all of OVERLAY_CATEGORIES in the one scan call), so
// this only picks the initial tab, not what gets fetched. `pores` is
// excluded from BandableMetric entirely (it returns exactly 0.0 on every
// real photo), so it never reaches this function.
function resolveFocus(
  answers: SkinCheckAnswers,
  bands: Record<BandableMetric, Band>
): BandableMetric | null {
  const stated = resolveStatedConcern(answers);
  if (stated) return stated;
  const elevated = (Object.keys(bands) as BandableMetric[]).find((m) => bands[m] === "Elevated");
  return elevated ?? null;
}

interface SkinCheckDashboardProps {
  scan: SkinScanState;
  /** Stable id for this scan attempt — half of the S3 key for the original. */
  scanId: string;
  /** `forScanId` lets the flow drop a response from a superseded attempt. */
  onScanChange: (scan: SkinScanState, forScanId?: string) => void;
  /** A new photo under a new scanId: this scan's record is already saved. */
  onRetake: () => void;
  answers: SkinCheckAnswers;
}

export function SkinCheckDashboard({ scan, scanId, onScanChange, onRetake, answers }: SkinCheckDashboardProps) {
  const { setSession } = useSkinCheckSession();
  // The single authoritative "which category is on screen" state — EchoTwin
  // derives the overlay, score, band, and explanation from this same value,
  // so they can never disagree with each other or with the tab strip.
  const [selectedCategory, setSelectedCategory] = useState<BandableMetric | null>(null);

  useEffect(() => {
    if (scan.status !== "success") return;
    const { bands } = runSkinCheckRules(scan.result);
    setSession({
      scanId,
      answers,
      result: scan.result,
      composite: summarizeConcerns(scan.result.scores, bands),
      photo: scan.photo,
      original: scan.original,
      originalStored: scan.originalStored,
      retentionConsentVersion: scan.retentionConsentVersion,
      captureMethod: scan.captureMethod,
    });
  }, [scan, scanId, answers, setSession]);

  // Picks the initial tab once per scan, then leaves it alone — the user's
  // own clicks own it after that. Resets on retake/error so a stale category
  // from a previous photo doesn't leak into the next one's default view.
  useEffect(() => {
    if (scan.status !== "success") {
      setSelectedCategory(null);
      return;
    }
    setSelectedCategory((prev) => {
      if (prev) return prev;
      const { bands } = runSkinCheckRules(scan.result);
      return resolveFocus(answers, bands) ?? OVERLAY_CATEGORIES[0]!;
    });
  }, [scan, answers]);

  if (scan.status === "idle") return null;

  if (scan.status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="aspect-[3/4] w-full max-w-[340px] self-center rounded-media" />
        {/* Copy, not a bare spinner. The upstream timeout is 30s and the
            previous version showed nothing at all for the duration. */}
        <p className="text-center text-body text-muted-foreground">
          Reading your photo. This takes a few seconds.
        </p>
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded" />
          ))}
        </div>
      </div>
    );
  }

  if (scan.status === "error") {
    const { message, photo } = scan;
    const handleRetry = async () => {
      onScanChange({ status: "loading" });
      onScanChange(await retrySkinScan(scan, scanId), scanId);
    };

    return (
      <div className="flex flex-col gap-4">
        {/* Nothing synthesised here. A failed scan has no measurement, so
            there is no summary to write — the photo still renders because
            it's real; the reading isn't. */}
        <EchoTwin
          photo={photo}
          categories={[]}
          overlays={null}
          selected={null}
          onSelect={() => {}}
          regionScores={null}
          regions={[]}
          regionLowConfidence={null}
          analyzed={false}
        />
        <div className="flex flex-col gap-3 rounded border border-border bg-canvas p-4">
          <p className="text-body text-text/70">{message}</p>
          {canRetrySamePhoto(scan) ? (
            <Button type="button" variant="outlineLight" size="sm" onClick={handleRetry} className="self-start">
              Take another photo
            </Button>
          ) : (
            // The engine refused this photo; re-sending it can only fail again.
            <Button type="button" variant="outlineLight" size="sm" onClick={onRetake} className="self-start">
              Retake photo
            </Button>
          )}
        </div>
      </div>
    );
  }

  const { scores, overlays, regions, region_scores, region_low_confidence } = scan.result;
  const { bands } = runSkinCheckRules(scan.result);
  const { summaryLine } = summarizeConcerns(scores, bands);

  // The one real image-quality signal the service exposes — surfaced
  // honestly instead of a fabricated "face detected"/"100% accurate" claim.
  // Only present on pipeline_versions that report it (older rows predate the
  // field entirely, see types/skin-scan.ts).
  const lowConfidenceRegions = region_low_confidence
    ? Object.entries(region_low_confidence)
        .filter(([, isLow]) => isLow)
        .map(([region]) => region.charAt(0).toUpperCase() + region.slice(1))
    : [];

  // Concern-ranked, so the thing that matters is at the top of the list —
  // and the same order the category tabs use, so the two selectors agree.
  const ranked = (Object.keys(METRIC_LABELS) as BandableMetric[]).sort((a, b) => {
    const order: Record<Band, number> = { Elevated: 0, Moderate: 1, Low: 2 };
    return order[bands[a]] - order[bands[b]];
  });

  const categories: AnalysisCategory[] = ranked.map((key) => ({
    key,
    label: METRIC_LABELS[key],
    scorePct: Math.round(toConcern(scores, key) * 100),
    band: bands[key],
  }));

  return (
    <div className="flex flex-col gap-10">
      <EchoTwin
        photo={scan.photo}
        categories={categories}
        overlays={overlays}
        selected={selectedCategory}
        onSelect={setSelectedCategory}
        regionScores={region_scores}
        regions={regions}
        regionLowConfidence={region_low_confidence ?? null}
        analyzed
      />

      <p className="-mt-6 text-center text-body text-text/70">{summaryLine}</p>

      {lowConfidenceRegions.length > 0 && (
        <p className="-mt-6 text-center text-label text-muted-foreground">
          {lowConfidenceRegions.join(" and ")} {lowConfidenceRegions.length > 1 ? "were" : "was"}{" "}
          harder to read clearly in this photo — treat those readings as less certain.
        </p>
      )}

      {/* Ivory band — the page alternates white (hero/face) and warm-ivory
          (editorial content) sections rather than staying one flat white
          canvas throughout (PART 22). Matches SkinCheckFlow's `complete`
          container padding (px-6 sm:px-10) so the bleed lines up exactly. */}
      <div className="-mx-6 flex flex-col gap-10 bg-canvas px-6 py-10 sm:-mx-10 sm:px-10">
        <section className="flex flex-col gap-3">
          <h2 className="text-label uppercase text-muted-foreground">What we read</h2>
          <ul className="flex flex-col">
            {ranked.map((key) => {
              const score = Math.round(toConcern(scores, key) * 100);
              const active = key === selectedCategory;
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => setSelectedCategory(key)}
                    aria-current={active}
                    className={
                      // bg-white, not bg-canvas — this list now sits on the
                      // ivory band below, so the "selected" highlight has to
                      // read lighter than its surroundings, not the same tone.
                      bands[key] === "Elevated"
                        ? `flex w-full items-center justify-between border-l-2 py-3 pl-3 pr-1 text-left transition-colors duration-150 ${active ? "border-blush bg-white" : "border-blush"}`
                        : `flex w-full items-center justify-between border-l-2 py-3 pl-3 pr-1 text-left transition-colors duration-150 ${active ? "border-text/30 bg-white" : "border-transparent"}`
                    }
                  >
                    <span className="text-body text-text">{METRIC_LABELS[key]}</span>
                    <span className="flex items-center gap-3">
                      <span className="text-body tabular-nums text-muted-foreground">{score}/100</span>
                      <span className={`text-body ${BAND_STYLE[bands[key]]}`}>{bands[key]}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {/* `pores` is deliberately absent from this list. It returns exactly
              0.0 on every real photo, so it is excluded from banding upstream.
              The previous version gave it 1/7 of the payoff screen to say
              "Not measured yet". */}
          <p className="text-label text-muted-foreground">
            Scores are image-relative signals from this scan, not clinically
            calibrated measurements — they compare what showed up in this
            photo, not against other people or past scans.
          </p>
        </section>

      </div>

      {/* Echo chat, routed at /echo. Session data (scan result, answers,
          composite) is already mirrored into SkinCheckSessionProvider by the
          effect above, and /echo reads that same context, so this Link is the
          whole integration. Pinned to the bottom of the screen for the whole
          results view: as a card after the score list it sat at the very end
          of a long page and was easy to never see. Sticky rather than fixed,
          because the results container animates with a transform, which
          breaks `position: fixed`. */}
      <div className="sticky bottom-0 z-raised -mx-6 -mt-10 border-t border-border bg-white/95 px-6 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-10 sm:px-10">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3">
          <p className="text-sm text-text/70">Questions about your results?</p>
          <Button asChild variant="ink" size="lg" className="shrink-0 px-5">
            <Link href="/echo">Chat with Echo</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
