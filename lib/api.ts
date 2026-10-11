import { z } from "zod";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { IMAGE_RETENTION_CONSENT_VERSION } from "@/lib/consent";
import { MAX_ORIGINAL_BYTES } from "@/lib/s3-key";
import { SkinScanResultSchema } from "@/types/skin-scan";
import type { CaptureMethod, SkinScanResult } from "@/types/skin-scan";
import type { CaptureQuality } from "@/lib/capture-quality/types";
import type { EchoRegion } from "@/lib/echo-regions";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ─── Skin scan (/skin-check photo-capture step) ────────────────────────────
// Hits this app's own /api/skin-scan route (same-origin proxy to the
// self-hosted skin-scan service).

const SkinScanResponseSchema = z.object({
  ok: z.literal(true),
  result: SkinScanResultSchema,
  // C2: whether the server wrote users/{uid}/scanAnalyses. Absent when no
  // scanId was sent (or from an older route) — unknown, treated as fine.
  persisted: z.boolean().optional(),
  // R4: persisted:false because the processing consent was missing. Not a
  // write failure, so the recovery re-send would only be refused again.
  reason: z.literal("consent_missing").optional(),
});

// Delay before the one background re-request after persisted:false — long
// enough for a transient Firestore blip to clear, short enough that the tab
// is very likely still open.
const PERSIST_RETRY_DELAY_MS = 5_000;

// Above the route's own 30s timeout: this only catches a request that never came back.
const SKIN_SCAN_CLIENT_TIMEOUT_MS = 45_000;

// Fetched per request, never cached by us. getIdToken returns the SDK's
// current token and transparently refreshes one that's expired or close to
// it, which is exactly the lifecycle the server expects — a token captured
// once at startup would start failing verification an hour later.
//
// The token is a request header and nothing else — never written to
// localStorage, IndexedDB, Firestore, a cookie, the draft, or React state.
// Firebase owns its lifetime.
async function freshIdToken(): Promise<string> {
  // A convenience, not the security boundary: the server verifies the token itself.
  const user = auth().currentUser;
  if (!user) {
    throw new ApiError(401, "Skin scan requires a verified phone number.", "auth/required");
  }
  try {
    return await getIdToken(user);
  } catch {
    // Refresh failed (revoked session, disabled account, offline). Same
    // treatment as no user at all.
    throw new ApiError(401, "Skin scan requires a verified phone number.", "auth/required");
  }
}

export async function getSkinScanResult(
  photo: Blob,
  overlay?: string | string[] | null,
  scanId?: string
): Promise<SkinScanResult> {
  return (await requestSkinScan(photo, overlay, scanId)).result;
}

async function requestSkinScan(
  photo: Blob,
  overlay: string | string[] | null | undefined,
  scanId: string | undefined,
  captureMethod?: CaptureMethod,
  persistAttempt?: "recovery",
  captureQuality?: CaptureQuality,
  processingConsentVersion?: string
): Promise<{ result: SkinScanResult; persisted?: boolean | undefined; reason?: "consent_missing" | undefined }> {
  // A signed-out caller is stopped before a request is built.
  const idToken = await freshIdToken();

  const formData = new FormData();
  formData.append("image", photo, "scan.jpg");
  // One comma-separated field, one request.
  const overlayParam = Array.isArray(overlay) ? overlay.join(",") : overlay;
  if (overlayParam) formData.append("overlay", overlayParam);
  // C2: lets the server persist the full analysis under this scan. Optional
  // — without it the route analyzes exactly as before and writes nothing.
  if (scanId) formData.append("scanId", scanId);
  // Which capture branch produced `photo` (PhotoCapture), for the server's
  // analysis record. Absent only from callers that have no capture.
  if (captureMethod) formData.append("captureMethod", captureMethod);
  if (persistAttempt) formData.append("persistAttempt", persistAttempt);
  // C01 capture gate result for `photo`, client-asserted; the route validates or drops it.
  if (captureQuality) formData.append("captureQuality", JSON.stringify(captureQuality));
  // R3/R4 (D-16): the processing consent this photo was taken under. Without
  // it the route still analyzes but writes no analysis record.
  if (processingConsentVersion) formData.append("processingConsentVersion", processingConsentVersion);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SKIN_SCAN_CLIENT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/skin-scan", {
      method: "POST",
      headers: { Authorization: `Bearer ${idToken}` },
      body: formData,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Photo analysis took too long. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    // The token was refused, not the photo: the same auth/required code as the guard above.
    if (response.status === 401) {
      throw new ApiError(401, "Your session expired. Please verify your phone number again.", "auth/required");
    }
    // The route's code (e.g. NO_FACE_DETECTED) names a retake reason (owner O-5).
    // Client-only codes are never taken from the server.
    const body: unknown = await response.json().catch(() => null);
    const code = body && typeof body === "object" ? (body as { code?: unknown }).code : undefined;
    const passThrough = typeof code === "string" && code !== "auth/required" && code !== "upload/failed" ? code : undefined;
    throw new ApiError(response.status, "Failed to analyze photo.", passThrough);
  }

  const parsed = SkinScanResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("skin-scan response validation failed:", parsed.error);
    throw new ApiError(0, "Unexpected skin-scan response shape.");
  }

  return { result: parsed.data.result, persisted: parsed.data.persisted, reason: parsed.data.reason };
}

