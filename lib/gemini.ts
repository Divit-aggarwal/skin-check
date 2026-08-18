import { GoogleGenAI } from "@google/genai";
import {
  VisionResultSchema,
  SynthesisResultSchema,
  type VisionResult,
  type SynthesisResult,
  type QuizAnswers,
} from "@/types/gemini";
import { summarizeSkinCheckAnswers, summarizeSkinScanScores } from "@/lib/skin-check-format";
import type { SkinCheckAnswers } from "@/types/skin-check";
import type { SkinScanScores } from "@/types/skin-scan";
import type { CompositeScore } from "@/lib/skin-check-score";

export interface EchoChatMessage {
  role: "user" | "echo";
  text: string;
}

const MAX_COORDINATE_RETRIES = 1;

function getVisionModel(): string {
  return process.env.GEMINI_MODEL_VISION || "gemini-2.5-flash";
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

export class GeminiCoordinateError extends Error {}

// ─── Prompts — do not modify wording without flagging (see CLAUDE.md) ─────

const VISION_PROMPT = `You are a skin analysis assistant. You will be given a single front-facing facial
photo. Analyze the visible skin condition and return ONLY a valid JSON object —
no prose, no markdown formatting, no explanation before or after the JSON.

Identify visible skin characteristics in these categories: breakouts (acne,
comedones, pustules — grouped as one category, do not sub-classify by medical
lesion type), texture irregularity, redness, pigmentation/dark spots, oiliness
(visible shine), dryness (visible flaking/dullness), dark circles, and puffiness.

For each detected region, provide a bounding box using NORMALIZED coordinates
(0.0 to 1.0, relative to image width/height, origin top-left) — not pixel values.

CRITICAL: Both the horizontal axis (x, width) AND the vertical axis (y, height)
must be normalized 0.0-1.0. Do NOT return pixel values for any coordinate, on
either axis. Before returning your response, check every x, y, width, and height
value — if any single value is greater than 1.0, it is wrong; divide it by the
image's pixel dimension for that axis and correct it before outputting.

Example of CORRECT output for a region located in the lower-left quadrant of
the image, roughly 20% of the image's width and 15% of its height in size:

{
  "category": "breakouts",
  "zone": "chin",
  "severity": "mild",
  "bounding_box": { "x": 0.15, "y": 0.72, "width": 0.20, "height": 0.15 }
}

Example of INCORRECT output — do NOT do this (mixing pixel values into y/height
while x/width are normalized):

{
  "category": "breakouts",
  "zone": "chin",
  "severity": "mild",
  "bounding_box": { "x": 0.15, "y": 780, "width": 0.20, "height": 160 }
}

Rate each category's overall severity as one of: "none", "mild", "moderate",
"noticeable". Do not use clinical severity scales or diagnostic terminology.

If the image quality is too poor to analyze confidently (blur, poor lighting,
face not clearly visible, face not centered), return only:
{ "analyzable": false, "reason": "<short reason>" }

Otherwise, return exactly this structure:

{
  "analyzable": true,
  "overall_confidence": "high" | "medium" | "low",
  "regions": [
    {
      "category": "breakouts" | "texture" | "redness" | "pigmentation" |
                  "oiliness" | "dryness" | "dark_circles" | "puffiness",
      "zone": "forehead" | "left_cheek" | "right_cheek" | "chin" | "nose" |
              "under_eyes" | "jawline",
      "severity": "none" | "mild" | "moderate" | "noticeable",
      "bounding_box": { "x": 0.0, "y": 0.0, "width": 0.0, "height": 0.0 }
    }
  ],
  "category_summary": {
    "breakouts": "none" | "mild" | "moderate" | "noticeable",
    "texture": "none" | "mild" | "moderate" | "noticeable",
    "redness": "none" | "mild" | "moderate" | "noticeable",
    "pigmentation": "none" | "mild" | "moderate" | "noticeable",
    "oiliness": "none" | "mild" | "moderate" | "noticeable",
    "dryness": "none" | "mild" | "moderate" | "noticeable",
    "dark_circles": "none" | "mild" | "moderate" | "noticeable",
    "puffiness": "none" | "mild" | "moderate" | "noticeable"
  }
}

Only include entries in "regions" for zones where something was actually
detected — do not include "none" severity entries in the regions array, only
in category_summary. Be conservative: if uncertain whether something is present,
omit it rather than guess.`;

const SYNTHESIS_PROMPT = `You are generating a personalized skin assessment summary. You will be given
two inputs: a user's quiz answers (JSON) and, optionally, structured skin
analysis output from a photo (JSON, or null if no photo was provided).

Return ONLY a valid JSON object — no prose, no markdown formatting, no
explanation before or after the JSON.

Compute a weighted composite skin score from 0-100, where higher means fewer
visible concerns. Weight breakouts and redness more heavily than texture and
hydration UNLESS the quiz's primary concern indicates otherwise (e.g. if the
user's stated concern is "aging" or "dullness," weight texture/hydration
higher instead). If no photo data is provided, derive the score from quiz
answers alone (concern severity, symptoms, duration) and treat this as a
lower-confidence estimate.

Also compute 4 category sub-scores (0-100 each): breakouts, texture, redness,
hydration. If photo data is available, base these primarily on the photo's
category_summary severities, adjusted slightly by quiz context. If no photo,
estimate from quiz answers alone.

Generate 2-3 short root-cause tags — brief phrases (4-6 words max), not
sentences, framed as possibilities, never certainties. Draw from quiz answers
(symptoms, duration, prior treatments) and photo findings if present. Never
use causal language ("caused by") — use "may be associated with" framing
implicitly by keeping tags speculative in tone, e.g. "Possible trigger: stress"
or "May relate to product buildup" — not "Your acne is caused by stress."

Set an overall confidence level: "high" if photo data is present and
quiz answers are complete, "medium" if photo is present but some quiz fields
were minimal, "low" if no photo was provided (quiz-only path).

Write one short, warm, plain-language summary line (max 20 words) describing
the overall result, in this voice: direct, warm, science-led. Use words like
"appears," "may," "based on your profile." Never use: diagnose, diagnosis,
cure, heal, treat, prescription, guaranteed, proven to, will improve, causes,
caused by.

Recommendations: ONLY generate ingredient/category-level guidance (e.g.
"Look for: niacinamide, salicylic acid" / "Avoid: heavy, comedogenic oils")
if the quiz input includes a non-empty allergy_status field. If allergy_status
is missing, empty, or not present in the input, do NOT generate
recommendations — instead set "recommendations_blocked": true and leave the
recommendations array empty. Never guess or generate recommendations without
this field present, even if everything else in the input is complete.

Return exactly this structure:

{
  "overall_score": 0,
  "confidence": "high" | "medium" | "low",
  "summary_line": "",
  "sub_scores": {
    "breakouts": 0,
    "texture": 0,
    "redness": 0,
    "hydration": 0
  },
  "root_cause_tags": ["", ""],
  "recommendations_blocked": false,
  "recommendations": [
    { "type": "look_for" | "avoid", "text": "" }
  ]
}`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractJson(text: string | undefined): unknown {
  if (!text) throw new Error("Gemini returned an empty response.");
  return JSON.parse(text);
}

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

async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = Buffer.from(await blob.arrayBuffer());
  return buffer.toString("base64");
}

