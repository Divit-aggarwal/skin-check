import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, SKIN_SCAN_ROUTE_LIMITS } from "@/lib/rate-limit";
import { AdminNotConfiguredError, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { isValidScanId, ORIGINAL_CONTENT_TYPE, scanImageKey } from "@/lib/s3-key";
import { IMAGE_RETENTION_CONSENT_COPY, IMAGE_RETENTION_CONSENT_VERSION } from "@/lib/consent";
import { appendConsent, scanAgeGate, withLedgerTimeout } from "@/app/api/account/_ledger";
import { sideImageKey, SIDE_ANGLES, type SideAngle } from "@/lib/feature-contracts/check-photos";
import { MAX_ORIGINAL_BYTES, presignOriginalUpload, S3NotConfiguredError, UPLOAD_URL_TTL_SECONDS } from "@/lib/s3";

// firebase-admin and the AWS SDK both need Node APIs.
export const runtime = "nodejs";

// Hands the browser a short-lived presigned PUT for exactly one
// object: this user's original image for this scan. The uid comes only from
// the verified ID token, and the key is built here — a `uid` in the body is
// ignored, and a scanId that isn't a plain id is rejected, so there is no
// input that can point the URL at another user's prefix.
//
// Same ordering as POST /api/skin-scan: config check → rate limit → token
// shape → verification → body. The daily quota is deliberately NOT consumed
// here; those counters model skin-scan (FastAPI) consumption, and a presign
// is not one of those calls.
const unauthorized = () =>
  NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });

export async function POST(request: NextRequest) {
  const rateLimited = checkRequestRate(request, SKIN_SCAN_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    console.warn("skin-scan/upload: rejected request with no usable Bearer token.");
    return unauthorized();
  }

  // ── Trust boundary ───────────────────────────────────────────────────────
  let uid: string;
  try {
    uid = await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("skin-scan/upload:", err.message);
      return NextResponse.json(
        { error: "Authentication is misconfigured.", code: "AUTH_MISCONFIGURED" },
        { status: 500 }
      );
    }
    console.warn(
      "skin-scan/upload: ID token verification failed:",
      (err as { code?: string })?.code ?? "unknown"
    );
    return unauthorized();
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body.", code: "BAD_REQUEST" }, { status: 400 });
  }

  // scanId, the angle, the size and the consent fields are the ONLY things read from the body.
  // Anything else it carries — a uid, a key, a bucket — is ignored by
  // construction, not by filtering.
  const scanId = (body as { scanId?: unknown } | null)?.scanId;
  if (!isValidScanId(scanId)) {
    return NextResponse.json({ error: "Invalid scan id.", code: "INVALID_SCAN_ID" }, { status: 400 });
  }

  // C10 (TD-54 (2)): which photo of the check this is. Absent means the front,
  // so every existing caller is unchanged. Left and right are stored only,
  // never analysed; their key comes from the same uid and scanId.
  const sent = (body as { angle?: unknown } | null)?.angle;
  const angle = sent === undefined ? "front" : sent;
  if (angle !== "front" && !SIDE_ANGLES.includes(angle as SideAngle)) {
    return NextResponse.json({ error: "Invalid angle.", code: "INVALID_ANGLE" }, { status: 400 });
  }

  // Image-retention consent is a REQUIRED part of the request contract: this
  // route exists only to hand out storage capability, and storage without
  // retention consent is the thing Phase 3 must not do. Analysis needs no
  // consent field here — it never comes through this route.
  //
  // Honest about what this is: the flag is client-asserted, so it stops the
  // application's own flow from uploading without consent, not a client that
  // deliberately lies. firestore.rules also rejects a record claiming
  // image.stored == true unless it also
  // carries this exact consent version. That rule reads the same client-written
  // record, so it stops the app's own flow, not a tampered client (red team
  // I02); the ledger entry written below is the authoritative record.
  const consent = (body as { imageRetentionConsent?: unknown } | null)?.imageRetentionConsent;
  const consentVersion = (body as { imageRetentionConsentVersion?: unknown } | null)?.imageRetentionConsentVersion;
  if (consent !== true || consentVersion !== IMAGE_RETENTION_CONSENT_VERSION) {
    console.warn("skin-scan/upload: refused — no image-retention consent for this scan.");
    return NextResponse.json(
      { error: "Image retention consent is required.", code: "CONSENT_REQUIRED" },
      { status: 403 }
    );
  }

  // The exact size the browser will PUT, signed into the URL (H20): a URL can
  // only write that many bytes, and never more than MAX_ORIGINAL_BYTES.
  const contentLength = (body as { contentLength?: unknown } | null)?.contentLength;
  if (typeof contentLength !== "number" || !Number.isInteger(contentLength) || contentLength < 1) {
    return NextResponse.json({ error: "Invalid image size.", code: "INVALID_CONTENT_LENGTH" }, { status: 400 });
  }
  if (contentLength > MAX_ORIGINAL_BYTES) {
    return NextResponse.json({ error: "Image too large.", code: "IMAGE_TOO_LARGE" }, { status: 413 });
  }

  // H02a (D-19): an under-18 record is refused before anything is recorded or
  // presigned. Everything else goes ahead (decision 3a, D-03).
  const ageRefusal = await scanAgeGate(uid, "skin-scan/upload");
  if (ageRefusal) return ageRefusal;

  // D-16: the server's own record of this consent, written before the URL is
  // handed out, so an abandoned flow still leaves one (audit D11). Best-effort:
  // one retry, then the URL is issued anyway. The client uploads before it
  // scans and aborts the scan when the upload fails, so refusing here would
  // break the live scan (D-03). The client-written skinChecks.consent block
  // stays as the fallback record.
  await recordRetentionConsent(uid, scanId);

  const key = angle === "front" ? scanImageKey(uid, scanId) : sideImageKey(uid, scanId, angle as SideAngle);

  let uploadUrl: string;
  try {
    uploadUrl = await presignOriginalUpload(key, contentLength);
  } catch (err) {
    if (err instanceof S3NotConfiguredError) {
      console.error("skin-scan/upload:", err.message);
    } else {
      // Name + message only. An SDK error object can carry request metadata,
      // and nothing about a failed presign is worth risking in a log line.
      console.error(
        "skin-scan/upload: presign failed:",
        (err as Error)?.name ?? "unknown",
        (err as Error)?.message ?? ""
      );
    }
    return NextResponse.json(
      { error: "Image storage is unavailable right now.", code: "UPLOAD_MISCONFIGURED" },
      { status: 500 }
    );
  }

  // No credentials, no bucket name, no region — just what the PUT needs. The
  // URL itself is never logged: it is a bearer capability for 5 minutes.
  return NextResponse.json({
    uploadUrl,
    key,
    expiresIn: UPLOAD_URL_TTL_SECONDS,
    contentType: ORIGINAL_CONTENT_TYPE,
  });
}

async function recordRetentionConsent(uid: string, scanId: string): Promise<void> {
  const event = {
    purpose: "image_retention" as const,
    granted: true,
    version: IMAGE_RETENTION_CONSENT_VERSION,
    copy: IMAGE_RETENTION_CONSENT_COPY,
    scanId,
    source: "presign" as const,
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await withLedgerTimeout(appendConsent(uid, event));
      return;
    } catch (err) {
      // No uid in the log line: the failure is what matters, not whose.
      if (attempt === 2) {
        // Name and code only: Firestore messages embed the doc path (the uid).
        console.error("skin-scan/upload: consent ledger write failed; URL issued anyway:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
      }
    }
  }
}
