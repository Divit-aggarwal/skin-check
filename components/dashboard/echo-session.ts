import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import type { SkinCheckSession } from "@/lib/skin-check-session-context";
import type { SkinCheckAnswers } from "@/types/skin-check";
import type { CaptureMethod, SkinScanResult } from "@/types/skin-scan";
import type { DashboardData } from "./data";
import { deriveDashboard, echoRecord } from "./state";

/**
 * The Echo session for the user's newest reading, built from the data the
 * dashboard already loads. One helper for every way into Echo (Home, an
 * opened check, the nav, a refresh of /echo), so the chat route always gets
 * the same session. Echo reads only scanId and region_scores from it; the chat
 * server loads the facts for that scanId itself. null when there is no reading.
 */
export function newestEchoSession(uid: string, data: DashboardData): SkinCheckSession | null {
  const scanId = deriveDashboard(uid, data.checks, data.analyses).echoScanId;
  if (!scanId) return null;
  const record = echoRecord(uid, scanId, data.analyses);
  if (!record) return null;
  const result = record as unknown as SkinScanResult;
  const { bands } = bandScores(result.scores);
  return {
    scanId,
    answers: (data.checks.find((c) => c.id === scanId)?.data.answers ?? {}) as SkinCheckAnswers,
    result,
    composite: summarizeConcerns(result.scores, bands),
    // ponytail: no photo is held here; Echo never reads it. Load the stored original if Echo ever shows it.
    photo: new Blob(),
    captureMethod: (record.captureMethod as CaptureMethod | undefined) ?? "native",
    // K-1: Echo's back link goes to Home, never to an old results screen.
    fromDashboard: true,
  };
}
