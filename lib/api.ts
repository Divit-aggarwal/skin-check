import { z } from "zod";
import { getIdToken } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { IMAGE_RETENTION_CONSENT_VERSION } from "@/lib/consent";
import { SkinScanResultSchema } from "@/types/skin-scan";
import type { SkinScanResult, SkinScanScores } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

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

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- wired up to API functions in a later session
async function request<T>(
  path: string,
  options: RequestInit = {},
  schema: z.ZodSchema<T>
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  });

  if (!response.ok) {
    throw new ApiError(response.status, `API error: ${response.status} on ${path}`);
  }

  const data: unknown = await response.json();
  const parsed = schema.safeParse(data);

  if (!parsed.success) {
    console.error("API response validation failed:", parsed.error);
    throw new ApiError(0, `Unexpected API response shape from ${path}`);
  }

  return parsed.data;
}

// API functions will be added here in Session 8 when FastAPI is wired up.
// Example structure:
// export async function getTwinState(userId: string) {
//   return request(`/twin/${userId}`, {}, TwinStateSchema);
// }

// ─── Skin scan (/skin-check photo-capture step) ────────────────────────────
// Hits this app's own /api/skin-scan route (same-origin proxy to the
// self-hosted skin-scan service), not the future FastAPI backend `request()`
// targets — same reasoning as the assessment routes above.

const SkinScanResponseSchema = z.object({
  ok: z.literal(true),
  result: SkinScanResultSchema,
});

// Above the server route's own 30s upstream timeout (app/api/skin-scan/route.ts)
// on purpose — that route always resolves (success, or a clean 502/504) within
// its own bound, so this only needs to catch a request that never came back at
// all (dropped connection, hung platform-level request), not race the server's
// own timeout and turn an otherwise-successful slow scan into a client error.
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
  // `currentUser` is Firebase's own synchronous view of the restored/verified
  // session, not app state, so it can't be spoofed by a stale draft or a
  // re-render. As of PHASE 2 this is a convenience, not the security
  // boundary: the server verifies the token itself either way.
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
  overlay?: string | string[] | null
): Promise<SkinScanResult> {
  // PHASE 1 fast path — a signed-out caller is stopped before a request is
  // even built. Every route that can put a facial image on the wire funnels
  // through here.
  const idToken = await freshIdToken();

  const formData = new FormData();
  formData.append("image", photo, "scan.jpg");
  // The proxy (and the skin-scan service itself, main.py's `overlays` query
  // param) accepts a comma-separated category list in one request — an array
  // here joins into that same single field rather than firing one request
  // per category.
  const overlayParam = Array.isArray(overlay) ? overlay.join(",") : overlay;
  if (overlayParam) formData.append("overlay", overlayParam);

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
    // A 401 here means the server refused the token, not that the photo was
    // bad — surfacing it as "Failed to analyze photo." would send the user
    // retaking pictures to fix an expired session. Carries the same
    // `auth/required` code as the pre-flight guard above so callers have one
    // condition to branch on.
    if (response.status === 401) {
      throw new ApiError(401, "Your session expired. Please verify your phone number again.", "auth/required");
    }
    throw new ApiError(response.status, "Failed to analyze photo.");
  }

  const parsed = SkinScanResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("skin-scan response validation failed:", parsed.error);
    throw new ApiError(0, "Unexpected skin-scan response shape.");
  }

  return parsed.data.result;
}

