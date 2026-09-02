"use client";

import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getSkinScanResult } from "@/lib/api";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { runSkinCheckRules, toConcern, type Band, type BandableMetric } from "@/lib/skin-check-rules";
import {
  SKU_DISPLAY,
  METRIC_LABELS,
  BAND_STYLE,
  SKU_ACCENT_CLASS,
  OVERLAY_CATEGORIES,
  resolveStatedConcern,
} from "@/lib/skin-check-skus";
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
  onScanChange: (scan: SkinScanState) => void;
  answers: SkinCheckAnswers;
}

export function SkinCheckDashboard({ scan, onScanChange, answers }: SkinCheckDashboardProps) {
  const { setSession } = useSkinCheckSession();
  // The single authoritative "which category is on screen" state — EchoTwin
  // derives the overlay, score, band, and explanation from this same value,
  // so they can never disagree with each other or with the tab strip.
  const [selectedCategory, setSelectedCategory] = useState<BandableMetric | null>(null);

  useEffect(() => {
    if (scan.status !== "success") return;
    const { bands } = runSkinCheckRules(scan.result);
    setSession({
      answers,
      result: scan.result,
      composite: summarizeConcerns(scan.result.scores, bands),
      photo: scan.photo,
      original: scan.original,
      captureMethod: scan.captureMethod,
    });
  }, [scan, answers, setSession]);

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
    const { message, photo, original, captureMethod } = scan;
    const handleRetry = async () => {
      onScanChange({ status: "loading" });
      try {
        const result = await getSkinScanResult(photo, OVERLAY_CATEGORIES);
        onScanChange({ status: "success", result, photo, original, captureMethod });
      } catch (err) {
        console.error("Skin scan retry failed:", err);
        onScanChange({ status: "error", message, photo, original, captureMethod });
      }
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
          <Button type="button" variant="outlineLight" size="sm" onClick={handleRetry} className="self-start">
            Take another photo
          </Button>
        </div>
      </div>
    );
  }

  const { scores, overlays, regions, region_scores, region_low_confidence } = scan.result;
  const { bands, skus, rule_trace } = runSkinCheckRules(scan.result);
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

  // The trace entry that made each SKU fire — this is what turns "buy this"
  // into "buy this BECAUSE pigment banded Elevated", which is the entire
  // differentiated pitch of a brand positioned on measurability.
  const reasonFor = (sku: string) =>
    rule_trace.find((t) => t.rule === `sku:${sku}` && t.fired)?.detail ?? null;

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
                    bands[key] === "Elevated"
                      ? `flex w-full items-center justify-between border-l-2 py-3 pl-3 pr-1 text-left transition-colors duration-150 ${active ? "border-accent bg-canvas" : "border-accent"}`
                      : `flex w-full items-center justify-between border-l-2 py-3 pl-3 pr-1 text-left transition-colors duration-150 ${active ? "border-text/30 bg-canvas" : "border-transparent"}`
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

      <section className="flex flex-col gap-3">
        <h2 className="text-label uppercase text-muted-foreground">What we&apos;d use</h2>
        <ul className="flex flex-col gap-2">
          {skus.map((sku) => {
            const product = SKU_DISPLAY[sku];
            if (!product) return null;
            const reason = reasonFor(sku);
            return (
              <li key={sku} className="flex gap-3 rounded border border-border p-4">
                <span
                  aria-hidden
                  className={`mt-1 h-8 w-1 shrink-0 rounded-pill ${SKU_ACCENT_CLASS[product.accent] ?? ""}`}
                />
                <div className="flex flex-col gap-1">
                  <a
                    href={`/products/${product.handle}`}
                    className="text-body font-medium text-text underline underline-offset-4"
                  >
                    {product.name}
                  </a>
                  <p className="text-body text-text/70">{product.blurb}</p>
                  {reason && <p className="text-label text-muted-foreground">Why: {reason}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
