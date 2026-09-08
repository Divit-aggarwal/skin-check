import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ORIGINAL_CONTENT_TYPE } from "@/lib/s3-key";

// SERVER ONLY — same tripwire as lib/firebase/admin.ts. AWS credentials come
// from the standard provider chain (instance/execution role in production, or
// AWS_ACCESS_KEY_ID/SECRET locally); nothing here is ever NEXT_PUBLIC_.
if (typeof window !== "undefined") {
  throw new Error("lib/s3.ts is server-only and must never be bundled for the browser.");
}

// Deliberately app-specific names rather than the SDK's own AWS_* ones. The
// deploy target is Vercel, whose function runtime can inject its OWN
// AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_SESSION_TOKEN (they grant
// nothing, but the SDK's env provider reads all three together) — setting only
// two of the three would sign requests with our key and Vercel's stale session
// token, which fails as InvalidToken. Reading our own names sidesteps that
// entirely. AWS_REGION is still honoured as a fallback because on a Lambda-like
// runtime it is always present and correct.
//
// No AWS_REGION fallback, deliberately: Vercel injects its own AWS_REGION (the
// function's region), so a forgotten S3_SKIN_IMAGES_REGION would NOT fail
// closed — it would sign for the wrong region and surface as a PUT-time
// PermanentRedirect in production. Missing config must throw instead.
const REGION = process.env.S3_SKIN_IMAGES_REGION;
const BUCKET = process.env.S3_SKIN_IMAGES_BUCKET;
const ACCESS_KEY_ID = process.env.S3_SKIN_IMAGES_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.S3_SKIN_IMAGES_SECRET_ACCESS_KEY;

export const UPLOAD_URL_TTL_SECONDS = 300;

export class S3NotConfiguredError extends Error {
  constructor(missing: string[]) {
    // Names only, never values.
    super(`S3 image storage is not configured. Missing: ${missing.join(", ")}`);
    this.name = "S3NotConfiguredError";
  }
}

let client: S3Client | null = null;

function s3(): S3Client {
  const missing: string[] = [];
  if (!REGION) missing.push("S3_SKIN_IMAGES_REGION");
  if (!BUCKET) missing.push("S3_SKIN_IMAGES_BUCKET");
  if (missing.length > 0) throw new S3NotConfiguredError(missing);

  // Lazy + cached for the same reason the admin app is: constructing at
  // module scope turns an unset env var into a build failure instead of a
  // runtime 500, and serverless instance reuse keeps the client warm across
  // requests.
  //
  // Explicit credentials when our own pair is configured (Vercel today);
  // otherwise the standard provider chain — a local ~/.aws profile, or an
  // execution role / Vercel-AWS OIDC if this ever moves to one.
  client ??= new S3Client({
    region: REGION!,
    ...(ACCESS_KEY_ID && SECRET_ACCESS_KEY
      ? { credentials: { accessKeyId: ACCESS_KEY_ID, secretAccessKey: SECRET_ACCESS_KEY } }
      : {}),
  });
  return client;
}

/**
 * Short-lived presigned PUT for one scan's original image.
 *
 * The caller passes the FULL key it built from a verified uid — this function
 * never takes a uid or a client-supplied path. ContentType is signed, so the
 * browser must send exactly the same header or S3 rejects the signature.
 */
export function presignOriginalUpload(key: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BUCKET!, Key: key, ContentType: ORIGINAL_CONTENT_TYPE }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS }
  );
}
