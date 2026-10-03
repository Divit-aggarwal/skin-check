import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRequestRate, consumeDailyQuota, GEMINI_ROUTE_LIMITS } from "@/lib/rate-limit";
import { AdminNotConfiguredError, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { getSkinCheckChatReply } from "@/lib/gemini";
import { geminiApiKey } from "@/lib/gemini-key";
import { ECHO_REGIONS, ECHO_REGION_LABELS } from "@/lib/echo-regions";
import { isValidScanId } from "@/lib/s3-key";
import { loadTrustedEchoContext } from "@/lib/echo-trusted-context";
import { signHistory, verifyHistory } from "@/lib/echo-history-token";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { ageStatus, latestGrant, withLedgerTimeout, type AgeStatus } from "@/app/api/account/_ledger";
import { AI_SHARE_CONSENT_VERSION } from "@/lib/consent";

// firebase-admin needs Node APIs and hard-fails on the Edge runtime — same
// explicit opt-in as /api/skin-scan.
export const runtime = "nodejs";

// Every field below every user-controlled string/array a legitimate client
// could ever send, generous enough that no real usage hits it (the deepest
// case, an /echo thread, is capped client-side at nothing but server-capped
// at the last 20 messages inside runEchoChat — this bound only exists to
// stop a deliberately oversized payload, not to constrain the product).
const MAX_BODY_BYTES = 50_000;

// Authenticated (Gate 02): every request must carry a Firebase ID token this
// server verifies itself, same trust boundary as /api/skin-scan.
//
// Client-provided analysis measurements and analysis identity are never
// authoritative. The body names WHICH scan and region to talk about; every
// fact Echo is grounded in (whole-face scores, region scores, quiz answers) is
// loaded server-side under the verified uid (lib/echo-trusted-context.ts).
// `.strict()` so a client still sending `scores`, `regionFocus`, `answers`,
// `uid` or the old `messages` gets a 400 rather than a silent strip.
//
// `region` is an enum of exactly the 4 ECHO_REGIONS keys — its label is
// interpolated into the Gemini system instruction, so it must never be free
// text. `composite` is recomputed server-side from the trusted scores.
const ChatMessageSchema = z.object({
  role: z.enum(["user", "echo"]),
  text: z.string().max(2000),
});

const RequestSchema = z
  .object({
    scanId: z.string().refine(isValidScanId),
    region: z.enum(ECHO_REGIONS),
    message: z.string().trim().min(1).max(2000),
    // Prior turns of this region thread. Never trusted as-is: non-empty
    // history must carry the historyToken the previous reply returned.
    history: z.array(ChatMessageSchema).max(100),
    historyToken: z.string().max(200).nullable().optional(),
  })
  .strict();

// Same shape as /api/skin-scan's: one message and one code for every failure
// mode (missing, malformed, invalid, expired, revoked) — the reason stays in
// the server log. A function because a Response body can only be read once.
const unauthorized = () =>
  NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });

// Names of unset env vars only — never a credential value.
function misconfigured(err: AdminNotConfiguredError) {
  console.error("skin-check chat:", err.message);
  return NextResponse.json({ error: "Authentication is misconfigured.", code: "AUTH_MISCONFIGURED" }, { status: 500 });
}

