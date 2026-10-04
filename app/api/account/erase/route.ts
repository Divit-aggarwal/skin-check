import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { checkRequestRate, SKIN_SCAN_ROUTE_LIMITS } from "@/lib/rate-limit";
import {
  AdminNotConfiguredError,
  adminAuth,
  adminDb,
  bearerToken,
  verifyFirebaseIdTokenClaims,
} from "@/lib/firebase/admin";
import { assertEraseConfigured } from "@/lib/s3";
import { eraseSteps, markErased } from "@/lib/erase";
import { isPlainUid } from "@/lib/s3-key";
import { ERASE_CONFIRMATION, ERASE_MAX_AUTH_AGE_SECONDS } from "@/lib/consent";

// firebase-admin and the AWS SDK both need Node APIs.
export const runtime = "nodejs";

// H01b user erasure (D-17): mark the account erased (H04/H21, TD-19: rules
// then refuse every client write for it, and a sweep after every old token
// and upload link has expired removes whatever lands late; lib/erase.ts),
// revoke sessions, then S3 users/<uid>/, then the Firestore users/<uid> tree,
// then the Auth user. Any failure stops the later
// steps and names the failed step. Before the Auth step the uid still exists,
// so the user can sign in again and rerun the route to finish the job.
// D-17: "Immutability is a promise to clients, not a retention promise."


// Strict: a `uid` in the body is a 400, never an identity source.
const BodySchema = z.object({ confirm: z.literal(ERASE_CONFIRMATION) }).strict();

const STEPS = ["mark", "revoke", "s3", "firestore", "auth"] as const;
type Step = (typeof STEPS)[number];

const unauthorized = () =>
  NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });

export async function POST(request: NextRequest) {
  const rateLimited = checkRequestRate(request, SKIN_SCAN_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized();

  // ── Trust boundary ───────────────────────────────────────────────────────
  let uid: string;
  let authTime: number;
  try {
    const decoded = await verifyFirebaseIdTokenClaims(token);
    uid = decoded.uid;
    authTime = decoded.auth_time;
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("account/erase:", err.message);
      return NextResponse.json({ error: "Authentication is misconfigured.", code: "AUTH_MISCONFIGURED" }, { status: 500 });
    }
    console.warn("account/erase: ID token verification failed:", (err as { code?: string })?.code ?? "unknown");
    return unauthorized();
  }

  // A stolen but old session must not be able to erase: require a fresh sign-in.
  if (!(Date.now() / 1000 - authTime <= ERASE_MAX_AUTH_AGE_SECONDS)) {
    return NextResponse.json(
      { error: "Please sign in again to delete your account.", code: "REAUTH_REQUIRED" },
      { status: 403 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request.", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (!BodySchema.safeParse(body).success) {
    return NextResponse.json({ error: "Invalid request.", code: "BAD_REQUEST" }, { status: 400 });
  }

  // Preflight, before anything changes (not even the revoke):
  // - a uid that isn't one plain path segment could address another user's tree;
  // - the Admin SDK follows FIRESTORE_EMULATOR_HOST whatever NODE_ENV says, so
  //   in production the recursive delete could "succeed" against an emulator
  //   and leave the real tree orphaned once the Auth user is gone;
  // - without the erase credentials the S3 step can only fail, and revoking
  //   first would just sign the user out for nothing (decision 11 pending).
  if (!isPlainUid(uid) || (process.env.NODE_ENV === "production" && process.env.FIRESTORE_EMULATOR_HOST)) {
    console.error("account/erase: refused by preflight (uid shape or emulator host).");
    return NextResponse.json(
      { ok: false, error: "Account deletion is unavailable right now.", code: "ERASE_UNAVAILABLE", failedStep: "preflight", completedSteps: [] },
      { status: 500 }
    );
  }
  try {
    assertEraseConfigured();
  } catch (err) {
    console.error("account/erase: erase storage not configured:", (err as Error)?.message ?? "unknown");
    return NextResponse.json(
      { ok: false, error: "Account deletion is unavailable right now.", code: "ERASE_UNAVAILABLE", failedStep: "s3", completedSteps: [] },
      { status: 500 }
    );
  }

  let s3ObjectsDeleted = 0;
  const erase = eraseSteps(uid);
  const run: Record<Step, () => Promise<unknown>> = {
    // First, before anything is deleted: from here no client write lands, and the sweep is due.
    mark: () => markErased(uid),
    // Not a deletion step: it stops new uploads, scans and chats while the erase runs.
    revoke: () => adminAuth().revokeRefreshTokens(uid),
    s3: async () => {
      s3ObjectsDeleted = await erase.s3();
    },
    firestore: erase.firestore,
    // Already gone counts as done, so a rerun after a lost response finishes cleanly.
    auth: erase.auth,
  };

  const completedSteps: Step[] = [];
  for (const step of STEPS) {
    try {
      await run[step]();
      completedSteps.push(step);
    } catch (err) {
      // Name and code only: Firestore and Admin messages embed doc paths,
      // i.e. the uid of the person asking to be forgotten.
      console.error(`account/erase: step ${step} failed:`, (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
      return NextResponse.json(
        { ok: false, error: "Your account could not be fully deleted.", code: "ERASE_FAILED", failedStep: step, completedSteps },
        { status: 500 }
      );
    }
  }

  // Decision 9(b): a receipt that only counts erasures. No uid, no uid hash,
  // nothing that links it to the person. A failed write is logged and the
  // response is still ok: the data is gone and the Auth user no longer exists.
  try {
    await adminDb().collection("erasures").add({
      schemaVersion: 1,
      erasedAt: FieldValue.serverTimestamp(),
      steps: Object.fromEntries(STEPS.map((s) => [s, "done"])),
      s3ObjectsDeleted,
    });
  } catch (err) {
    console.error("account/erase: receipt write failed:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
  }

  return NextResponse.json({ ok: true, steps: Object.fromEntries(STEPS.map((s) => [s, "done"])) });
}
