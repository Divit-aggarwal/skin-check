import { Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { EchoChatMessage } from "@/lib/gemini";
import type { EchoRegion } from "@/lib/echo-regions";
import type { ProductGuard, ShownProduct, ValidatorRecord } from "./answer";

// SERVER ONLY. D-15 (approved for local use): users/{uid}/chatTurns are the
// only history source; client-sent turns are never fed to Gemini. Written
// only here, through the Admin SDK, with a path built from the verified uid.
// `expireAt` is for a Firestore TTL policy, which is infrastructure (request
// to main; design §3.8).

export const CHAT_TURN_TTL_DAYS = 90;
export const HISTORY_TURNS = 10;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface EchoTurnRecord {
  packageVersion: string | null;
  packageSha256: string | null;
  promptVersion: string | null;
  modelId: string | null;
  validator: ValidatorRecord | null;
  prefilter: "red_flag" | "comparison" | "unsupported_script" | null;
  redFlag: boolean;
  latencyMs: number;
  /** TD-34: checked product suggestions (ids and reasons), the reply without product claims, and the guard the user saw. */
  products?: ShownProduct[];
  withoutProducts?: string;
  guard?: ProductGuard;
  /** TD-34: Echo's opening suggestion. Never in Gemini's history or the split check; read back by loadOpening. */
  opening?: boolean;
}

const turns = (uid: string) => adminDb().collection("users").doc(uid).collection("chatTurns");

/** Both turns of one exchange, in one batch. The echo turn carries the versions and the validator result. */
export async function recordChatTurns(
  uid: string,
  scanId: string,
  region: EchoRegion,
  userText: string,
  echoText: string,
  meta: EchoTurnRecord,
  now = Date.now()
): Promise<void> {
  const col = turns(uid);
  const expireAt = Timestamp.fromMillis(now + CHAT_TURN_TTL_DAYS * DAY_MS);
  // Left out of later Gemini history: pre-filter hits, referrals, and answers
  // that ended in the fallback, so a rejected injection is not replayed.
  const historyExcluded = meta.prefilter !== null || meta.redFlag || meta.validator?.fallback === true || meta.opening === true;
  const common = { scanId, region, expireAt, prefilter: meta.prefilter, redFlag: meta.redFlag, historyExcluded, opening: meta.opening === true };
  const batch = adminDb().batch();
  batch.create(col.doc(), {
    ...common,
    role: "user",
    text: userText,
    createdAt: Timestamp.fromMillis(now),
    packageVersion: null, packageSha256: null, promptVersion: null, modelId: null, validator: null, latencyMs: null,
  });
  batch.create(col.doc(), { ...common, ...meta, role: "echo", text: echoText, createdAt: Timestamp.fromMillis(now + 1) });
  await batch.commit();
}

/**
 * The last HISTORY_TURNS stored turns of this (scan, region) thread, oldest
 * first. Pre-filter, referral and fallback turns are left out, so a red-flag
 * message or a rejected injection never reaches Gemini again. Equality-only query, filtered and sorted in code: no composite index.
 */
// ponytail: reads every turn of the scan; add a region field index and a limit when threads get long.
export async function loadChatHistory(uid: string, scanId: string, region: EchoRegion): Promise<EchoChatMessage[]> {
  const snap = await turns(uid).where("scanId", "==", scanId).get();
  return snap.docs
    .map((d) => d.data())
    .filter((t) => t.region === region && t.historyExcluded === false && (t.role === "user" || t.role === "echo") && typeof t.text === "string")
    .sort((a, b) => (a.createdAt as Timestamp).toMillis() - (b.createdAt as Timestamp).toMillis())
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: t.role as "user" | "echo", text: t.text as string }));
}

/**
 * Red team pass 2 (I02 P2-3): the user turns the split-message check reads.
 * Every stored user turn of this thread except earlier red-flag turns (those
 * were already referred), the last HISTORY_TURNS of them: a turn left out of
 * Gemini's history because its answer fell back still counts, so "i want to"
 * (fallback) then "die" is referred.
 */
export async function loadSplitCheckTurns(uid: string, scanId: string, region: EchoRegion): Promise<EchoChatMessage[]> {
  const snap = await turns(uid).where("scanId", "==", scanId).get();
  return snap.docs
    .map((d) => d.data())
    .filter((t) => t.region === region && t.role === "user" && t.redFlag !== true && t.prefilter == null && t.opening !== true && typeof t.text === "string")
    .sort((a, b) => (a.createdAt as Timestamp).toMillis() - (b.createdAt as Timestamp).toMillis())
    .slice(-HISTORY_TURNS)
    .map((t) => ({ role: "user" as const, text: t.text as string }));
}

export interface StoredOpening {
  /** Gemini's checked text, unguarded (the guard is applied again on every read). */
  reply: string;
  withoutProducts: string;
  products: ShownProduct[];
}

/**
 * TD-34: the opening suggestion already made for this check, if any (the
 * oldest), so a reload costs no Gemini call and no question from the day's limit.
 */
export async function loadOpening(uid: string, scanId: string): Promise<StoredOpening | null> {
  const snap = await turns(uid).where("scanId", "==", scanId).get();
  const found = snap.docs
    .map((d) => d.data())
    .filter((t) => t.opening === true && t.role === "echo" && typeof t.text === "string")
    .sort((a, b) => (a.createdAt as Timestamp).toMillis() - (b.createdAt as Timestamp).toMillis())[0];
  if (!found) return null;
  const products = Array.isArray(found.products)
    ? found.products.flatMap((p: unknown) => {
        const { productId, reason } = (p ?? {}) as Record<string, unknown>;
        return typeof productId === "string" && typeof reason === "string" ? [{ productId, reason }] : [];
      })
    : [];
  return { reply: found.text as string, withoutProducts: typeof found.withoutProducts === "string" ? found.withoutProducts : "", products };
}
