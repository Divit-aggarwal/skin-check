import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { SkinScanRegionLowConfidenceSchema, SkinScanScoresSchema, type SkinScanScores } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { toSkinState2 } from "@/lib/skin-state-2";
import { hasQuestionAnswers } from "@/lib/skin-check-validation";

// SERVER ONLY (imports lib/firebase/admin.ts). Gate 02: client-provided
// analysis measurements and analysis identity are never authoritative. Every
// fact Echo is grounded in is read here, under the VERIFIED uid, so a scanId
// belonging to another user simply isn't found — same outcome as a scanId
// that doesn't exist.

const AnalysisSchema = z.object({
  scores: SkinScanScoresSchema,
  region_scores: z.record(z.string(), SkinScanScoresSchema).optional(),
  // lane:context, additive: provenance and confidence for the context package.
  // .catch: a bad value here is dropped, never turns a record today's Echo
  // could read into a 409.
  region_low_confidence: SkinScanRegionLowConfidenceSchema.optional().catch(undefined),
  pipeline_version: z.string().max(100).optional().catch(undefined),
  // F09: the record's own schema version, so the context package names the
  // contract the data was really read under. A bad value is dropped (unknown).
  schemaVersion: z.number().int().positive().max(1000).optional().catch(undefined),
});

// Same bounds the chat route used to apply to client-sent answers. Answers are
// SELF-REPORTED quiz input from this user, read from their own
// users/{uid}/skinChecks doc (browser-written) — trusted only as "what the
// user said", never as a measurement. `result` on that doc is browser-written
// too and is never read.
const AnswersSchema = z.record(z.string(), z.union([z.string().max(500), z.array(z.string().max(200)).max(20)]));

export interface TrustedEchoContext {
  scores: SkinScanScores;
  regionScores: Record<string, SkinScanScores>;
  answers: SkinCheckAnswers;
  regionLowConfidence: Record<string, boolean>;
  pipelineVersion: string | null;
  /** schemaVersion of the scanAnalyses record read; null when absent or malformed. */
  schemaVersion: number | null;
}

const millis = (value: unknown): number =>
  typeof (value as { toMillis?: unknown })?.toMillis === "function" ? (value as { toMillis(): number }).toMillis() : 0;

/**
 * Null when no usable server-written analysis exists for (uid, scanId).
 *
 * Record choice: the latest PRIMARY record (no `persistAttempt`) — that's the
 * CV run whose result the user is looking at. A `recovery` record (a second
 * CV run, written only when the primary persist failed) is the fallback.
 * Equality-only query, sorted in code, so no composite index is needed.
 */
export async function loadTrustedEchoContext(uid: string, scanId: string): Promise<TrustedEchoContext | null> {
  const user = adminDb().collection("users").doc(uid);
  const [analyses, skinCheck, later] = await Promise.all([
    user.collection("scanAnalyses").where("scanId", "==", scanId).get(),
    user.collection("skinChecks").doc(scanId).get(),
    // TD-33 (1): answers given later for a skipped check (create-only, owner-only).
    user.collection("laterAnswers").doc(scanId).get(),
  ]);

  const docs = analyses.docs
    .map((d) => ({ id: d.id, data: d.data() }))
    .sort(
      (a, b) =>
        Number(a.data.persistAttempt !== undefined) - Number(b.data.persistAttempt !== undefined) ||
        millis(b.data.createdAt) - millis(a.data.createdAt)
    );
  const picked = docs[0];
  const analysis = AnalysisSchema.safeParse(picked?.data);
  if (!picked || !analysis.success) return null;
  // Red team (I02, area A): the same validity the dashboard and the
  // longitudinal contract use (schema version, doc id = scanId + input hash,
  // owner, provenance), so Echo never talks about a record the dashboard
  // shows as no reading.
  if (toSkinState2(picked.data, `users/${uid}/scanAnalyses/${picked.id}`, uid).kind !== "skinstate") return null;

  // Echo still works without quiz context, so a missing or malformed answers
  // map degrades to {} instead of blocking the chat.
  // Only `.answers` is read from either record: productNames (TD-33 (2)) is
  // never loaded here, so no Echo path can carry it to Gemini.
  const answers = AnswersSchema.safeParse(skinCheck.exists ? skinCheck.data()?.answers : undefined);
  const laterAnswers = AnswersSchema.safeParse(later.exists ? later.data()?.answers : undefined);
  const merged = { ...(answers.success ? answers.data : {}), ...(laterAnswers.success ? laterAnswers.data : {}) };

  return {
    scores: analysis.data.scores,
    regionScores: analysis.data.region_scores ?? {},
    // TD-33 (1): name, age and gender alone are not answers. A check whose
    // questions were skipped (and not answered later) reads as no answers, so
    // Echo gives the F11 fixed reply and makes no Gemini call, whatever the
    // client-written `questionnaire` flag says.
    answers: hasQuestionAnswers(merged) ? merged : {},
    regionLowConfidence: analysis.data.region_low_confidence ?? {},
    pipelineVersion: analysis.data.pipeline_version ?? null,
    schemaVersion: analysis.data.schemaVersion ?? null,
  };
}
