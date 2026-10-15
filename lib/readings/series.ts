// BE4 (TD-54 (1)): readings over time, read-only, over the checks the
// dashboard loader already reads. Levels are each check's stored band. A
// change value comes ONLY from the longitudinal engine (baseline of 3
// comparable checks, noise floor), for a reading that has a validated physical
// quantity in METRIC_QUANTITY. That map is empty until C12, so every slot is
// "needs_more_checks". Never loosen it here.

import type { CheckView } from "@/components/dashboard/state";
import type { SkinState2Result } from "@/lib/skin-state-2";
import type { QuantityPath } from "@/lib/contracts/longitudinal-result";
import type { SkinStateRegionKey } from "@/lib/skin-state";
import { longitudinalResult } from "@/lib/longitudinal/engine";
import { SHOWN_METRICS, EARLY_ESTIMATE_METRICS, type ShownMetric } from "@/lib/skin-check-skus";
import { CHANGE_LABEL, MIN_COMPARABLE, type ChangeSlot, type ReadingsOverTime, type SeriesWindow, type SinceStarted } from "@/lib/feature-contracts/readings-series";

/** C12: the validated quantity behind each reading. Empty: no reading has one yet. */
export const METRIC_QUANTITY: Readonly<Partial<Record<ShownMetric, { quantity: QuantityPath; region: SkinStateRegionKey; unit: string }>>> = Object.freeze({});

export interface SeriesCheck {
  view: CheckView;
  /** The skinstate-2 read of this check's analysis; null for a legacy check. */
  state: SkinState2Result | null;
  photos: { front: boolean; left: boolean; right: boolean };
}

const WEEKS: Record<SeriesWindow, number | null> = { "4w": 4, "8w": 8, "12w": 12, all: null };

function changeSlot(metric: ShownMetric, checks: readonly SeriesCheck[]): ChangeSlot {
  const q = METRIC_QUANTITY[metric];
  const closed = (n: number): ChangeSlot => ({ status: "needs_more_checks", comparableCount: n, needed: MIN_COMPARABLE });
  if (!q) return closed(0);
  const states = checks.flatMap((c) => (c.state ? [c.state] : []));
  const r = longitudinalResult(states, q.quantity, q.region);
  // ponytail: an open slot shows the difference even when it sits within the noise floor; when C12 fills
  // METRIC_QUANTITY, decide whether within-noise gets its own state (r.passedNoiseFloor).
  if (r.evidence === "pairwise" && r.detail.difference !== null && r.detail.baselineAnalysisRefs[0] && r.detail.latestAnalysisRef) {
    const scanOf = (ref: string) => ref.split("/").pop()?.split("_")[0] ?? ref;
    return { status: "open", change: r.detail.difference, unit: q.unit, fromScanId: scanOf(r.detail.baselineAnalysisRefs[0]), toScanId: scanOf(r.detail.latestAnalysisRef), label: CHANGE_LABEL };
  }
  return closed(r.compared.baseline.status === "insufficient" ? r.compared.baseline.scans : 0);
}

export function readingsOverTime(checks: readonly SeriesCheck[], window: SeriesWindow, now: Date): ReadingsOverTime {
  const weeks = WEEKS[window];
  const from = weeks === null ? -Infinity : now.getTime() - weeks * 7 * 86_400_000;
  const inWindow = checks
    .filter((c) => c.view.date && c.view.date.getTime() >= from && c.view.date.getTime() <= now.getTime())
    .sort((a, b) => a.view.date!.getTime() - b.view.date!.getTime());
  const newestVersion = [...inWindow].reverse().find((c) => c.view.pipelineVersion)?.view.pipelineVersion ?? null;
  return {
    window,
    series: SHOWN_METRICS.map((metric) => ({
      metric,
      points: inWindow.map((c) => ({
        scanId: c.view.scanId,
        at: c.view.date!.toISOString(),
        band: c.view.bands?.find((b) => b.metric === metric)?.band ?? null,
        earlyEstimate: (EARLY_ESTIMATE_METRICS as readonly string[]).includes(metric),
        pipelineVersion: c.view.pipelineVersion,
        photos: c.photos,
      })),
      change: changeSlot(metric, inWindow),
    })),
    otherVersionScanIds: inWindow.filter((c) => c.view.pipelineVersion && newestVersion && c.view.pipelineVersion !== newestVersion).map((c) => c.view.scanId),
  };
}

/** Screen 16: the checks on or after the product's start date (YYYY-MM-DD, India day). Association only. */
export function sinceStarted(checks: readonly SeriesCheck[], productId: string, startedOn: string, now: Date): SinceStarted {
  const start = new Date(`${startedOn}T00:00:00+05:30`).getTime();
  return { productId, startedOn, readings: readingsOverTime(checks.filter((c) => (c.view.date?.getTime() ?? -1) >= start), "all", now) };
}