// ─── Original image upload (private S3) ────────────────────────────────────
// Two hops, both authenticated by the same Firebase ID token the
// scan uses: our own route mints a 5-minute presigned PUT for a key IT
// builds from the verified uid, then the bytes go straight from the browser
// to S3 — they never pass through Next.js.

const UploadUrlResponseSchema = z.object({
  uploadUrl: z.string(),
  key: z.string(),
  expiresIn: z.number(),
  contentType: z.string(),
});

// A full-res camera file over a phone connection. Well above the CV route's
// own 45s budget because this is the raw original, not the 1280px downscale.
const UPLOAD_TIMEOUT_MS = 120_000;

/**
 * Uploads one scan's ORIGINAL image to private S3. Resolves on success and
 * throws ApiError("upload/failed") on anything else — the caller must not
 * run the analysis when this rejects.
 *
 * The client picks neither the uid, the bucket, nor the key: it sends a
 * scanId and gets back a URL that can only write one object.
 */
export async function uploadOriginalImage(scanId: string, original: Blob): Promise<void> {
  // TD-18 (3): the cap is 25 MB; say so plainly, before asking for a URL.
  if (original.size > MAX_ORIGINAL_BYTES) throw new ApiError(413, UPLOAD_TOO_LARGE_MESSAGE, "upload/too-large");
  const idToken = await freshIdToken();

  const presignResponse = await fetch("/api/skin-scan/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    // The consent the user gave for THIS capture, echoed as part of the
    // request contract — the route refuses to sign anything without it.
    body: JSON.stringify({
      scanId,
      // Signed into the URL: S3 accepts exactly this many bytes (H20).
      contentLength: original.size,
      imageRetentionConsent: true,
      imageRetentionConsentVersion: IMAGE_RETENTION_CONSENT_VERSION,
    }),
  });

  if (!presignResponse.ok) {
    if (presignResponse.status === 401) {
      throw new ApiError(401, "Your session expired. Please verify your phone number again.", "auth/required");
    }
    if (presignResponse.status === 413) throw new ApiError(413, UPLOAD_TOO_LARGE_MESSAGE, "upload/too-large");
    throw new ApiError(presignResponse.status, "Couldn't prepare your photo for upload.", "upload/failed");
  }

  const presigned = UploadUrlResponseSchema.safeParse(await presignResponse.json());
  if (!presigned.success) {
    // Field paths only — the response body holds a presigned URL, which must
    // never reach a log line even inside a validation error.
    console.error(
      "upload-url response validation failed on:",
      presigned.error.issues.map((issue) => issue.path.join(".")).join(", ")
    );
    throw new ApiError(0, "Couldn't prepare your photo for upload.", "upload/failed");
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);
  let putResponse: Response;
  try {
    putResponse = await fetch(presigned.data.uploadUrl, {
      method: "PUT",
      // Content-Type is part of what the server signed, so it has to be sent
      // explicitly and identically — letting the browser derive it from
      // blob.type (a native camera File can report image/heic, or nothing)
      // is a SignatureDoesNotMatch that only reproduces on some phones.
      headers: { "Content-Type": presigned.data.contentType },
      body: original,
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Uploading your photo took too long. Please try again.", "upload/failed");
    }
    // Network failure, or S3 CORS refusing the PUT. Never log the presigned
    // URL — it is a bearer capability for as long as it lives.
    console.error("Original image upload failed:", (err as Error)?.name ?? "unknown");
    throw new ApiError(0, "Couldn't upload your photo. Please try again.", "upload/failed");
  } finally {
    clearTimeout(timeoutId);
  }

  if (!putResponse.ok) {
    console.error("Original image upload rejected by storage:", putResponse.status);
    throw new ApiError(putResponse.status, "Couldn't upload your photo. Please try again.", "upload/failed");
  }
}

