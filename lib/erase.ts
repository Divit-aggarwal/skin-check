import { Timestamp } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { eraseUserPrefix, UPLOAD_URL_TTL_SECONDS } from "@/lib/s3";

// SERVER ONLY. H04 + H21 (TD-19): after an account is erased, nothing written
// late may stay behind. Three ways data can still arrive after the erase:
// - a client Firestore write with an ID token issued before the erase (Firestore
//   rules do not check revocation; a token lives up to an hour);
// - a server request that passed verification before the revoke step and
//   writes when it finishes;
// - a PUT with an upload link issued before the erase (valid 300 s).
// So the erase first writes erasedAccounts/{uid} (rules refuse every client
// write for that uid while it exists), and a second sweep, run by a cron
// after every such token, request and link has expired, deletes whatever
// landed and finishes any step the erase did not, then removes the marker.
// The marker holds the uid and two times, nothing else, and lives only until
// that sweep.

/** Firebase ID tokens expire one hour after they are issued. */
export const ID_TOKEN_LIFETIME_SECONDS = 3600;
/** The platform's default function limit; no route under app/api exports a longer maxDuration (tested). */
export const MAX_REQUEST_SECONDS = 300;
/** Every late write has landed by then: an old token's last write, a request still running, an upload link still valid. */
export const ERASE_SWEEP_DELAY_SECONDS = ID_TOKEN_LIFETIME_SECONDS + MAX_REQUEST_SECONDS + UPLOAD_URL_TTL_SECONDS;

/** Local stack only (scripts/local-stack.sh): a short delay so the end-to-end test need not wait 70 minutes. Ignored in production builds. */
export function sweepDelaySeconds(): number {
  const local = Number(process.env.ERASE_SWEEP_DELAY_SECONDS);
  return process.env.NODE_ENV !== "production" && Number.isFinite(local) && local >= 0 ? local : ERASE_SWEEP_DELAY_SECONDS;
}

const markers = () => adminDb().collection("erasedAccounts");

/**
 * The first erase step. A rerun never moves an existing sweep time earlier,
 * so a second erase cannot shorten the wait.
 */
export async function markErased(uid: string, now = Date.now()): Promise<void> {
  const ref = markers().doc(uid);
  const sweepAfter = Timestamp.fromMillis(now + sweepDelaySeconds() * 1000);
  await adminDb().runTransaction(async (tx) => {
    const existing = (await tx.get(ref)).get("sweepAfter") as Timestamp | undefined;
    if (existing && existing.toMillis() >= sweepAfter.toMillis()) return;
    tx.set(ref, { sweepAfter, markedAt: Timestamp.fromMillis(now) });
  });
}

/** S3, then the Firestore tree, then the Auth user (already gone counts as done). Shared by the erase and the sweep. */
export const eraseSteps = (uid: string) => ({
  s3: () => eraseUserPrefix(uid),
  // The user's tree, then the H24 under-18 marker (TD-10: the under-18 record goes with the account).
  firestore: async () => {
    await adminDb().recursiveDelete(adminDb().collection("users").doc(uid));
    await adminDb().collection("under18Accounts").doc(uid).delete();
  },
  auth: () =>
    adminAuth()
      .deleteUser(uid)
      .catch((err: { code?: string }) => {
        if (err?.code !== "auth/user-not-found") throw err;
      }),
});

/**
 * Every account whose sweep time has passed: erase again, and remove the
 * marker only when all three steps succeed. A failed uid keeps its marker, so
 * the next run retries it. Returns the counts only (no uid leaves this function).
 */
export async function sweepErasedAccounts(now = Date.now()): Promise<{ swept: number; failed: number }> {
  const due = await markers().where("sweepAfter", "<=", Timestamp.fromMillis(now)).get();
  let swept = 0;
  let failed = 0;
  for (const doc of due.docs) {
    const steps = eraseSteps(doc.id);
    try {
      await steps.s3();
      await steps.firestore();
      await steps.auth();
      await doc.ref.delete();
      swept += 1;
    } catch (err) {
      // Name and code only: messages carry the uid.
      console.error("erase sweep: one account failed:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
      failed += 1;
    }
  }
  return { swept, failed };
}
