import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRequestRate, consumeDailyQuota, GEMINI_ROUTE_LIMITS } from "@/lib/rate-limit";
import { getSkinCheckChatReply } from "@/lib/gemini";
import { SkinScanScoresSchema } from "@/types/skin-scan";
import { ECHO_REGION_LABELS } from "@/lib/echo-regions";

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

// Matches BandableMetric (lib/skin-check-rules.ts) exactly — z.string() would
// widen topConcerns to string[], which doesn't assign back to ConcernSummary.
const BandableMetricSchema = z.enum([
  "redness", "oiliness", "texture", "blemishes", "hydration", "pigment",
]);

const CompositeScoreSchema = z.object({
  topConcerns: z.array(BandableMetricSchema),
  summaryLine: z.string().max(2000),
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
const RequestSchema = z.object({
  messages: z.array(ChatMessageSchema).max(100),
  answers: z.record(z.string(), z.union([z.string().max(500), z.array(z.string().max(200)).max(20)])),
  scores: SkinScanScoresSchema.nullable(),
  composite: CompositeScoreSchema.nullable(),
  // /echo (Step 4b) — set when a thread is scoped to one face region.
  regionFocus: RegionFocusSchema.nullable().optional(),
});

export async function POST(request: NextRequest) {
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

  try {
    const reply = await getSkinCheckChatReply(parsed.data.messages, {
      answers: parsed.data.answers,
      scores: parsed.data.scores,
      composite: parsed.data.composite,
      regionFocus: parsed.data.regionFocus ?? null,
    });
    return NextResponse.json({ ok: true, reply });
  } catch (err) {
    console.error("skin-check Echo chat failed:", err);
    return NextResponse.json(
      { error: "Couldn't reach Echo. Please try again." },
      { status: 502 }
    );
  }
}
