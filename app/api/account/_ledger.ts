import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import type { ConsentPurpose } from "@/lib/consent";

// SERVER ONLY (imports lib/firebase/admin.ts). The consent ledger (D-16):
// users/{uid}/consentLedger/{auto-id}, append-only, written only here.
// Clients may read their own entries and never write them (firestore.rules,
// lane:privacy section). Lives under app/api/account/ because lib/consent.ts
// is imported by client code and must not pull in the Admin SDK. The `_`
// prefix keeps Next.js from routing it.

export type LedgerSource = "presign" | "scan" | "attestation_route" | "consent_route";

export interface ConsentEvent {
  purpose: ConsentPurpose;
  granted: boolean;
  version: string;
  /** The exact copy shown; only its SHA-256 is stored. */
  copy: string;
  scanId: string | null;
  source: LedgerSource;
}

export type AgeStatus = "under18" | "over18" | "missing";

/**
 * Ceiling on one ledger read or write from a route that must never be held
 * up by it (D-03: persistence never breaks the live scan). A timeout is
 * treated exactly like a failed read or write.
 */
export const LEDGER_TIMEOUT_MS = 2_000;

export function withLedgerTimeout<T>(promise: Promise<T>, ms = LEDGER_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error("consent ledger timed out")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

const ledger = (uid: string) => adminDb().collection("users").doc(uid).collection("consentLedger");

export const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

/** `uid` must be a server-VERIFIED uid. `.create()` only: an entry is never changed. */
export async function appendConsent(uid: string, event: ConsentEvent): Promise<void> {
  await ledger(uid).doc().create({
    schemaVersion: 1,
    purpose: event.purpose,
    granted: event.granted,
    version: event.version,
    copySha256: sha256(event.copy),
    scanId: event.scanId,
    source: event.source,
    recordedAt: FieldValue.serverTimestamp(),
  });
}

const millis = (value: unknown): number =>
  typeof (value as { toMillis?: unknown })?.toMillis === "function" ? (value as { toMillis(): number }).toMillis() : 0;

// Equality-only query, sorted in code, so no composite index is needed.
async function entries(uid: string, purpose: ConsentPurpose) {
  const snap = await ledger(uid).where("purpose", "==", purpose).get();
  return snap.docs.map((d) => d.data()).sort((a, b) => millis(b.recordedAt) - millis(a.recordedAt));
}

/** The newest entry's answer for a purpose at `version`, or null when there is none. */
export async function latestGrant(uid: string, purpose: ConsentPurpose, version: string): Promise<boolean | null> {
  const newest = (await entries(uid, purpose)).find((e) => e.version === version);
  return newest ? newest.granted === true : null;
}

/**
 * Sticky (decision 4): ANY under-18 entry blocks the account, even after a
 * later 18+ answer. Self-attestation: it stops a blocked minor from getting
 * around the block, not one who lies the first time.
 */
export async function ageStatus(uid: string): Promise<AgeStatus> {
  const all = await entries(uid, "age_18_plus");
  if (all.length === 0) return "missing";
  return all.some((e) => e.granted !== true) ? "under18" : "over18";
}
