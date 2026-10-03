import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { SkinScanScoresSchema, type SkinScanScores } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";

// SERVER ONLY (imports lib/firebase/admin.ts). Gate 02: client-provided
// analysis measurements and analysis identity are never authoritative. Every
// fact Echo is grounded in is read here, under the VERIFIED uid, so a scanId
// belonging to another user simply isn't found — same outcome as a scanId
// that doesn't exist.

const AnalysisSchema = z.object({
  scores: SkinScanScoresSchema,
  region_scores: z.record(z.string(), SkinScanScoresSchema).optional(),
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
  const [analyses, skinCheck] = await Promise.all([
    user.collection("scanAnalyses").where("scanId", "==", scanId).get(),
    user.collection("skinChecks").doc(scanId).get(),
  ]);

  const docs = analyses.docs
    .map((d) => d.data())
    .sort(
      (a, b) =>
        Number(a.persistAttempt !== undefined) - Number(b.persistAttempt !== undefined) ||
        millis(b.createdAt) - millis(a.createdAt)
    );
  const analysis = AnalysisSchema.safeParse(docs[0]);
  if (!analysis.success) return null;

  // Echo still works without quiz context, so a missing or malformed answers
  // map degrades to {} instead of blocking the chat.
  const answers = AnswersSchema.safeParse(skinCheck.exists ? skinCheck.data()?.answers : undefined);

  return {
    scores: analysis.data.scores,
    regionScores: analysis.data.region_scores ?? {},
    answers: answers.success ? answers.data : {},
  };
}
