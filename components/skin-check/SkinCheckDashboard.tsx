"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { canRetrySamePhoto, retrySkinScan } from "@/lib/scan-retry";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { runSkinCheckRules, type Band, type BandableMetric } from "@/lib/skin-check-rules";
import { ANSWER_TOPICS, METRIC_LABELS, PHOTO_METRICS } from "@/lib/skin-check-skus";
import { toldTopics } from "@/lib/told-topics";
import type { EchoRegion } from "@/lib/echo-regions";
import { CheckReadings, KnownAndNotKnown } from "@/components/dashboard/CheckReadings";
import { readingsOf } from "@/components/dashboard/state";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import type { SkinScanState } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { EchoTwin, type AnalysisCategory } from "./EchoTwin";
import { ScanningPhoto } from "@/components/mesh/ScanningPhoto";
import { echoOn } from "@/lib/echo-limits";

// TD-37: the chips in a fixed order, photo readings first. Never sorted by
// band: an order by band would tell the hidden readings' levels.
const CHIP_ORDER: BandableMetric[] = [...PHOTO_METRICS, ...ANSWER_TOPICS];

// The chip the results screen shows FIRST — the user's own stated primary
// concern from the quiz if it is a chip, else a photo reading that banded
// Elevated (never a hidden one, TD-37 (1)), else Redness. Only picks the
// initial chip, not what gets fetched.
function resolveFocus(answers: SkinCheckAnswers, bands: Record<BandableMetric, Band>): BandableMetric {
  // The first of the user's concerns that is a chip (Dryness and Pores are not).
  const concerns = Array.isArray(answers.primary_concerns) ? answers.primary_concerns : [];
  const stated = concerns.find((c): c is BandableMetric => (CHIP_ORDER as string[]).includes(c));
  if (stated) return stated;
  return PHOTO_METRICS.find((m) => bands[m] === "Elevated") ?? PHOTO_METRICS[0];
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
  const [area, setArea] = useState<EchoRegion | null>(null);

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
      return resolveFocus(answers, bands);
    });
  }, [scan, answers]);

  if (scan.status === "idle") return null;

  if (scan.status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        {/* TD-37 (2): the mesh sweeps over the photo while it is read; without a
            photo or a mesh, the plain progress state below. */}
        <ScanningPhoto photo={scan.photo ?? null} />
        {/* Copy, not a bare spinner. The upstream timeout is 30s and the
            previous version showed nothing at all for the duration. */}
        <p role="status" className="text-center text-body text-muted-foreground">
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
      onScanChange({ status: "loading", photo: scan.photo });
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

  const told = toldTopics(answers);
  const categories: AnalysisCategory[] = [
    ...PHOTO_METRICS.map((key) => ({ kind: "photo" as const, key, label: METRIC_LABELS[key], band: bands[key] })),
    ...ANSWER_TOPICS.map((key) => ({ kind: "told" as const, key, label: METRIC_LABELS[key], told: told?.find((t) => t.topic === key) ?? null })),
  ];
  const shown = selectedCategory && CHIP_ORDER.includes(selectedCategory) ? selectedCategory : PHOTO_METRICS[0];

  return (
    <div className="flex flex-col gap-10">
      <div className="grid items-start gap-8 lg:grid-cols-2">
        <EchoTwin photo={scan.photo} categories={categories} overlays={overlays} selected={shown} onSelect={setSelectedCategory} analyzed highlight={area} />

        <section aria-labelledby="readings-title" className="flex flex-col gap-5 rounded-2xl border border-brand-card-line bg-brand-paper p-5 sm:p-6">
          <h2 id="readings-title" className="font-display text-xl font-semibold uppercase leading-tight tracking-[0.04em] text-brand-title sm:text-[22px]">
            What this photo shows
          </h2>
          {/* TD-37 (2): one photo on this screen. The area is chosen on the drawing and marked on the mesh above. */}
          {view.bands ? <CheckReadings view={view} stack area={area} onAreaChange={setArea} /> : <p>The readings of this check could not be shown.</p>}
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
      {/* TD-29 (5): no way into Echo while it is switched off. */}
      {echoOn() && (
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-raised -mx-4 -mt-6 border-t border-brand-line bg-brand-linen/95 px-4 py-3 backdrop-blur sm:bottom-0 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mt-0 lg:rounded-2xl lg:border lg:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 lg:max-w-none">
          <p className="text-sm text-brand-muted">Questions about this check?</p>
          <Button asChild variant="ink" size="lg" className="shrink-0 px-5">
            <Link href="/echo">Chat with Echo</Link>
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
