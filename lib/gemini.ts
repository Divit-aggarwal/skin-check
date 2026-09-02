import { GoogleGenAI } from "@google/genai";
import { summarizeSkinCheckAnswers, summarizeSkinScanScores } from "@/lib/skin-check-format";
import type { SkinCheckAnswers } from "@/types/skin-check";
import type { SkinScanScores } from "@/types/skin-scan";
import type { CompositeScore } from "@/lib/skin-check-score";

export interface EchoChatMessage {
  role: "user" | "echo";
  text: string;
}

function getSynthesisModel(): string {
  return process.env.GEMINI_MODEL_SYNTHESIS || "gemini-2.5-flash";
}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");
    client = new GoogleGenAI({ apiKey });
  }
  return client;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const RETRYABLE_STATUSES = new Set([429, 503]);

function isRetryableGeminiError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "status" in err &&
    RETRYABLE_STATUSES.has((err as { status?: unknown }).status as number)
  );
}

/**
 * Retries transient Gemini errors (429 rate limit, 503 "high demand" —
 * observed in practice, not hypothetical) with short backoff before letting
 * the caller's own fallback/error path take over. Non-retryable errors
 * (bad prompt, invalid key, coordinate validation) throw immediately.
 */
async function withGeminiRetry<T>(fn: () => Promise<T>, retries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (!isRetryableGeminiError(err) || attempt === retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
  }
  throw lastError;
}

// ─── Twin chat call ─────────────────────────────────────────────────────────

const ECHO_CHAT_PERSONA = `You are Echo — the user's skin digital twin inside theprojectskin app. You
speak in a direct, warm, science-led voice: "appears," "may," "based on your
profile," "confidence: medium." You are not a doctor and never act like one.

You will be given the user's already-computed skin assessment below — refer
to it naturally in your answers (their actual score, sub-scores, root-cause
tags, and any photo-detected regions) instead of giving generic skincare
advice. Keep replies short and conversational, a few sentences at most.

Never use these words or their variants: diagnose, diagnosis, cure, heal,
treat, prescription, guaranteed, proven to, will improve, causes, caused by.
Frame anything causal as a possibility ("may be associated with"), never a
certainty.`;

/**
 * Shared multi-turn call mechanics for Echo chat (see
 * buildSkinCheckEchoSystemInstruction below) — reuses the same Gemini 2.5
 * Flash client as synthesis (CLAUDE.md:
 * same provider/model already proven for the mobile app's twin chat, no new
 * client). History is capped to the last 20 messages; the leading
 * assistant-only seed message (before the first user turn) is dropped since
 * Gemini's contents array must start on a user turn. Every call sends the
 * full accumulated conversation, not just the latest message — the grounding
 * data lives once in systemInstruction, not repeated per turn.
 */
// Per-attempt timeout, not a total-request budget — withGeminiRetry can call
// this up to 3 times (2 retries), so the worst case is roughly this value
// times 3 plus backoff. Sized so that worst case stays comfortably inside a
// typical serverless function timeout rather than the API's own multi-minute
// default, which would otherwise let one hung attempt block the retry loop
// for far longer than the platform is willing to run the handler at all.
const GEMINI_REQUEST_TIMEOUT_MS = 10_000;

async function runEchoChat(messages: EchoChatMessage[], systemInstruction: string): Promise<string> {
  const ai = getClient();
  const capped = messages.slice(-20);
  const firstUserIndex = capped.findIndex((m) => m.role === "user");
  const conversation = firstUserIndex === -1 ? [] : capped.slice(firstUserIndex);

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: getSynthesisModel(),
      contents: conversation.map((m) => ({
        role: m.role === "user" ? ("user" as const) : ("model" as const),
        parts: [{ text: m.text }],
      })),
      config: { systemInstruction, httpOptions: { timeout: GEMINI_REQUEST_TIMEOUT_MS } },
    })
  );

  const text = response.text?.trim();
  if (!text) throw new Error("Gemini returned an empty chat response.");
  return text;
}

