import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { AGE_ATTESTATION_VERSION, type ConsentPurpose } from "@/lib/consent";

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
 * Sticky (decision 4): ANY under-18 entry blocks the account, at any version,
 * even after a later 18+ answer. Self-attestation: it stops a blocked minor
 * from getting around the block, not one who lies the first time.
 * H25 (owner TD-20, option a): an 18+ answer counts only at the current
 * AGE_ATTESTATION_VERSION, so users are asked again when the copy changes.
 */
export async function ageStatus(uid: string): Promise<AgeStatus> {
  // Two fixed-size reads (equality filters only, no composite index), so a
  // ledger flooded with 18+ entries can't slow this past the timeout and make
  // upload and scan fail open.
  const age = ledger(uid).where("purpose", "==", "age_18_plus");
  const [under, over] = await Promise.all([
    age.where("granted", "==", false).limit(1).get(),
    age.where("granted", "==", true).where("version", "==", AGE_ATTESTATION_VERSION).limit(1).get(),
  ]);
  if (!under.empty) return "under18";
  return over.empty ? "missing" : "over18";
}

/**
 * Decision 3(a): with no 18+ record, upload and scan still run (D-03a, old
 * bundles and existing users have none yet) and the server logs it. Flip to
 * true once old bundles are gone; R8 (capture lane) must land first.
 */
export const REQUIRE_AGE_ATTESTATION = false;

/**
 * The 18+ check for the upload and scan routes. Null means go ahead.
 * - under-18 record: 403 UNDER_18 (the D-03a exception the owner approved).
 * - no record: logged, or 403 ATTESTATION_REQUIRED once the constant flips.
 * - the read fails or hangs: go ahead (D-03: never break the live scan).
 */
export async function scanAgeGate(uid: string, route: string, requireAttestation = REQUIRE_AGE_ATTESTATION): Promise<NextResponse | null> {
  let age: AgeStatus;
  try {
    age = await withLedgerTimeout(ageStatus(uid));
  } catch (err) {
    console.warn(`${route}: age attestation unreadable; going ahead (D-03):`, (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
    return null;
  }
  if (age === "under18") {
    return NextResponse.json({ error: "This service is only for people aged 18 or over.", code: "UNDER_18" }, { status: 403 });
  }
  if (age === "missing") {
    if (requireAttestation) {
      return NextResponse.json({ error: "Please confirm your age first.", code: "ATTESTATION_REQUIRED" }, { status: 403 });
    }
    // No uid: the count of unattested requests is what matters.
    console.warn(`${route}: no age attestation on file; going ahead (decision 3a).`);
  }
  return null;
}