/**
 * Server-side re-check of every bounding_box value per CLAUDE.md's hard rule —
 * the prompt asks Gemini to self-correct, but that's a known failure mode, not
 * a guarantee. Throws rather than normalizing: we don't reliably know the pixel
 * dimensions Gemini used internally, so a caller-side retry is the safe path.
 */
export function validateVisionCoordinates(result: VisionResult): VisionResult {
  if (!result.analyzable) return result;

  for (const region of result.regions) {
    const { x, y, width, height } = region.bounding_box;
    for (const [key, value] of Object.entries({ x, y, width, height })) {
      if (value < 0 || value > 1) {
        throw new GeminiCoordinateError(
          `bounding_box.${key}=${value} out of range [0,1] for region ${region.category}/${region.zone}`
        );
      }
    }
  }

  return result;
}

/**
 * Server-side safety net for the allergy hard-gate (CLAUDE.md: never render
 * recommendations if allergy/medication data was skipped). Doesn't trust the
 * model's own recommendations_blocked flag — recomputes it from the actual
 * quiz input regardless of what the model returned.
 */
export function applyAllergyGate(
  quizAnswers: QuizAnswers,
  result: SynthesisResult
): SynthesisResult {
  if (quizAnswers.allergy_status) return result;

  if (!result.recommendations_blocked || result.recommendations.length > 0) {
    return { ...result, recommendations_blocked: true, recommendations: [] };
  }

  return result;
}

