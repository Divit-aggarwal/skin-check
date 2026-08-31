"use client";

import { useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { getSkinScanResult } from "@/lib/api";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { runSkinCheckRules, type Band, type BandableMetric } from "@/lib/skin-check-rules";
import { SKU_DISPLAY, METRIC_LABELS, SKU_ACCENT_CLASS } from "@/lib/skin-check-skus";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import type { SkinScanState } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { EchoTwin } from "./EchoTwin";

// The metric whose overlay we requested at scan time — the user's own stated
// primary concern from the quiz. `pores` is excluded from banding (it returns
// exactly 0.0 on every real photo), so if that's what they picked we fall
// through to whatever actually banded highest rather than showing them an
// overlay of a metric that never measured anything.
function resolveFocus(
  answers: SkinCheckAnswers,
  bands: Record<BandableMetric, Band>
): BandableMetric | null {
  const stated = answers.primary_concern;
  if (typeof stated === "string" && stated !== "pores" && stated in METRIC_LABELS) {
    return stated as BandableMetric;
  }
  const elevated = (Object.keys(bands) as BandableMetric[]).find((m) => bands[m] === "Elevated");
  return elevated ?? null;
}

// Bands ride a WEIGHT ramp, not a colour ramp. The Purity theme ships no
// success/warning/error palette, and a red/amber/green traffic light next to
// someone's face is exactly the clinical claim this product has spent its
// whole design refusing to make. Elevated earns the rose rule; nothing
// earns red.
const BAND_STYLE: Record<Band, string> = {
  Low: "text-muted",
  Moderate: "text-text",
  Elevated: "text-text font-medium",
};

interface SkinCheckDashboardProps {
  scan: SkinScanState;
  onScanChange: (scan: SkinScanState) => void;
  answers: SkinCheckAnswers;
}

export function SkinCheckDashboard({ scan, onScanChange, answers }: SkinCheckDashboardProps) {
  const { setSession } = useSkinCheckSession();

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

  if (scan.status === "idle") return null;

  if (scan.status === "loading") {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="aspect-[3/4] w-full max-w-[340px] self-center rounded-media" />
        {/* Copy, not a bare spinner. The upstream timeout is 30s and the
            previous version showed nothing at all for the duration. */}
        <p className="text-center text-body text-muted">
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
        const result = await getSkinScanResult(photo, resolveFocus(answers, {} as never));
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
          overlays={null}
          focus={null}
          summary="We couldn't read this photo."
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

  const { scores, overlays } = scan.result;
  const { bands, skus, rule_trace } = runSkinCheckRules(scan.result);
  const { summaryLine } = summarizeConcerns(scores, bands);
  const focus = resolveFocus(answers, bands);

  // Concern-ranked, so the thing that matters is at the top of the list
  // rather than wherever it happened to sit in the type definition.
  const ranked = (Object.keys(METRIC_LABELS) as BandableMetric[]).sort((a, b) => {
    const order: Record<Band, number> = { Elevated: 0, Moderate: 1, Low: 2 };
    return order[bands[a]] - order[bands[b]];
  });

  // The trace entry that made each SKU fire — this is what turns "buy this"
  // into "buy this BECAUSE pigment banded Elevated", which is the entire
  // differentiated pitch of a brand positioned on measurability.
  const reasonFor = (sku: string) =>
    rule_trace.find((t) => t.rule === `sku:${sku}` && t.fired)?.detail ?? null;

  return (
    <div className="flex flex-col gap-10">
      <EchoTwin photo={scan.photo} overlays={overlays} focus={focus} summary={summaryLine} />

      <section className="flex flex-col gap-3">
        <h2 className="text-label uppercase text-muted">What we read</h2>
        <ul className="flex flex-col">
          {ranked.map((key) => (
            <li
              key={key}
              className={
                bands[key] === "Elevated"
                  ? "flex items-center justify-between border-l-2 border-accent py-3 pl-3"
                  : "flex items-center justify-between border-l-2 border-transparent py-3 pl-3"
              }
            >
              <span className="text-body text-text">{METRIC_LABELS[key]}</span>
              <span className={`text-body ${BAND_STYLE[bands[key]]}`}>{bands[key]}</span>
            </li>
          ))}
        </ul>
        {/* `pores` is deliberately absent from this list. It returns exactly
            0.0 on every real photo, so it is excluded from banding upstream.
            The previous version gave it 1/7 of the payoff screen to say
            "Not measured yet". */}
        <p className="text-label uppercase tracking-label text-muted">
          Bands compare signals within this photo, not against other people
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-label uppercase text-muted">What we&apos;d use</h2>
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
                  {reason && <p className="text-label text-muted">Why: {reason}</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
