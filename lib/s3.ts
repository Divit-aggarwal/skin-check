import { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ORIGINAL_CONTENT_TYPE, userPrefix } from "@/lib/s3-key";

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
// Local stack only (S3Mock, npm run dev:local). Ignored in production, so a
// stray variable can never send users' photos to another host.
const ENDPOINT = process.env.NODE_ENV === "production" ? "" : process.env.S3_SKIN_IMAGES_ENDPOINT ?? "";
const ENDPOINT_CONFIG = ENDPOINT ? { endpoint: ENDPOINT, forcePathStyle: true } : {};

export const UPLOAD_URL_TTL_SECONDS = 300;

export { MAX_ORIGINAL_BYTES } from "@/lib/s3-key";

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
    ...ENDPOINT_CONFIG,
    // Red team (I02): by default the SDK puts the CRC32 of an EMPTY body in a
    // presigned PUT, and real S3 then rejects the photo (BadDigest). The
    // browser cannot compute it in advance, so no checksum is added unless an
    // operation requires one.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
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
 * never takes a uid or a client-supplied path. Content-Type and
 * Content-Length are both signed (the presigner signs only Content-Length by
 * default, so Content-Type is named), so the browser must send exactly that
 * type and exactly `contentLength` bytes or S3 rejects the signature (H20).
 */
export function presignOriginalUpload(key: string, contentLength: number): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BUCKET!, Key: key, ContentType: ORIGINAL_CONTENT_TYPE, ContentLength: contentLength }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS, signableHeaders: new Set(["content-type", "content-length"]) }
  );
}

// ─── H01b erasure (D-17) ────────────────────────────────────────────────────
// A SEPARATE credential pair (decision 11a): the upload key can only PUT, so a
// leaked upload key can never delete anyone's photos. Production needs the
// owner's erase IAM principal (ListBucket on users/*, DeleteObject on
// users/*); locally these point at S3Mock. No fallback to the upload pair or
// the provider chain: unset means fail closed, before anything is listed.
const ERASE_ACCESS_KEY_ID = process.env.S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID;
const ERASE_SECRET_ACCESS_KEY = process.env.S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY;

let eraseClient: S3Client | null = null;

function s3Erase(): S3Client {
  const missing: string[] = [];
  if (!REGION) missing.push("S3_SKIN_IMAGES_REGION");
  if (!BUCKET) missing.push("S3_SKIN_IMAGES_BUCKET");
  if (!ERASE_ACCESS_KEY_ID) missing.push("S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID");
  if (!ERASE_SECRET_ACCESS_KEY) missing.push("S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY");
  if (missing.length > 0) throw new S3NotConfiguredError(missing);
  eraseClient ??= new S3Client({
    region: REGION!,
    ...ENDPOINT_CONFIG,
    credentials: { accessKeyId: ERASE_ACCESS_KEY_ID!, secretAccessKey: ERASE_SECRET_ACCESS_KEY! },
  });
  return eraseClient;
}

/** Throws S3NotConfiguredError when the erase pair is missing. Lets a caller check before it changes anything. */
export function assertEraseConfigured(): void {
  s3Erase();
}

/**
 * Deletes every object under users/<uid>/ and returns how many were deleted.
 * `uid` must be server-VERIFIED. Lists and deletes in pages until the prefix
 * is empty; any per-object delete error throws, so the caller stops before
 * the Firestore and Auth steps. No versioning or Object Lock today
 * (H01_S3_ERASURE_READINESS), so a delete is final.
 */
export async function eraseUserPrefix(uid: string): Promise<number> {
  const client = s3Erase();
  const Prefix = userPrefix(uid);
  let deleted = 0;
  for (;;) {
    const listed = await client.send(new ListObjectsV2Command({ Bucket: BUCKET!, Prefix, MaxKeys: 1000 }));
    const keys = (listed.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
    if (keys.length === 0) return deleted;
    const result = await client.send(
      new DeleteObjectsCommand({ Bucket: BUCKET!, Delete: { Objects: keys, Quiet: true } })
    );
    if (result.Errors?.length) {
      // Codes only: a key carries the uid.
      throw new Error(`S3 erase failed for ${result.Errors.length} object(s): ${result.Errors.map((e) => e.Code).join(", ")}`);
    }
    deleted += keys.length;
  }
}

// ─── G03 / TD-25 (2): the owner's own kept photo, read back ──────────────────
// A THIRD credential pair, read-only (s3:GetObject on
// users/*/scans/*/original.jpg): the upload pair can only PUT and the erase
// pair can only list and delete, so neither is widened. Production needs the
// owner's read IAM principal; locally these point at S3Mock. No fallback to
// another pair or the provider chain: unset means fail closed.
const READ_ACCESS_KEY_ID = process.env.S3_SKIN_IMAGES_READ_ACCESS_KEY_ID;
const READ_SECRET_ACCESS_KEY = process.env.S3_SKIN_IMAGES_READ_SECRET_ACCESS_KEY;

/** How long a photo link works. Short: the link is a bearer capability. */
export const READ_URL_TTL_SECONDS = 60;

let readClient: S3Client | null = null;

function s3Read(): S3Client {
  const missing: string[] = [];
  if (!REGION) missing.push("S3_SKIN_IMAGES_REGION");
  if (!BUCKET) missing.push("S3_SKIN_IMAGES_BUCKET");
  if (!READ_ACCESS_KEY_ID) missing.push("S3_SKIN_IMAGES_READ_ACCESS_KEY_ID");
  if (!READ_SECRET_ACCESS_KEY) missing.push("S3_SKIN_IMAGES_READ_SECRET_ACCESS_KEY");
  if (missing.length > 0) throw new S3NotConfiguredError(missing);
  readClient ??= new S3Client({
    region: REGION!,
    ...ENDPOINT_CONFIG,
    credentials: { accessKeyId: READ_ACCESS_KEY_ID!, secretAccessKey: READ_SECRET_ACCESS_KEY! },
  });
  return readClient;
}

/**
 * True when the object exists. `key` must come from scanImageKey() with a
 * server-VERIFIED uid. A missing object (never kept, or erased) is false; any
 * other error throws.
 *
 * The read principal has s3:GetObject only, never s3:ListBucket (one key
 * serves every user, and listing would expose every user's scan keys). Without
 * ListBucket, S3 answers a HEAD on a missing key with 403, so 403 also means
 * "not there" (security review G03, M1). The cost: a read policy that lacks
 * GetObject entirely also reads as "no photo" rather than an error.
 */
export async function originalExists(key: string): Promise<boolean> {
  try {
    await s3Read().send(new HeadObjectCommand({ Bucket: BUCKET!, Key: key }));
    return true;
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
    const name = (err as Error)?.name;
    if (status === 404 || status === 403 || name === "NotFound" || name === "NoSuchKey" || name === "Forbidden") return false;
    throw err;
  }
}

/**
 * Short-lived presigned GET for one original. The response S3 sends is marked
 * private and not storable, so no shared cache keeps the photo.
 */
export function presignOriginalRead(key: string): Promise<string> {
  return getSignedUrl(
    s3Read(),
    new GetObjectCommand({
      Bucket: BUCKET!,
      Key: key,
      ResponseCacheControl: "private, no-store, max-age=0",
      ResponseContentType: ORIGINAL_CONTENT_TYPE,
      ResponseContentDisposition: "inline",
    }),
    { expiresIn: READ_URL_TTL_SECONDS }
  );
}
