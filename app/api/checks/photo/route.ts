import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { adminDb, AdminNotConfiguredError, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { isPlainUid, isValidScanId, scanImageKey } from "@/lib/s3-key";
import { originalExists, presignOriginalRead, READ_URL_TTL_SECONDS, S3NotConfiguredError } from "@/lib/s3";

// firebase-admin and the AWS SDK both need Node APIs.
export const runtime = "nodejs";
// Every answer depends on who asks: never prerendered, never cached by Next.
export const dynamic = "force-dynamic";

// G03 / TD-25 (2), owner-approved exception: a signed-in user sees their OWN
// kept photo, as a small image on the Checks list and the opened check.
//
//   GET /api/checks/photo?scanId=<id>   Authorization: Bearer <Firebase ID token>
//   200 { url, expiresIn }   a presigned GET for 60 seconds
//   404 { code: "NO_PHOTO" } nothing kept (or not this user's, or erased): the screen shows nothing
//
// The trust rules, in order:
// - The uid comes only from the verified ID token, checked against revocation
//   (verifyFirebaseIdToken passes checkRevoked: true), so an old login after a
//   sign-out-everywhere, or any token of a deleted account, is refused.
// - The S3 key is built here from that uid and a scanId that matches the plain
//   id shape: no input can point it at another user's prefix.
// - An account being erased (erasedAccounts/{uid}) gets nothing.
// - The user's own check record must say the photo was kept, AND the object
//   must exist. A guessed scanId of someone else's check fails both, because
//   both are looked up under the caller's own uid.
// - Every "no" is the same 404, so the answer never tells whether a scanId
//   exists for anyone else.
// - Nothing is cacheable: this answer and the S3 response are private, no-store.

const LIMITS: PublicRouteLimits = { scope: "checks-photo", perMinute: 60, perDay: 2000 };
const NO_STORE = { "Cache-Control": "private, no-store, max-age=0", Vary: "Authorization" };

const answer = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: NO_STORE });
const noPhoto = () => answer(404, { code: "NO_PHOTO" });

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
      console.error("checks/photo:", err.message);
      return answer(500, { error: "Authentication is misconfigured.", code: "AUTH_MISCONFIGURED" });
    }
    return answer(401, { error: "Authentication required.", code: "AUTH_REQUIRED" });
  }

  const scanId = request.nextUrl.searchParams.get("scanId");
  if (!isValidScanId(scanId) || !isPlainUid(uid)) return noPhoto();

  try {
    const user = adminDb().collection("users").doc(uid);
    const [erased, check] = await Promise.all([adminDb().collection("erasedAccounts").doc(uid).get(), user.collection("skinChecks").doc(scanId).get()]);
    if (erased.exists) return noPhoto();
    const image = check.exists ? (check.get("image") as { stored?: unknown } | null | undefined) : null;
    if (!image || image.stored !== true) return noPhoto();

    const key = scanImageKey(uid, scanId);
    if (!(await originalExists(key))) return noPhoto();
    const url = await presignOriginalRead(key);
    // The URL is never logged: it is a bearer capability until it expires.
    return answer(200, { url, expiresIn: READ_URL_TTL_SECONDS });
  } catch (err) {
    if (err instanceof S3NotConfiguredError) console.error("checks/photo:", err.message);
    // Name only: SDK and Firestore messages can carry the key or the doc path (the uid).
    else console.error("checks/photo: failed:", (err as Error)?.name ?? "unknown");
    return answer(500, { error: "The photo is unavailable right now.", code: "PHOTO_UNAVAILABLE" });
  }
}
