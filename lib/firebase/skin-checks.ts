import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, type Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { scanImageKey } from "@/lib/s3-key";
import { IMAGE_RETENTION_CONSENT_VERSION } from "@/lib/consent";
import { hasQuestionAnswers, keptProductNames, questionAnswersOnly, type ProductNames } from "@/lib/skin-check-validation";
import type { SkinScanResult, SkinScanState } from "@/types/skin-scan";

/** Terminal state of one scan, recorded in a single write. */
export type SkinCheckStatus =
  | "completed"           // questionnaire + a successful analysis
  | "analysis_failed"     // questionnaire saved, the CV scan errored
  | "questionnaire_only"; // no photo was captured

export const SKIN_CHECK_SCHEMA_VERSION = 1;

/**
 * TD-33: 2 adds the "Other products" option, the two product-name boxes and
 * the optional questionnaire. A record without the field is version 1.
 * schemaVersion stays 1: the legacy-result fallback is tied to it (DATA_MODEL).
 */
export const QUESTIONNAIRE_VERSION = 2;

/** The record's productNames: only names whose option is picked; absent when there are none. */
function productNamesField(answers: SkinCheckAnswers, names: ProductNames) {
  const kept = keptProductNames(answers.current_products, names);
  return Object.keys(kept).length > 0 ? { productNames: kept } : {};
}

/**
 * An allowlist of the scan result: the base64 `overlays` would break
 * Firestore's 1 MiB document limit, and the region stat dumps are not needed
 * to show a past result. Everything the results screen reads is kept.
 */
function persistableResult(result: SkinScanResult) {
  return {
    scores: result.scores,
    regions: result.regions,
    region_scores: result.region_scores,
    // Both genuinely absent on older pipeline versions — Firestore rejects
    // an explicit `undefined`, so omit the key instead of writing one.
    ...(result.score_types ? { score_types: result.score_types } : {}),
    ...(result.region_low_confidence ? { region_low_confidence: result.region_low_confidence } : {}),
    pipeline_version: result.pipeline_version,
  };
}

/**
 * Writes one completed Skin Check to `users/{uid}/skinChecks/{scanId}`, one
 * document per scan. A double tap or retry addresses the same document, and
 * firestore.rules deny `update`, so `permission-denied` on an existing
 * document means "already saved". The rules also require
 * `request.auth.uid == uid`.
 */
