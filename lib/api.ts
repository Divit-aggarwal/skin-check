import { z } from "zod";
import { SkinScanResultSchema } from "@/types/skin-scan";
import type { SkinScanResult, SkinScanScores } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";
import type { CompositeScore } from "@/lib/skin-check-score";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string
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

export async function getSkinScanResult(
  photo: Blob,
  overlay?: string | string[] | null
): Promise<SkinScanResult> {
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
    throw new ApiError(response.status, "Failed to analyze photo.");
  }

  const parsed = SkinScanResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("skin-scan response validation failed:", parsed.error);
    throw new ApiError(0, "Unexpected skin-scan response shape.");
  }

  return parsed.data.result;
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

export interface SkinCheckRegionFocus {
  region: string;
  scores: SkinScanScores;
}

// Above lib/gemini.ts's worst-case retry budget for one call (3 attempts at
// GEMINI_REQUEST_TIMEOUT_MS=10s each, plus backoff — roughly 32s), so this
// only fires on a request that never got a response at all.
const CHAT_CLIENT_TIMEOUT_MS = 40_000;

export async function getSkinCheckChatReply(
  messages: EchoChatMessage[],
  answers: SkinCheckAnswers,
  scores: SkinScanScores | null,
  composite: CompositeScore | null,
  regionFocus: SkinCheckRegionFocus | null = null
): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHAT_CLIENT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch("/api/skin-check/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, answers, scores, composite, regionFocus }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Echo took too long to respond. Please try again.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!response.ok) {
    throw new ApiError(response.status, "Failed to reach Echo.");
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
