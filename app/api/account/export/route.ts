import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { adminDb, AdminNotConfiguredError, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { quotaDay } from "@/lib/echo-quota";
import { isPlainUid } from "@/lib/s3-key";
import { S3NotConfiguredError } from "@/lib/s3";
import { EXPORT_MAX_BYTES } from "@/lib/feature-contracts/data-export";
import { buildExport, consumeExport, serializeWithinLimit } from "../_export";

// firebase-admin and the AWS SDK both need Node APIs.
export const runtime = "nodejs";
// Every answer depends on who asks: never prerendered, never cached by Next.
export const dynamic = "force-dynamic";

// H37: a signed-in user downloads everything we hold under their account
// (contract: lib/feature-contracts/data-export.ts).
//
//   GET /api/account/export   Authorization: Bearer <Firebase ID token>
//   200 the DataExport JSON as an attachment, project-skin-data-YYYY-MM-DD.json
//   401 AUTH_REQUIRED · 403 NOT_ALLOWED (erased) · 429 TOO_MANY · 500 EXPORT_FAILED
//
// The trust rules, as on /api/checks/photo: the uid comes only from the
// verified, non-revoked token; every Firestore path and S3 key is built from
// it (app/api/account/_export.ts); an account being erased gets nothing.
// Bearer only, so the "Download my data" control fetches and saves a blob
// (a plain link cannot send the token).

// Per-IP burst here; the real limit is 3 a day per uid (consumeExport).
// perDay is required by the type but not enforced by checkRequestRate.
const LIMITS: PublicRouteLimits = { scope: "account-export", perMinute: 10, perDay: 0 };
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };

const answer = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: NO_STORE });

export async function GET(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return answer(401, { error: "Authentication required.", code: "AUTH_REQUIRED" });

  let uid: string;
  try {
    uid = await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("account/export:", err.message);
      return answer(500, { error: "Authentication is misconfigured.", code: "EXPORT_FAILED" });
    }
    return answer(401, { error: "Authentication required.", code: "AUTH_REQUIRED" });
  }
  // A uid that is not one plain path segment never becomes a path or a key.
  if (!isPlainUid(uid)) return answer(403, { error: "Not allowed.", code: "NOT_ALLOWED" });

  try {
    if ((await adminDb().collection("erasedAccounts").doc(uid).get()).exists) {
      return answer(403, { error: "This account is being deleted.", code: "NOT_ALLOWED" });
    }
    const refused = await consumeExport(uid);
    if (refused) return refused;

    const now = new Date();
    const body = serializeWithinLimit(await buildExport(uid, now), EXPORT_MAX_BYTES);
    // The body is never logged: it holds the user's data and signed links.
    return new NextResponse(body, {
      status: 200,
      headers: {
        ...NO_STORE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="project-skin-data-${quotaDay(now)}.json"`,
      },
    });
  } catch (err) {
    if (err instanceof S3NotConfiguredError) console.error("account/export:", err.message);
    // Name only: SDK and Firestore messages can carry a key or a doc path (the uid).
    else console.error("account/export: failed:", (err as Error)?.name ?? "unknown");
    return answer(500, { error: "Your data could not be prepared right now. Please try again.", code: "EXPORT_FAILED" });
  }
}