export async function saveSkinCheck(
  uid: string,
  scanId: string,
  answers: SkinCheckAnswers,
  scan: SkinScanState,
  /** TD-33 (2): kept apart from answers; nothing that reads answers sees them. */
  productNames: ProductNames = {}
): Promise<void> {
  const status: SkinCheckStatus =
    scan.status === "success"
      ? "completed"
      : scan.status === "error"
        ? "analysis_failed"
        : "questionnaire_only";

  try {
    await setDoc(doc(db(), "users", uid, "skinChecks", scanId), {
      schemaVersion: SKIN_CHECK_SCHEMA_VERSION,
      scanId,
      answers,
      // From the answers themselves, so the record cannot claim otherwise.
      questionnaire: hasQuestionAnswers(answers) ? "answered" : "skipped",
      questionnaireVersion: QUESTIONNAIRE_VERSION,
      ...productNamesField(answers, productNames),
      status,
      // The ORIGINAL image lives in a private S3 bucket, never here
      // — no bytes, no base64, no public URL. `key` is only ever the
      // deterministic path built from this uid + scanId (lib/s3-key.ts), the
      // same builder the presign route uses, so it cannot name another
      // user's object; firestore.rules re-checks that server-side.
      //
      // `stored: false` when the upload didn't happen or didn't succeed —
      // including a resumed draft, which no longer has the original bytes.
      // That under-claims rather than over-claims: never write stored: true
      // for an object we didn't watch land.
      image: scan.status === "success" || scan.status === "error"
        ? scan.originalStored
          ? {
              stored: true,
              captureMethod: scan.captureMethod,
              storage: "s3",
              key: scanImageKey(uid, scanId),
            }
          : { stored: false, captureMethod: scan.captureMethod }
        : null,
      // Image-retention consent, recorded per scan and never inferred: this is
      // only true when the user checked the retention box for THIS capture
      // (components/skin-check/inputs/PhotoCapture.tsx). The processing
      // consent that gates the analysis is a separate permission and is not
      // represented by this field.
      //
      // The timestamp is serverTimestamp(), like createdAt — a client clock is
      // not evidence of when consent was given. firestore.rules requires this
      // block to say true, with this exact version, before it will accept a
      // record claiming image.stored == true.
      consent:
        (scan.status === "success" || scan.status === "error") &&
        // Compared against the constant, not merely checked for presence: a
        // session or in-memory state carrying a superseded version string is
        // consent to different wording, and must not be recorded as consent to
        // this one.
        scan.retentionConsentVersion === IMAGE_RETENTION_CONSENT_VERSION
          ? {
              imageRetention: true,
              imageRetentionVersion: scan.retentionConsentVersion,
              imageRetentionConsentedAt: serverTimestamp(),
            }
          : { imageRetention: false },
      result: scan.status === "success" ? persistableResult(scan.result) : null,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // The rules deny `update`, so this is what a duplicate submission looks
    // like from the client: the scan is already saved and the second write
    // was correctly refused. Not an error the user should ever see.
    //
    // But every rule rejection looks the same (stale consent version, no or
    // another user's auth), so it only counts as saved if the doc really
    // exists. Otherwise the original error goes back up and the draft stays.
    if ((error as { code?: string })?.code === "permission-denied") {
      const existing = await getDoc(doc(db(), "users", uid, "skinChecks", scanId)).catch(() => null);
      if (existing?.exists()) {
        console.info("[skin-check] scan already saved, duplicate write refused:", scanId);
        return;
      }
    }
    throw error;
  }
}

// ─── Reading a user's own scans back ───────────────────────────────────────

/** One row of the past-scans list: a summary, not the whole document. */
export interface SkinCheckSummary {
  scanId: string;
  status: SkinCheckStatus;
  /**
   * null is a real, expected value — `createdAt` is a serverTimestamp(), so a
   * document this same client just wrote reads back with it still unresolved
   * until the server round-trips. Render it as "just now", never as an error.
   */
  createdAt: Date | null;
  /** True only when the original image is actually in S3 for this scan. */
  imageStored: boolean;
  /** True when a CV analysis landed — false for questionnaire-only/failed. */
  hasResult: boolean;
}

/**
 * Every scan this user owns, newest first, every terminal status included.
 * Ownership is enforced by firestore.rules, not here.
 */
export async function listSkinChecks(uid: string): Promise<SkinCheckSummary[]> {
  const snapshot = await getDocs(
    query(collection(db(), "users", uid, "skinChecks"), orderBy("createdAt", "desc"))
  );

  return snapshot.docs.map((entry) => {
    const data = entry.data() as {
      status?: SkinCheckStatus;
      createdAt?: Timestamp | null;
      image?: { stored?: boolean } | null;
      result?: unknown;
    };
    return {
      scanId: entry.id,
      // A document written before `status` existed would have none; treat it
      // as questionnaire-only rather than crashing the whole list.
      status: data.status ?? "questionnaire_only",
      // toDate() only exists on a resolved Timestamp — see the null note above.
      createdAt: data.createdAt?.toDate() ?? null,
      imageStored: data.image?.stored === true,
      hasResult: data.result != null,
    };
  });
}

/**
 * The questionnaire answers from this user's most recent scan, or null if they
 * have none. Ownership is enforced by firestore.rules, as for listSkinChecks.
 */
export async function latestSkinCheckAnswers(uid: string): Promise<SkinCheckAnswers | null> {
  const snapshot = await getDocs(
    query(collection(db(), "users", uid, "skinChecks"), orderBy("createdAt", "desc"), limit(1))
  );
  const newest = snapshot.docs[0];
  const answers: unknown = newest?.data().answers;
  if (!newest || !answers || typeof answers !== "object") return null;
  // TD-33: a skipped check answered later counts as answered (its answers only, never its names).
  const later = await getDoc(doc(db(), "users", uid, "laterAnswers", newest.id)).catch(() => null);
  const laterAnswers: unknown = later?.exists() ? later.data().answers : null;
  // Only question answers, and only for a check with none of its own (reviews, TD-33).
  return laterAnswers && typeof laterAnswers === "object" && !hasQuestionAnswers(answers as SkinCheckAnswers)
    ? { ...(answers as SkinCheckAnswers), ...questionAnswersOnly(laterAnswers as SkinCheckAnswers) }
    : (answers as SkinCheckAnswers);
}

/** Whether the answer-later record for this check exists (a refused duplicate is already saved). */
export async function laterAnswersSaved(uid: string, scanId: string): Promise<boolean> {
  return (await getDoc(doc(db(), "users", uid, "laterAnswers", scanId)).catch(() => null))?.exists() ?? false;
}

/**
 * TD-33 (1): answers given later for a check that skipped the questions, in
 * their own create-only record, so the check itself is never edited.
 * firestore.rules accepts it only for the owner's own skipped check, once.
 */
export async function saveLaterAnswers(uid: string, scanId: string, answers: SkinCheckAnswers, productNames: ProductNames): Promise<void> {
  const own = questionAnswersOnly(answers);
  await setDoc(doc(db(), "users", uid, "laterAnswers", scanId), {
    scanId,
    answers: own,
    questionnaireVersion: QUESTIONNAIRE_VERSION,
    ...productNamesField(own, productNames),
    createdAt: serverTimestamp(),
  });
}
