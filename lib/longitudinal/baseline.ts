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
