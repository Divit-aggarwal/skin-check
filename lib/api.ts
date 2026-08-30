import { z } from "zod";
import { SynthesisResultSchema, VisionResultSchema } from "@/types/gemini";
import type { QuizAnswers, SynthesisResult, VisionResult } from "@/types/gemini";
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

// ─── Assessment two-phase compute (Session 2c routes) ──────────────────────
// These hit this app's own /api/assessment/* routes (same-origin), not the
// future FastAPI backend `request()` targets — kept as plain fetch calls here
// rather than routed through `request()`, whose BASE_URL is reserved for that
// separate host.

const QuickResultResponseSchema = z.object({
  ok: z.literal(true),
  result: SynthesisResultSchema,
});

const FullResultResponseSchema = z.object({
  ok: z.literal(true),
  vision: VisionResultSchema.nullable(),
  result: SynthesisResultSchema,
});

export async function getQuickResult(quizAnswers: QuizAnswers): Promise<SynthesisResult> {
  const response = await fetch("/api/assessment/quick-result", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ quizAnswers }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, "Failed to compute quick result.");
  }

  const parsed = QuickResultResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("quick-result response validation failed:", parsed.error);
    throw new ApiError(0, "Unexpected quick-result response shape.");
  }

  return parsed.data.result;
}

export async function getFullResult(
  photo: Blob,
  quizAnswers: QuizAnswers
): Promise<{ vision: VisionResult | null; result: SynthesisResult }> {
  const formData = new FormData();
  formData.append("photo", photo);
  formData.append("quiz_answers", JSON.stringify(quizAnswers));

  const response = await fetch("/api/assessment/full-result", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new ApiError(response.status, "Failed to compute full result.");
  }

  const parsed = FullResultResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("full-result response validation failed:", parsed.error);
    throw new ApiError(0, "Unexpected full-result response shape.");
  }

  return { vision: parsed.data.vision, result: parsed.data.result };
}

// ─── Skin scan (/skin-check photo-capture step) ────────────────────────────
// Hits this app's own /api/skin-scan route (same-origin proxy to the
// self-hosted skin-scan service), not the future FastAPI backend `request()`
// targets — same reasoning as the assessment routes above.

const SkinScanResponseSchema = z.object({
  ok: z.literal(true),
  result: SkinScanResultSchema,
});

export async function getSkinScanResult(
  photo: Blob,
  overlay?: string | null
): Promise<SkinScanResult> {
  const formData = new FormData();
  formData.append("image", photo, "scan.jpg");
  if (overlay) formData.append("overlay", overlay);

  const response = await fetch("/api/skin-scan", {
    method: "POST",
    body: formData,
  });

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

// ─── Twin chat (Session 6 — Echo tab) ──────────────────────────────────────

export interface EchoChatMessage {
  role: "user" | "echo";
  text: string;
}

const ChatResponseSchema = z.object({
  ok: z.literal(true),
  reply: z.string(),
});

export async function getEchoChatReply(
  messages: EchoChatMessage[],
  result: SynthesisResult,
  vision: VisionResult | null
): Promise<string> {
  const response = await fetch("/api/twin/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, result, vision }),
  });

  if (!response.ok) {
    throw new ApiError(response.status, "Failed to reach Echo.");
  }

  const parsed = ChatResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    console.error("twin/chat response validation failed:", parsed.error);
    throw new ApiError(0, "Unexpected twin/chat response shape.");
  }

  return parsed.data.reply;
}

// ─── Echo chat (/skin-check dashboard — Step 4) ────────────────────────────
// Hits /api/skin-check/chat, the /skin-check-shaped retrofit of the twin chat
// route above — separate route/client fn so the existing twin/chat + Echo tab
// call site above is left untouched.

const SkinCheckChatResponseSchema = z.object({
  ok: z.literal(true),
  reply: z.string(),
});

export interface SkinCheckRegionFocus {
  region: string;
  scores: SkinScanScores;
}

export async function getSkinCheckChatReply(
  messages: EchoChatMessage[],
  answers: SkinCheckAnswers,
  scores: SkinScanScores | null,
  composite: CompositeScore | null,
  regionFocus: SkinCheckRegionFocus | null = null
): Promise<string> {
  const response = await fetch("/api/skin-check/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, answers, scores, composite, regionFocus }),
  });

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
