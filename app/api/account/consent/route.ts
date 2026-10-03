import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRequestRate, SKIN_SCAN_ROUTE_LIMITS } from "@/lib/rate-limit";
import { AdminNotConfiguredError, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { appendConsent } from "@/app/api/account/_ledger";

export const runtime = "nodejs";

// H03c: the AI-share consent (D-16, D-14 Gemini boundary), recorded in the
// ledger; the chat route reads the newest entry at the current version.
// LOCAL ONLY until the owner answers decision 6 (Gemini key and tier) and
// supplies final copy (decision 7a): the copy is a DRAFT.
// A grant and a withdrawal are both just entries; the newest wins.
const BodySchema = z
  .object({ purpose: z.literal("ai_share"), granted: z.boolean(), version: z.string().max(200) })
  .strict();

const unauthorized = () =>
  NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });

export async function POST(request: NextRequest) {
  const rateLimited = checkRequestRate(request, SKIN_SCAN_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized();

  let uid: string;
  try {
    uid = await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("account/consent:", err.message);
      return NextResponse.json({ error: "Authentication is misconfigured.", code: "AUTH_MISCONFIGURED" }, { status: 500 });
    }
    return unauthorized();
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (parsed.data.version !== AI_SHARE_CONSENT_VERSION) {
    return NextResponse.json({ error: "Please reload and try again.", code: "VERSION_STALE" }, { status: 409 });
  }

  try {
    await appendConsent(uid, {
      purpose: "ai_share",
      granted: parsed.data.granted,
      version: AI_SHARE_CONSENT_VERSION,
      copy: AI_SHARE_CONSENT_COPY,
      scanId: null,
      source: "consent_route",
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("account/consent: ledger unavailable:", (err as Error)?.message ?? "unknown");
    return NextResponse.json({ error: "Please try again.", code: "LEDGER_UNAVAILABLE" }, { status: 500 });
  }
}
