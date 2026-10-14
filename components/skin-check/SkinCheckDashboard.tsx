"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { canRetrySamePhoto, retrySkinScan } from "@/lib/scan-retry";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { runSkinCheckRules } from "@/lib/skin-check-rules";
import { CheckReadings, KnownAndNotKnown } from "@/components/dashboard/CheckReadings";
import { readingsOf } from "@/components/dashboard/state";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import type { SkinScanState } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { FacePhoto } from "@/components/mesh/FacePhoto";
import { ScanningPhoto } from "@/components/mesh/ScanningPhoto";
import { echoOn } from "@/lib/echo-limits";
import { AFTER_CHECK_KEY } from "@/lib/home/permissions";

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
    // TD-47 (3): the next Home visit in this tab may show the permissions screen first (once per account).
    try {
      sessionStorage.setItem(AFTER_CHECK_KEY, "1");
    } catch {
      /* storage blocked: Home shows no screen */
    }
  }, [scan, scanId, answers, setSession]);

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
        <FacePhoto photo={photo} mesh={false} />
        <div role="alert" className="flex flex-col items-start gap-3 rounded-card border border-brand-border bg-brand-surface p-5">
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
  // TD-25 (3): the dashboard rule on the results screen. Band words only, no
  // score, no Dryness ("a photo cannot measure it"); the readings table is the
  // same component the dashboard and an opened check use.
  const readings = readingsOf(scan.result as unknown as Record<string, unknown>);
  const view = { scanId, date: null, source: "measured" as const, bands: readings.bands, areas: readings.areas, hardToRead: readings.hardToRead, photoCheck: null, pipelineVersion: null };

  return (
    <div className="flex flex-col gap-10">
      {/* TD-39: one photo with the mesh and both overlays, the table below it. Nothing to choose. */}
      <section aria-labelledby="readings-title" className="flex w-full max-w-3xl flex-col gap-5 rounded-card border border-brand-border bg-brand-surface p-4 shadow-card sm:p-5">
        <h2 id="readings-title" className="text-lg font-semibold leading-tight text-brand-text sm:text-xl">
          What this photo shows
        </h2>
        {view.bands ? (
          <CheckReadings view={view} picture={<FacePhoto photo={scan.photo} overlays={overlays} read />} />
        ) : (
          <>
            <FacePhoto photo={scan.photo} overlays={overlays} read />
            <p>The readings of this check could not be shown.</p>
          </>
        )}
        <p className="text-sm text-brand-text-muted">
          Each reading is relative to this one photo. It is not a medical opinion and does not set you against other people or other checks.
        </p>
        {view.bands && (
          <div className="border-t border-brand-border pt-5">
            <KnownAndNotKnown />
          </div>
        )}
      </section>

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
      <div className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-raised -mx-4 -mt-6 border-t border-brand-border bg-brand-surface/95 px-4 py-3 backdrop-blur sm:bottom-0 sm:-mx-6 sm:px-6 lg:static lg:mx-0 lg:mt-0 lg:rounded-card lg:border lg:px-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 lg:max-w-none">
          <p className="text-sm text-brand-text-muted">Questions about this check?</p>
          <Button asChild variant="ink" size="lg" className="shrink-0 px-5">
            <Link href="/echo">Chat with Echo</Link>
          </Button>
        </div>
      </div>
      )}
    </div>
  );
}