// ─── Vision call ────────────────────────────────────────────────────────────

export async function analyzeSkinImage(imageBlob: Blob): Promise<VisionResult> {
  const ai = getClient();
  const base64 = await blobToBase64(imageBlob);
  const mimeType = imageBlob.type || "image/jpeg";

  let lastError: unknown;

  for (let attempt = 0; attempt <= MAX_COORDINATE_RETRIES; attempt++) {
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: getVisionModel(),
        contents: [
          {
            role: "user",
            parts: [{ text: VISION_PROMPT }, { inlineData: { mimeType, data: base64 } }],
          },
        ],
        config: { responseMimeType: "application/json" },
      })
    );

    const parsed = VisionResultSchema.parse(extractJson(response.text));

    try {
      return validateVisionCoordinates(parsed);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError;
}

// ─── Synthesis call ─────────────────────────────────────────────────────────

export async function computeSkinAssessment(
  quizAnswers: QuizAnswers,
  visionResult: VisionResult | null
): Promise<SynthesisResult> {
  const ai = getClient();

  const response = await withGeminiRetry(() =>
    ai.models.generateContent({
      model: getSynthesisModel(),
      contents: [
        {
          role: "user",
          parts: [
            { text: SYNTHESIS_PROMPT },
            {
              text: `quiz_answers:\n${JSON.stringify(quizAnswers)}\n\nvision_result:\n${JSON.stringify(visionResult)}`,
            },
          ],
        },
      ],
      config: { responseMimeType: "application/json" },
    })
  );

  const parsed = SynthesisResultSchema.parse(extractJson(response.text));
  return applyAllergyGate(quizAnswers, parsed);
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

function buildEchoSystemInstruction(
  result: SynthesisResult,
  vision: VisionResult | null
): string {
  return `${ECHO_CHAT_PERSONA}

user's computed assessment:
${JSON.stringify(result)}

photo-based detail (null if no photo was analyzed):
${JSON.stringify(vision)}`;
}

/**
 * Shared multi-turn call mechanics for both Echo chat contexts (old
 * /assessment shape and /skin-check's, see buildSkinCheckEchoSystemInstruction
 * below) — reuses the same Gemini 2.5 Flash client as synthesis (CLAUDE.md:
 * same provider/model already proven for the mobile app's twin chat, no new
 * client). History is capped to the last 20 messages; the leading
 * assistant-only seed message (before the first user turn) is dropped since
 * Gemini's contents array must start on a user turn. Every call sends the
 * full accumulated conversation, not just the latest message — the grounding
 * data lives once in systemInstruction, not repeated per turn.
 */
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
      config: { systemInstruction },
    })
  );

  const text = response.text?.trim();
  if (!text) throw new Error("Gemini returned an empty chat response.");
  return text;
}

export async function getEchoChatReply(
  messages: EchoChatMessage[],
  context: { result: SynthesisResult; vision: VisionResult | null }
): Promise<string> {
  return runEchoChat(messages, buildEchoSystemInstruction(context.result, context.vision));
}

// score scale note: every /skin-check category except hydration is
// concern-framed (higher = more of that concern), matching the raw numbers
// already shown on the dashboard — see lib/skin-check-score.ts.
const SKIN_CHECK_SCORE_SCALE_NOTE = `Score scale: 0-100 per category, matching what the user already sees on their
dashboard. For every category except Hydration, a HIGHER number means MORE of
that concern (e.g. Redness: 70 means more redness detected, not healthier
skin). For Hydration, a HIGHER number means MORE hydrated, healthier skin.`;

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
      ? `composite skin score: ${composite.score}/100 (confidence: ${composite.confidence})
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