// ─── Original image upload (private S3) ────────────────────────────────────
// PHASE 3. Two hops, both authenticated by the same Firebase ID token the
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
  const idToken = await freshIdToken();

  const presignResponse = await fetch("/api/skin-scan/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    // The consent the user gave for THIS capture, echoed as part of the
    // request contract — the route refuses to sign anything without it.
    body: JSON.stringify({
      scanId,
      imageRetentionConsent: true,
      imageRetentionConsentVersion: IMAGE_RETENTION_CONSENT_VERSION,
    }),
  });

  if (!presignResponse.ok) {
    if (presignResponse.status === 401) {
      throw new ApiError(401, "Your session expired. Please verify your phone number again.", "auth/required");
    }
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
 * `original` is optional because a restored draft only carries the downscaled
 * `photo` (types/skin-scan.ts) — there are simply no original bytes left to
 * store in that case. `alreadyStored` skips a redundant re-upload on retry
 * after the CV half failed; re-uploading would be harmless (same key, same
 * object), just wasted.
 */
export async function runSkinScan(opts: {
  scanId: string;
  photo: Blob;
  original?: Blob | undefined;
  retentionConsent?: boolean;
  alreadyStored?: boolean;
  overlays?: string | string[] | null;
}): Promise<{ result: SkinScanResult; originalStored: boolean }> {
  const { scanId, photo, original, retentionConsent = false, alreadyStored = false, overlays } = opts;

  let originalStored = alreadyStored;
  if (original && retentionConsent && !alreadyStored) {
    await uploadOriginalImage(scanId, original);
    originalStored = true;
  }

  const result = await getSkinScanResult(photo, overlays);
  return { result, originalStored };
}

/** True when the ORIGINAL image upload failed — the analysis never ran. */
export function isUploadError(error: unknown): boolean {
  return error instanceof ApiError && error.code === "upload/failed";
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

// ─── Echo chat (/skin-check dashboard — Step 4) ────────────────────────────
// Hits /api/skin-check/chat.

const SkinCheckChatResponseSchema = z.object({
  ok: z.literal(true),
  reply: z.string(),
});

// The route's error responses (both the upfront CHAT_MISCONFIGURED check and
// the catch-all CHAT_SERVICE_ERROR) — `code` lets the caller tell "Echo isn't
// set up, retrying won't help" apart from "transient failure, retry might
// work" instead of collapsing both into one generic message.
const ChatErrorResponseSchema = z.object({
  error: z.string().optional(),
  code: z.string().optional(),
});

export interface SkinCheckRegionFocus {
  region: string;
  scores: SkinScanScores;
}

// Above lib/gemini.ts's worst-case retry budget for one call (3 attempts at
// GEMINI_REQUEST_TIMEOUT_MS=10s each, plus backoff — roughly 32s), so this
// only fires on a request that never got a response at all.
const CHAT_CLIENT_TIMEOUT_MS = 40_000;

// `composite` is not sent — the server recomputes it from `scores` itself
// (app/api/skin-check/chat/route.ts), since it's a pure function of scores
// and trusting a client-supplied summaryLine string used to be a
// prompt-injection path into Gemini's systemInstruction.
//
// `signal` is optional and caller-supplied (EchoPage.tsx aborts it on
// unmount, e.g. the user navigates away from /echo mid-request) — it
// composes with, rather than replaces, this function's own timeout abort.
export async function getSkinCheckChatReply(
  messages: EchoChatMessage[],
  answers: SkinCheckAnswers,
  scores: SkinScanScores | null,
  regionFocus: SkinCheckRegionFocus | null = null,
  signal?: AbortSignal
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_CLIENT_TIMEOUT_MS);
  const onExternalAbort = () => controller.abort();
  signal?.addEventListener("abort", onExternalAbort);

  let response: Response;
  try {
    response = await fetch("/api/skin-check/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, answers, scores, regionFocus }),
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

  return parsed.data.reply;
}

// ─── Home marketing page — waitlist & newsletter ───────────────────────────
// No real endpoint/provider confirmed yet (owed — see app/home spec). These
// stubs let the UI's submit/loading/success states be wired end-to-end now;
// swap the body for a real call once the endpoint is known.

export interface WaitlistSignupPayload {
  email: string;
  whatsapp: string;
  interests: string[];
}

export async function submitWaitlistSignup(payload: WaitlistSignupPayload): Promise<void> {
  // TODO: point at the real waitlist provider/endpoint once confirmed.
  console.info("[waitlist] signup captured (endpoint not yet wired):", payload);
}

export async function subscribeNewsletter(email: string): Promise<void> {
  // TODO: point at the real newsletter provider/endpoint once confirmed.
  console.info("[newsletter] subscription captured (endpoint not yet wired):", email);
}

export { ApiError };
