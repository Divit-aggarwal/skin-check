import { pastCheck, type Doc, type HistoryRow } from "@/components/dashboard/state";
import type { Band } from "@/lib/skin-check-rules";
import type { ShownMetric } from "@/lib/skin-check-skus";

// Screen 11 (TD-50 e): one reading's whole-face level word at each check, in
// history order (newest first, never re-ordered by a level). Each level is
// relative to its own photo; the screen carries the fixed line (TD-24 (1)).
// Checks with no photo reading (questions only, failed) have no row. Pure.

export interface ReadingRow {
  scanId: string;
  date: Date | null;
  legacy: boolean;
  /** null when the stored scores could not be read. */
  band: Band | null;
  /** Read by a different software version than the newest reading (comparability gate, owner answer 7). */
  otherVersion: boolean;
}

export function readingHistory(uid: string, history: readonly HistoryRow[], checks: readonly Doc[], analyses: readonly Doc[], metric: ShownMetric): ReadingRow[] {
  const views = history.flatMap((row) => {
    const view = pastCheck(uid, row.scanId, checks, analyses)?.view;
    return view ? [{ row, view }] : [];
  });
  const newest = views.find((v) => v.view.pipelineVersion !== null)?.view.pipelineVersion ?? null;
  return views.map(({ row, view }) => ({
    scanId: row.scanId,
    date: row.date,
    legacy: view.source === "legacy",
    band: view.bands?.find((b) => b.metric === metric)?.band ?? null,
    otherVersion: view.pipelineVersion !== null && view.pipelineVersion !== newest,
  }));
}