export async function POST(request: NextRequest) {
  // IP burst protection is in-memory and payload-agnostic, so it shields the
  // token verification below (which touches the network). Not the auth
  // boundary.
  const rateLimited = checkRequestRate(request, GEMINI_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

  // ── Trust boundary ───────────────────────────────────────────────────────
  // Nothing below — the config check, the body, the daily quota, Gemini — is
  // reachable without a verified Firebase ID token. Header shape is checked
  // before any credential is touched.
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) {
    console.warn("skin-check chat: rejected request with no usable Bearer token.");
    return unauthorized();
  }

  let verifiedUid: string;
  try {
    verifiedUid = await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) return misconfigured(err);
    // Not forwarded: the Firebase code tells expired from revoked from forged.
    console.warn(
      "skin-check chat: ID token verification failed:",
      (err as { code?: string })?.code ?? "unknown"
    );
    return unauthorized();
  }
  // The ONLY source of identity for this request — never a uid from the body.
  const uid = verifiedUid;

  // Fails loudly rather than letting getClient() throw deep inside the try
  // block below and get flattened into the same 502 as a real Gemini outage
  // — same reasoning as /api/skin-scan's SCAN_MISCONFIGURED check. An unset
  // key is a deploy misconfiguration (500), not a provider failure (502).
  if (!geminiApiKey()) {
    console.error("Gemini API key is not set (GEMINI_API_KEY, or GEMINI_DEV_API_KEY in development) — refusing to call Gemini.");
    return NextResponse.json(
      { error: "Echo isn't configured yet.", code: "CHAT_MISCONFIGURED" },
      { status: 500 }
    );
  }

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

  const { scanId, region, message, history, historyToken } = parsed.data;

  // Forged prior turns: a non-empty history is only accepted with a token this
  // server signed over exactly those turns, for this uid + scan + region.
  // Checked before the quota so a rejected request doesn't spend it.
  let historyOk: boolean;
  try {
    historyOk = history.length === 0 || (!!historyToken && verifyHistory(uid, scanId, region, history, historyToken));
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) return misconfigured(err);
    throw err;
  }
  if (!historyOk) {
    return NextResponse.json(
      { error: "This conversation couldn't be verified.", code: "CHAT_HISTORY_INVALID" },
      { status: 400 }
    );
  }

  // H02a (D-19): Gemini's terms require 18+. Chat may hard-reject (D-03a:
  // the attestation UI ships with this lane). It fails closed: a ledger it
  // can't read is a 503, never a pass. Before the quota, so a refusal
  // doesn't spend it.
  // H03c: and the user's AI-share consent at the current version (D-16,
  // D-14). Same fail-closed read. LOCAL ONLY until decision 6 and final copy.
  let age: AgeStatus;
  let aiShare: boolean | null;
  try {
    [age, aiShare] = await withLedgerTimeout(Promise.all([ageStatus(uid), latestGrant(uid, "ai_share", AI_SHARE_CONSENT_VERSION)]));
  } catch (err) {
    // Name and code only: Firestore messages embed the doc path (the uid).
    console.error("skin-check chat: consent ledger unavailable:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
    return NextResponse.json(
      { error: "Echo can't check your settings right now. Please try again.", code: "CONSENT_CHECK_UNAVAILABLE" },
      { status: 503 }
    );
  }
  if (age === "under18") {
    return NextResponse.json({ error: "Echo is only available to people aged 18 or over.", code: "UNDER_18" }, { status: 403 });
  }
  if (age === "missing") {
    return NextResponse.json({ error: "Please confirm your age to use Echo.", code: "ATTESTATION_REQUIRED" }, { status: 403 });
  }
  if (aiShare !== true) {
    return NextResponse.json({ error: "Please agree to share your skin check with Echo.", code: "AI_CONSENT_REQUIRED" }, { status: 403 });
  }

  const quotaLimited = consumeDailyQuota(request, GEMINI_ROUTE_LIMITS);
  if (quotaLimited) return quotaLimited;

  try {
    const context = await loadTrustedEchoContext(uid, scanId);
    // Not found, someone else's scanId, or a malformed record all look the
    // same. Retryable: the server write may simply not have landed yet.
    if (!context) {
      return NextResponse.json(
        { error: "This scan's analysis isn't available yet.", code: "CHAT_ANALYSIS_UNAVAILABLE" },
        { status: 409 }
      );
    }

    const { scores, regionScores, answers } = context;
    const composite = summarizeConcerns(scores, bandScores(scores).bands);
    const focusScores = regionScores[region];
    const userTurn = { role: "user" as const, text: message };

    const reply = await getSkinCheckChatReply([...history, userTurn], {
      answers,
      scores,
      composite,
      regionFocus: focusScores ? { region: ECHO_REGION_LABELS[region], scores: focusScores } : null,
    });
    const nextToken = signHistory(uid, scanId, region, [...history, userTurn, { role: "echo", text: reply }]);
    return NextResponse.json({ ok: true, reply, historyToken: nextToken });
  } catch (err) {
    // Category + message only — never the raw SDK error object, which can
    // carry request/response internals that don't belong in server logs.
    // Name and code only: a Firestore failure in loadTrustedEchoContext
    // carries the doc path (users/<uid>/...) in its message.
    console.error("skin-check Echo chat failed:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
    return NextResponse.json(
      { error: "Couldn't reach Echo. Please try again.", code: "CHAT_SERVICE_ERROR" },
      { status: 502 }
    );
  }
}
