"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { canRetrySamePhoto, retrySkinScan } from "@/lib/scan-retry";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { runSkinCheckRules, type Band, type BandableMetric } from "@/lib/skin-check-rules";
import { METRIC_LABELS, OVERLAY_CATEGORIES, resolveStatedConcern } from "@/lib/skin-check-skus";
import { CheckReadings, KnownAndNotKnown } from "@/components/dashboard/CheckReadings";
import { readingsOf } from "@/components/dashboard/state";
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
          analyzed={false}
        />
        <div role="alert" className="flex flex-col items-start gap-3 rounded-2xl border border-brand-line bg-brand-paper p-5">
          <p>{message}</p>
          {canRetrySamePhoto(scan) ? (
            // Resends the same photo, so it must not promise a new one.
            <Button type="button" variant="outlineLight" size="sm" onClick={handleRetry} className="self-start">
              Try again with this photo
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

  const { overlays } = scan.result;
  const { bands } = runSkinCheckRules(scan.result);
  // TD-25 (3): the dashboard rule on the results screen. Band words only, no
  // score, no Dryness ("a photo cannot measure it"); the area readings are
  // the same component the dashboard and an opened check use.
  const readings = readingsOf(scan.result as unknown as Record<string, unknown>);
  const view = { scanId, date: null, source: "measured" as const, bands: readings.bands, areas: readings.areas, hardToRead: readings.hardToRead, photoCheck: null };

  // Concern-ranked (Elevated first), so the tabs open on what stood out most.
  const ranked = (Object.keys(METRIC_LABELS) as BandableMetric[])
    .filter((key) => key !== "hydration")
    .sort((a, b) => {
      const order: Record<Band, number> = { Elevated: 0, Moderate: 1, Low: 2 };
      return order[bands[a]] - order[bands[b]];
    });

  const categories: AnalysisCategory[] = ranked.map((key) => ({ key, label: METRIC_LABELS[key], band: bands[key] }));
  const shown = selectedCategory && selectedCategory !== "hydration" ? selectedCategory : ranked[0] ?? null;

  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <EchoTwin photo={scan.photo} categories={categories} overlays={overlays} selected={shown} onSelect={setSelectedCategory} analyzed />

        <section aria-labelledby="readings-title" className="flex flex-col gap-5 rounded-2xl border border-brand-card-line bg-brand-paper p-5 sm:p-6">
          <h2 id="readings-title" className="font-display text-xl font-semibold uppercase leading-tight tracking-[0.04em] text-brand-title sm:text-[22px]">
            What this photo shows
          </h2>
          {view.bands ? <CheckReadings view={view} stack /> : <p>The readings of this check could not be shown.</p>}
          <p className="text-sm text-brand-muted">
            Each reading is relative to this one photo. It is not a medical opinion and does not set you against other people or other checks.
          </p>
          {view.bands && (
            <div className="border-t border-brand-line pt-5">
              <KnownAndNotKnown />
            </div>
          )}
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
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-raised -mx-4 -mt-6 border-t border-brand-line bg-brand-linen/95 px-4 py-3 backdrop-blur sm:bottom-0 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mt-0 lg:rounded-2xl lg:border lg:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 lg:max-w-none">
          <p className="text-sm text-brand-muted">Questions about this check?</p>
          <Button asChild variant="ink" size="lg" className="shrink-0 px-5">
            <Link href="/echo">Chat with Echo</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