// score scale note: per-category readings are bands (Low/Moderate/Elevated),
// matching what the user already sees on their dashboard — see
// lib/skin-check-rules.ts. Band words mean concern-level uniformly across
// every category now — no per-category inversion to explain here anymore.
// The one category that used to need one (hydration) is labeled "Dryness"
// instead (lib/skin-check-format.ts's SKIN_SCAN_CATEGORY_LABELS) so the word
// "Elevated" still just means "more of this concern," same as every other
// row — that relabel is what this note used to have to spell out.
const SKIN_CHECK_SCORE_SCALE_NOTE = `Band scale: Low, Moderate, or Elevated per category, matching what the user
already sees on their dashboard. These are not percentages or scores — do
not invent or imply a number behind them. Elevated always means MORE of the
named concern (e.g. Redness: Elevated means more redness detected; Dryness:
Elevated means more dryness detected — dryness, not hydration, is the
category name here on purpose, so "Elevated" doesn't flip meaning for it).
Pores has no band yet — do not comment on pores.`;

// /echo (Step 4b) — the region a thread is scoped to, and that region's own
// slice of region_scores (Step 4a). Grounds the reply in "your forehead"
// specifically, alongside (not instead of) the whole-scan context below.
export interface SkinCheckRegionFocus {
  region: string;
  scores: SkinScanScores;
}

function buildSkinCheckEchoSystemInstruction(
  answers: SkinCheckAnswers,
  scores: SkinScanScores | null,
  composite: CompositeScore | null,
  regionFocus: SkinCheckRegionFocus | null
): string {
  const scanSection =
    scores && composite
      ? `concerns: ${composite.topConcerns.join(", ")}
summary already shown to the user: "${composite.summaryLine}"

per-category scores:
${summarizeSkinScanScores(scores)}

${SKIN_CHECK_SCORE_SCALE_NOTE}`
      : `No photo scan is available for this user (skipped, or their photo couldn't
be read) — answer using the quiz responses below only, and if it's relevant,
be upfront that there's no photo-based reading yet. Because this reading is
quiz-only, treat your confidence as LOWER than a photo-backed read would be —
say "confidence: low" or "confidence: medium," never "confidence: high."`;

  const regionSection = regionFocus
    ? `\n\nThis conversation thread is scoped to the user's ${regionFocus.region}
specifically — they tapped that zone on their face diagram to start it. Lead
with what's true for THIS region, not whole-face generalities, using these
region-specific readings:
${summarizeSkinScanScores(regionFocus.scores)}

${SKIN_CHECK_SCORE_SCALE_NOTE}
The whole-face numbers above are background context only — only bring them up
if the user asks how this region compares to the rest of their face.`
    : "";

  return `${ECHO_CHAT_PERSONA}

user's /skin-check quiz answers:
${summarizeSkinCheckAnswers(answers)}

${scanSection}${regionSection}`;
}

/**
 * /skin-check's retrofit of getEchoChatReply — same chat mechanics
 * (runEchoChat), a system instruction built from /skin-check's actual data
 * shape instead of the old /assessment QuizAnswers/SynthesisResult/VisionResult
 * shape. root_cause_tags, recommendations, and vision regions have no
 * equivalent here (computeCompositeScore is deterministic local scoring, not
 * a Gemini synthesis call, and /skin-check never collects allergy_status) —
 * omitted rather than fabricated. `regionFocus` (Step 4b) is optional — null
 * for a general thread, set for a region-scoped /echo thread.
 */
export async function getSkinCheckChatReply(
  messages: EchoChatMessage[],
  context: {
    answers: SkinCheckAnswers;
    scores: SkinScanScores | null;
    composite: CompositeScore | null;
    regionFocus?: SkinCheckRegionFocus | null;
  }
): Promise<string> {
  return runEchoChat(
    messages,
    buildSkinCheckEchoSystemInstruction(
      context.answers,
      context.scores,
      context.composite,
      context.regionFocus ?? null
    )
  );
}
