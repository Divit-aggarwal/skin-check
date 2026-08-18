import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRequestRate, consumeDailyQuota, GEMINI_ROUTE_LIMITS } from "@/lib/rate-limit";
import { getSkinCheckChatReply } from "@/lib/gemini";
import { SkinScanScoresSchema } from "@/types/skin-scan";

// Pre-login, unauthenticated by design — same as /api/skin-scan and the rest
// of the /skin-check funnel (CLAUDE.md).
const ChatMessageSchema = z.object({
  role: z.enum(["user", "echo"]),
  text: z.string(),
});

const CompositeScoreSchema = z.object({
  score: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
  summaryLine: z.string(),
});

const RegionFocusSchema = z.object({
  region: z.string(),
  scores: SkinScanScoresSchema,
});

const RequestSchema = z.object({
  messages: z.array(ChatMessageSchema),
  answers: z.record(z.string(), z.union([z.string(), z.array(z.string())])),
  scores: SkinScanScoresSchema.nullable(),
  composite: CompositeScoreSchema.nullable(),
  // /echo (Step 4b) — set when a thread is scoped to one face region.
  regionFocus: RegionFocusSchema.nullable().optional(),
});

export async function POST(request: NextRequest) {
  const rateLimited = checkRequestRate(request, GEMINI_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

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
