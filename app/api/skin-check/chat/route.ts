import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRequestRate, consumeDailyQuota, GEMINI_ROUTE_LIMITS } from "@/lib/rate-limit";
import { getSkinCheckChatReply } from "@/lib/gemini";
import { SkinScanScoresSchema } from "@/types/skin-scan";
import { ECHO_REGION_LABELS } from "@/lib/echo-regions";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";

// Every field below every user-controlled string/array a legitimate client
// could ever send, generous enough that no real usage hits it (the deepest
// case, an /echo thread, is capped client-side at nothing but server-capped
// at the last 20 messages inside runEchoChat — this bound only exists to
// stop a deliberately oversized payload, not to constrain the product).
const MAX_BODY_BYTES = 50_000;

// Pre-login, unauthenticated by design — same as /api/skin-scan and the rest
// of the /skin-check funnel (CLAUDE.md).
const ChatMessageSchema = z.object({
  role: z.enum(["user", "echo"]),
  text: z.string().max(2000),
});

// `region` is interpolated directly into the Gemini system instruction
// (buildSkinCheckEchoSystemInstruction, lib/gemini.ts) on this unauthenticated
// route — z.string() would let a crafted request inject arbitrary text with
// system-prompt authority. EchoPage.tsx only ever sends one of the 4 real
// ECHO_REGION_LABELS values, so an enum of exactly those is the real contract,
// not a widened one.
const RegionFocusSchema = z.object({
  region: z.enum(Object.values(ECHO_REGION_LABELS) as [string, ...string[]]),
  scores: SkinScanScoresSchema,
});

// Quiz answer values also reach the same system instruction, via
// summarizeSkinCheckAnswers — but that function looks up answers[step.id]
// for each of SECTIONS' own known step ids (lib/skin-check-format.ts), so an
// unknown key is simply never read. Only the value side needs bounding.
//
// `composite` (topConcerns/summaryLine) is intentionally NOT accepted from
// the client. It used to be — `summaryLine` was a free-text string
// (`z.string().max(2000)`) interpolated straight into systemInstruction,
// the exact "widen to a string and a crafted request gets system-prompt
// authority" risk this file's own RegionFocusSchema comment warns about for
// `region`. It doesn't need to be trusted at all: summarizeConcerns(scores,
// bands) is a pure function of `scores`, which IS validated (numbers, via
// SkinScanScoresSchema) — so the server recomputes it below instead.
const RequestSchema = z.object({
  messages: z.array(ChatMessageSchema).max(100),
  answers: z.record(z.string(), z.union([z.string().max(500), z.array(z.string().max(200)).max(20)])),
  scores: SkinScanScoresSchema.nullable(),
  // /echo (Step 4b) — set when a thread is scoped to one face region.
  regionFocus: RegionFocusSchema.nullable().optional(),
});

export async function POST(request: NextRequest) {
  // Fails loudly rather than letting getClient() throw deep inside the try
  // block below and get flattened into the same 502 as a real Gemini outage
  // — same reasoning as /api/skin-scan's SCAN_MISCONFIGURED check. An unset
  // key is a deploy misconfiguration (500), not a provider failure (502).
  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not set — refusing to call Gemini.");
    return NextResponse.json(
      { error: "Echo isn't configured yet.", code: "CHAT_MISCONFIGURED" },
      { status: 500 }
    );
  }

  const rateLimited = checkRequestRate(request, GEMINI_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Request too large." }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const parsed = RequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const quotaLimited = consumeDailyQuota(request, GEMINI_ROUTE_LIMITS);
  if (quotaLimited) return quotaLimited;

  const { scores } = parsed.data;
  const composite = scores ? summarizeConcerns(scores, bandScores(scores).bands) : null;

  try {
    const reply = await getSkinCheckChatReply(parsed.data.messages, {
      answers: parsed.data.answers,
      scores,
      composite,
      regionFocus: parsed.data.regionFocus ?? null,
    });
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    // Category + message only — never the raw SDK error object, which can
    // carry request/response internals that don't belong in server logs.
    console.error("skin-check Echo chat failed:", err instanceof Error ? err.message : String(err));
    return NextResponse.json(
      { error: "Couldn't reach Echo. Please try again.", code: "CHAT_SERVICE_ERROR" },
      { status: 502 }
    );
  }
}
