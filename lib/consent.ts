// Image-retention consent — the single source of truth for the version string
// and the policy URL, imported by the consent UI, the presign route, and the
// Firestore write so the three can never disagree (same discipline as
// lib/s3-key.ts's key builder).
//
// DISTINCT FROM the analysis-processing consent that already gates the scan
// (PhotoCapture's first checkbox). That one permits processing this image for
// this analysis; this one permits RETAINING the original in private S3. They
// are never combined into one boolean, in the UI or in the record.

/** Bump when the retention copy below changes. Persisted verbatim per scan. */
export const IMAGE_RETENTION_CONSENT_VERSION = "skin image retention version 1";

/** Exact approved copy for the retention checkbox. */
export const IMAGE_RETENTION_CONSENT_COPY =
  "I consent to Project SKIN securely retaining my skin image and associated skin-analysis data for the purposes of providing, maintaining, and improving my skin analysis experience. I understand that my image will be stored securely and handled according to the Project SKIN Privacy Policy.";

// A constant, not an env var, deliberately. The canonical Project SKIN privacy
// policy is a fixed public URL, and the one existing legal-URL env var
// (NEXT_PUBLIC_TERMS_URL) points at a DIFFERENT document and is unset in
// production today — which is exactly the silently-missing link this consent
// must never have.
export const PRIVACY_POLICY_URL = "https://theprojectskin.com/policies/privacy-policy";
export const PRIVACY_POLICY_LINK_TEXT = "Read our Privacy Policy";

// ─── Privacy lane (H01, H02, H03): docs/lanes/privacy-design.md ─────────────
// Client-safe strings only, like everything above. The server-only ledger
// helpers that record these live in app/api/account/_ledger.ts.

/** One purpose per consent-ledger entry. Purposes are never combined. */
export type ConsentPurpose = "image_retention" | "processing" | "ai_share" | "age_18_plus";

/** Bump when the attestation copy below changes. */
export const AGE_ATTESTATION_VERSION = "age 18 plus attestation version 1";
/** Draft (design §2.2); the owner approves the final copy. */
export const AGE_ATTESTATION_COPY = "I confirm I am 18 or older.";

// Decision 7(b): the GEMINI_BOUNDARY §8 draft, for local use only. "DRAFT" is
// in the version, so a ledger entry recorded against it can never pass for
// the final wording. Production waits for the owner's copy (decision 7a) and
// the Gemini key answer (decision 6).
export const AI_SHARE_CONSENT_VERSION = "ai share DRAFT version 1";
export const AI_SHARE_CONSENT_COPY =
  "DRAFT: Share my skin check with the AI assistant (processed by Google, outside India).";

// R-1 A (routine lane, D-16): the purpose of the user's own routine record.
// Shown on /routine; not a ledger purpose (nothing to grant or revoke).
export const ROUTINE_PURPOSE_COPY =
  "So you can keep a record of your own routine and see it back. Only you see it. It is not used for analytics, not sent to Gemini and not joined to your scans.";

/**
 * How long original photos are kept, in days. Decision 5 is NOT made: no
 * number is invented here. While this is null, no copy states a period and
 * nothing enforces one (an S3 lifecycle rule is an infra OWNER ACTION).
 */
export const IMAGE_RETENTION_PERIOD_DAYS: number | null = null;

/** What the user types to confirm account erasure (H01b); the erase route requires it verbatim. */
export const ERASE_CONFIRMATION = "DELETE MY DATA";

/** How recent the sign-in must be to erase, in seconds. Named setting, PROVISIONAL (design §2.3). */
export const ERASE_MAX_AUTH_AGE_SECONDS = 300;

// H02a: an under-18 answer is blocked in the browser BEFORE sign-in, so there
// is no uid to record it against yet. This tab remembers that it was chosen,
// and the attestation sent after sign-in says "under-18" even if the user went
// back and picked another bucket. sessionStorage, not localStorage: the
// marker must not outlive the tab and land on a different person who signs
// in later on a shared device (a parent after a child). Self-attestation: a
// new tab or cleared storage defeats it; the server record is the strong check.
const UNDER18_CHOSEN_KEY = "skin-check-under18-chosen";

export function markUnder18Chosen(): void {
  try {
    sessionStorage.setItem(UNDER18_CHOSEN_KEY, "1");
  } catch {
    // Storage blocked: the server-side record (when signed in) still applies.
  }
}

/**
 * Cleared once the server holds the under-18 record. The server record is
 * sticky (decision 4), so the device no longer needs to remember, and a later
 * account signed in on this device (a parent after a child) is not marked.
 */
export function clearUnder18Chosen(): void {
  try {
    sessionStorage.removeItem(UNDER18_CHOSEN_KEY);
  } catch {
    // Storage blocked: nothing was stored either.
  }
}

export function under18ChosenOnThisDevice(): boolean {
  try {
    return sessionStorage.getItem(UNDER18_CHOSEN_KEY) === "1";
  } catch {
    return false;
  }
}

/** The age bucket to attest: "under-18" if it was ever chosen on this device. */
export function attestedAgeBucket(answered: unknown): string | null {
  if (under18ChosenOnThisDevice()) return "under-18";
  return typeof answered === "string" && answered ? answered : null;
}

/**
 * Posts the 18+ attestation. Best-effort: callers never wait on it (D-03a).
 * After an under-18 answer is recorded, the device marker is cleared.
 */
export async function postAgeAttestation(idToken: string, ageBucket: string): Promise<boolean> {
  const res = await fetch("/api/account/attestation", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ ageBucket, version: AGE_ATTESTATION_VERSION }),
  });
  if (res.ok && ageBucket === "under-18") clearUnder18Chosen();
  return res.ok;
}