/**
 * The whole photo pipeline in the order Phase 3 requires: store the original
 * FIRST, analyze second. A failed upload throws before any CV work starts.
 *
 * `retentionConsent` is what decides whether the original is stored at all.
 * Without it the scan still runs — analysis consent and retention consent are
 * separate permissions (the user agreed to have this photo analyzed, not to
 * have it kept), and the record then truthfully says stored: false.
 *
 * `original` is absent for a restored draft (only the downscaled photo is
 * kept). `alreadyStored` skips a re-upload on retry.
 */
export async function runSkinScan(opts: {
  scanId: string;
  photo: Blob;
  captureMethod: CaptureMethod;
  original?: Blob | undefined;
  retentionConsent?: boolean;
  alreadyStored?: boolean;
  overlays?: string | string[] | null;
  captureQuality?: CaptureQuality | undefined;
  processingConsentVersion?: string | undefined;
}): Promise<{ result: SkinScanResult; originalStored: boolean; persisted?: boolean | undefined }> {
  const { scanId, photo, captureMethod, original, retentionConsent = false, alreadyStored = false, overlays, captureQuality, processingConsentVersion } = opts;

  let originalStored = alreadyStored;
  if (original && retentionConsent && !alreadyStored) {
    await uploadOriginalImage(scanId, original);
    originalStored = true;
  }

  const { result, persisted, reason } = await requestSkinScan(photo, overlays, scanId, captureMethod, undefined, captureQuality, processingConsentVersion);
  if (persisted === false && reason !== "consent_missing") {
    // The server's analysis-record write failed, and nothing else would ever
    // retry it. Re-send the same bytes under the same scanId ONCE so the
    // SERVER re-analyzes and re-writes; the doc id is (scanId, sha256(bytes)),
    // so this can't duplicate — and if the first write did land late,
    // ALREADY_EXISTS keeps that original record unmarked. No overlays (never
    // stored, costly to render). Marked persistAttempt=recovery for provenance.
    // Fire-and-forget: the user already has `result`, and the retry's result
    // is never applied. The browser never writes measurements itself.
    setTimeout(() => {
      requestSkinScan(photo, null, scanId, captureMethod, "recovery", captureQuality, processingConsentVersion)
        .then((retry) => {
          if (retry.persisted === false) console.warn("skin-scan: analysis record still not persisted after retry.");
        })
        .catch(() => console.warn("skin-scan: analysis record persist retry failed."));
    }, PERSIST_RETRY_DELAY_MS);
  }
  return { result, originalStored, persisted };
}

/** True when the ORIGINAL image upload failed — the analysis never ran. */
/** TD-18 (3): shown when the original is over the 25 MB cap. */
export const UPLOAD_TOO_LARGE_MESSAGE = "This photo is too large to save (the limit is 25 MB). Please take a new photo and try again.";

/** Any upload failure, too large included: nothing was stored and the analysis did not run. */
export function isUploadError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === "upload/failed" || error.code === "upload/too-large");
}

export function isUploadTooLarge(error: unknown): boolean {
  return error instanceof ApiError && error.code === "upload/too-large";
}

/**
 * True for both ways a scan can fail on identity: no Firebase user before the
 * request, and a token the server refused. Callers use it to say "verify
 * again" instead of "your photo couldn't be analyzed".
 */
export function isAuthError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "auth/required";
}

