// BE4 (TD-54 (1)): readings over time, read-only. A pure function over the
// checks the dashboard loader already reads (no new route, no new store).
// Lanes A (09-12) and C (16) draw it.
//
// Levels are the band words of each check. A change value exists ONLY behind
// the gate: at least MIN_COMPARABLE checks whose captures lib/comparability.ts
// accepts for that quantity. Scores are per-photo stretched (image_relative)
// and are never gated quantities, so with COMPARABLE_QUANTITIES empty every
// slot is "needs_more_checks". The gate is never loosened here.

import type { Band } from "@/lib/skin-check-rules";
import type { ShownMetric } from "@/lib/skin-check-skus";

export const MIN_COMPARABLE = 3;
export const CHANGE_LABEL = "estimated from your photos";

export interface SeriesPoint {
  scanId: string;
  /** ISO time the check was analysed. */
  at: string;
  band: Band | null;
  earlyEstimate: boolean;
  pipelineVersion: string | null;
  /** Whether this check has a kept photo per angle (drawn through PHOTO_ROUTE). */
  photos: { front: boolean; left: boolean; right: boolean };
}

export type ChangeSlot =
  | { status: "needs_more_checks"; comparableCount: number; needed: typeof MIN_COMPARABLE }
  | {
      status: "open";
      /** Signed change of the gated physical quantity over the window, in its own unit. */
      change: number;
      unit: string;
      fromScanId: string;
      toScanId: string;
      label: typeof CHANGE_LABEL;
    };

export interface ReadingSeries {
  metric: ShownMetric;
  /** Oldest first. */
  points: SeriesPoint[];
  change: ChangeSlot;
}

export type SeriesWindow = "4w" | "8w" | "12w" | "all";

export interface ReadingsOverTime {
  window: SeriesWindow;
  series: ReadingSeries[];
  /** Checks read by a different engine version than the newest (drawn with the TD otherVersion line). */
  otherVersionScanIds: string[];
}

/** Product view (16): the same series, cut at the product's start date. */
export interface SinceStarted {
  productId: string;
  /** YYYY-MM-DD from routine events (`since`). */
  startedOn: string;
  readings: ReadingsOverTime;
}

// Implemented in lib/readings/series.ts (BE4):
//   readingsOverTime(checks: CheckView[], window: SeriesWindow, now: Date): ReadingsOverTime
//   sinceStarted(checks: CheckView[], productId: string, startedOn: string, now: Date): SinceStarted
