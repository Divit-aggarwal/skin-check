// NOTE: `@/lib/s3` (one character away) DOES import the AWS SDK and is
// server-only. Importing that from anything a client component reaches
// throws at runtime, not at build — reach for THIS module from client code.
//
// Pure, dependency-free, and deliberately SDK-free: this is imported by the
// presign route (server) AND by lib/firebase/skin-checks.ts (client), so one
// AWS import here would drag the SDK into the browser bundle. Keep it that way.

// Accepts both shapes newScanId() produces (lib/skin-check-draft.ts): a
// crypto.randomUUID(), and the `scan-<base36>-<base36>` fallback used on
// plain-HTTP local testing. `.` and `/` are outside the class, so every
// traversal attempt ("../other-user", "users/foo", "a/../b"), the empty
// string, and an over-long value all fail here rather than reaching S3.
const SCAN_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function isValidScanId(value: unknown): value is string {
  return typeof value === "string" && SCAN_ID.test(value);
}

/**
 * The one and only place an original-image key is constructed.
 *
 * `uid` must be a server-VERIFIED Firebase uid (presign route) or the uid
 * Firebase itself attached to the client session (Firestore write) — never a
 * value read out of a request body. Deterministic for a given uid + scanId,
 * so a retry overwrites the same object instead of minting original-2.jpg.
 */
export function scanImageKey(uid: string, scanId: string): string {
  return `users/${uid}/scans/${scanId}/original.jpg`;
}

export const ORIGINAL_CONTENT_TYPE = "image/jpeg";

/**
 * Largest original the presigned PUT accepts (H20; TD-18 (3): stays 25 MB).
 * PROVISIONAL. Shared so the browser can say so before asking for a URL.
 */
export const MAX_ORIGINAL_BYTES = 25 * 1024 * 1024;

/**
 * Everything one user has in the bucket (H01b erasure). The trailing slash is
 * load-bearing: without it, erasing "abc" would also match "abcd/…".
 */
export function userPrefix(uid: string): string {
  // A uid with "/" or ".." would point the prefix into another user's tree.
  // Phone-auth uids are alphanumeric; anything else is refused outright.
  if (!isPlainUid(uid)) throw new Error("Refusing to build a user prefix from an unexpected uid shape.");
  return `users/${uid}/`;
}

const PLAIN_UID = /^[A-Za-z0-9_-]{1,128}$/;

/** True for a uid that is safe as one path segment (no "/", no "."). */
export function isPlainUid(uid: unknown): uid is string {
  return typeof uid === "string" && PLAIN_UID.test(uid);
}