// ─── Echo chat message shape ────────────────────────────────────────────────

export interface EchoChatMessage {
  role: "user" | "echo";
  text: string;
}

// ─── Echo chat (/echo) ─────────────────────────────────────────────────────
// Hits /api/skin-check/chat.

/** TD-34: a suggested own product. The screen draws its card from the catalogue by id. */
const ShownProductSchema = z.object({ productId: z.string(), reason: z.string() });
export type ShownProduct = z.infer<typeof ShownProductSchema>;

const SkinCheckChatResponseSchema = z.object({
  ok: z.literal(true),
  reply: z.string(),
  historyToken: z.string(),
  products: z.array(ShownProductSchema).max(5).optional(),
});

const EchoOpeningResponseSchema = z.object({ ok: z.literal(true), reply: z.string(), products: z.array(ShownProductSchema).max(5) });

// `code` tells "retrying won't help" (CHAT_MISCONFIGURED) from a transient failure.
const ChatErrorResponseSchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
});

// Above lib/gemini.ts's worst-case retry budget for one call (3 attempts at
// GEMINI_REQUEST_TIMEOUT_MS=10s each, plus backoff — roughly 32s), so this
// only fires on a request that never got a response at all.
const CHAT_CLIENT_TIMEOUT_MS = 40_000;

// Gate 02: only the scan's identity, the region, and the thread are sent —
// scores, region scores, and quiz answers are loaded server-side under the
// verified uid (app/api/skin-check/chat/route.ts). `history` is the thread
// BEFORE `message`; non-empty history must carry the historyToken the
// previous reply returned, and the reply comes back with the next one.
// `signal` (EchoPage aborts on unmount) adds to this function's own timeout.
export async function getSkinCheckChatReply(
  scanId: string,
  region: EchoRegion,
  history: EchoChatMessage[],
  historyToken: string | null,
  message: string,
  signal?: AbortSignal
): Promise<{ reply: string; historyToken: string; products: ShownProduct[] }> {
  // Gate 02: the route verifies this itself. No user → ApiError auth/required
  // before a request is built.
  const idToken = await freshIdToken();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_CLIENT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  let response: Response;
  try {
    response = await fetch("/api/skin-check/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ scanId, region, history, historyToken, message }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Echo took too long to respond. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onExternalAbort);
  }

  // Same code as freshIdToken's, so isAuthError covers a token the server refused.
  if (response.status === 401) {
    throw new ApiError(401, "Echo requires a verified phone number.", "auth/required");
  }

  if (!response.ok) {
    const errorBody = ChatErrorResponseSchema.safeParse(await response.json().catch(() => null));
    const code = errorBody.success ? errorBody.data.code : undefined;
    throw new ApiError(response.status, "Failed to reach Echo.", code);
  }

  const parsed = SkinCheckChatResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("skin-check chat response validation failed:", parsed.error);
    throw new ApiError(0, "Unexpected skin-check chat response shape.");
  }

  return { reply: parsed.data.reply, historyToken: parsed.data.historyToken, products: parsed.data.products ?? [] };
}

/**
 * TD-34: Echo's opening suggestion for this check (a routine from the
 * own-product list). Only the check and the region go up; the server sends
 * Gemini a fixed request and keeps the answer, so asking again costs nothing.
 */
export async function getEchoOpening(scanId: string, region: EchoRegion, signal?: AbortSignal): Promise<{ reply: string; products: ShownProduct[] }> {
  const idToken = await freshIdToken();
  // The same timeout and abort as a question (AbortSignal.any is too new for older phones).
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_CLIENT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);
  let response: Response;
  try {
    response = await fetch("/api/skin-check/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ scanId, region, opening: true }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
    signal?.removeEventListener("abort", onExternalAbort);
  }
  if (!response.ok) {
    const errorBody = ChatErrorResponseSchema.safeParse(await response.json().catch(() => null));
    throw new ApiError(response.status, "No suggestion from Echo.", errorBody.success ? errorBody.data.code : undefined);
  }
  const parsed = EchoOpeningResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new ApiError(0, "Unexpected Echo opening response shape.");
  return parsed.data;
}

export { ApiError };
