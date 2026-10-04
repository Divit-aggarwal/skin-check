// D01 baseline window (design §2.4 steps 3-5). Pure.
//
// Candidates are the first BASELINE_RULE.scans states before the latest, in
// time order, with a known engine build that are usable on their own for the
// quantity (`usable`: e.g. the region is present). They are never picked or
// skipped by engine identity, and never by matching the latest, so a baseline
// cannot drift past an engine change into a newer epoch: re-baselining is D05
// (LATER).
//
// D06 (TD-14 (3), (4), both PROVISIONAL): a scan whose capture method differs
// from the latest's is skipped too (capture method is not an epoch, so this
// cannot cross an engine change either), and then at most one scan per
// calendar day (India time, TD-18) counts. The skips run first, so a day whose first scan is
// skipped still counts its next usable one.

import { compareStates, SKINSTATE_FIELD_PATHS, type NotComparableReason } from "@/lib/comparability";
import type { SkinStateRegionKey } from "@/lib/skin-state";
import type { SkinState2 } from "@/lib/skin-state-2";
import { BASELINE_ONE_PER_DAY_RULE, BASELINE_RULE } from "./settings";

/** YYYY-MM-DD in the rule's time zone (server analyzedAt, never the device clock). */
const DAY = new Intl.DateTimeFormat("en-CA", { timeZone: BASELINE_ONE_PER_DAY_RULE.timeZone, year: "numeric", month: "2-digit", day: "2-digit" });

export interface BaselinePick {
  latest: SkinState2 | null;
  candidates: SkinState2[];
  /** Every state from the first candidate through the latest, in time order. */
  window: SkinState2[];
  /** More than one pipelineVersion, or more than one known build, inside the window. */
  engineBoundary: boolean;
}

export function sortStates(states: readonly SkinState2[]): SkinState2[] {
  return [...states].sort((a, b) =>
    a.provenance.analyzedAt < b.provenance.analyzedAt ? -1 : a.provenance.analyzedAt > b.provenance.analyzedAt ? 1
      : a.identity.analysisRef < b.identity.analysisRef ? -1 : a.identity.analysisRef > b.identity.analysisRef ? 1 : 0);
}

export function pickBaseline(states: readonly SkinState2[], usable: (s: SkinState2) => boolean = () => true): BaselinePick {
  const sorted = sortStates(states);
  const latest = sorted.at(-1) ?? null;
  // BASELINE_CAPTURE_METHOD_RULE
  const sameCapture = (s: SkinState2) => s.input.captureMethod === latest?.input.captureMethod;
  const seenDays = new Set<string>();
  const firstOfDay = (s: SkinState2) => {
    const day = DAY.format(new Date(s.provenance.analyzedAt));
    if (seenDays.has(day)) return false;
    seenDays.add(day);
    return true;
  };
  const candidates = sorted
    .slice(0, -1)
    .filter((s) => s.engine.build !== null && usable(s) && sameCapture(s))
    .filter(firstOfDay)
    .slice(0, BASELINE_RULE.scans);
  const window = candidates.length ? sorted.slice(sorted.indexOf(candidates[0]!)) : sorted.slice(-1);
  const pipelines = new Set(window.map((s) => s.engine.pipelineVersion));
  const builds = new Set(window.map((s) => s.engine.build).filter((b) => b !== null));
  return { latest, candidates, window, engineBoundary: pipelines.size > 1 || builds.size > 1 };
}

/**
 * G-1: one state per check (scanId), picked as Echo picks a record
 * (lib/echo-trusted-context.ts): the primary before a recovery run, then the
 * newest. A retake or recovery run writes several records for one check, and
 * a check is one starting-check place at most.
 */
export function onePerCheck(states: readonly SkinState2[]): SkinState2[] {
  const ranked = [...states].sort(
    (a, b) =>
      Number(a.provenance.persistAttempt === "recovery") - Number(b.provenance.persistAttempt === "recovery") ||
      (a.provenance.analyzedAt < b.provenance.analyzedAt ? 1 : a.provenance.analyzedAt > b.provenance.analyzedAt ? -1 : 0)
  );
  const picked = new Map<string, SkinState2>();
  for (const s of ranked) if (!picked.has(s.identity.scanId)) picked.set(s.identity.scanId, s);
  return Array.from(picked.values());
}

/**
 * G-1: THE starting checks, for the engine (per quantity, with its `usable`)
 * and the dashboard (one count for the page). Same reduction, same rule, so
 * the two never disagree on what counts.
 */
export function startingChecks(states: readonly SkinState2[], usable: (s: SkinState2) => boolean = () => true): BaselinePick {
  return pickBaseline(onePerCheck(states), usable);
}

/** G-1: how many starting-check places are filled, capped at BASELINE_RULE.scans. */
export const startingCheckCount = (pick: BaselinePick): number => Math.min(pick.candidates.length, BASELINE_RULE.scans);

/** Reasons a single state has on its own account. Skipping on these cannot cross an engine change. */
export const SELF_UNUSABLE: readonly NotComparableReason[] = ["region_absent", "region_low_pixel_count", "native_stats_missing", "capture_method_unknown"];

/** The regions the engine measures (0.1.6 writes no image-side cheek). */
const MEASURED_REGIONS = ["forehead", "nose", "chin", "cheeks"] as const satisfies readonly SkinStateRegionKey[];

/**
 * D07 (owner TD-20, option a): the dashboard's one count for the page takes
 * only checks usable on their own account for every quantity in every
 * measured region, so it never counts a check the engine would skip for some
 * quantity. Stricter than the engine's per-quantity `usable`, never looser.
 */
export function usableForEveryQuantity(s: SkinState2): boolean {
  return MEASURED_REGIONS.every((region) =>
    SKINSTATE_FIELD_PATHS.every((quantity) => {
      const v = compareStates(s, s, quantity, region);
      return v.verdict === "comparable" || !v.reasons.some((r) => SELF_UNUSABLE.includes(r));
    })
  );
}
