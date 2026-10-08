import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRequestRate, GEMINI_ROUTE_LIMITS } from "@/lib/rate-limit";
import { consumeEchoQuestion } from "@/lib/echo-quota";
import { AdminNotConfiguredError, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { getSkinCheckChatReply, isGeminiTimeout } from "@/lib/gemini";
import { geminiApiKey } from "@/lib/gemini-key";
import { ECHO_REGIONS, ECHO_REGION_LABELS } from "@/lib/echo-regions";
import { isValidScanId } from "@/lib/s3-key";
import { loadTrustedEchoContext } from "@/lib/echo-trusted-context";
import { checkEchoScan, type EchoScanCheck } from "@/lib/echo-newest-scan";
import { signHistory, verifyHistory } from "@/lib/echo-history-token";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { ageStatus, latestGrant, withLedgerTimeout, type AgeStatus } from "@/app/api/account/_ledger";
import { AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { contextChatEnabled, ECHO_OFF_COPY, echoOn } from "@/lib/context/switch";
import { handleContextChat, recordReferral } from "@/lib/context/chat";
import { loadSplitCheckTurns } from "@/lib/context/chat-turns";
import { checkComparisonHit, comparisonHit, joinedUserTurns, redFlagHit, REFERRAL_COPY, referralCopyFor, UNSUPPORTED_SCRIPT_COPY, unsupportedScript, withoutReferrals } from "@/lib/context/prefilter";
import { buildContextPackage } from "@/lib/context/builder";
import { comparisonAnswer, fallbackLines } from "@/lib/context/answer";
import { ECHO_FALLBACK_LEAD, screenEchoReply } from "@/lib/echo-reply-screen";

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
  let historyOk: boolean;
  let historyError: unknown = null;
  try {
    historyOk = history.length === 0 || (!!historyToken && verifyHistory(uid, scanId, region, history, historyToken));
  } catch (err) {
    historyOk = false;
    historyError = err;
  }

  // GEMINI_BOUNDARY §6, second security review (H20): a red-flag or
  // self-harm message gets the referral before anything that can fail or
  // refuse (Gemini key, history, consent ledger, 18+, quota). Only after auth:
  // nothing is read or spent. The token covers the client's history only if
  // it verified; a forged history is never signed.
  // TD-18 (1), H22: a message in a script Echo does not support gets a fixed
  // reply (with the referral line) the same way: we cannot screen it.
  const fixedKind = redFlagHit(message) ? ("red_flag" as const) : unsupportedScript(message) ? ("unsupported_script" as const) : null;
  if (fixedKind) {
    const fixedReply = fixedKind === "red_flag" ? referralCopyFor(message) : UNSUPPORTED_SCRIPT_COPY;
    // The context path keeps a record of the turn, but only for a user the
    // gates would admit: an under-18, unattested or unconsented user's message
    // is never stored. Any ledger error or timeout means no record; the
    // referral still goes out.
    if (contextChatEnabled()) {
      try {
        const [age, aiShare] = await withLedgerTimeout(Promise.all([ageStatus(uid), latestGrant(uid, "ai_share", AI_SHARE_CONSENT_VERSION)]));
        if (age === "over18" && aiShare === true) await recordReferral(uid, scanId, region, message, fixedKind);
      } catch (err) {
        console.error("skin-check chat: referral not recorded:", (err as Error)?.name ?? "unknown");
      }
    }
    const turns = [...(historyOk ? history : []), { role: "user" as const, text: message }, { role: "echo" as const, text: fixedReply }];
    let referralToken: string | undefined;
    try {
      referralToken = signHistory(uid, scanId, region, turns);
    } catch {
      referralToken = undefined; // not configured: the referral still goes out
    }
    return NextResponse.json({ ok: true, reply: fixedReply, ...(referralToken ? { historyToken: referralToken } : {}) });
  }

  // Safety review 2026-10-09: a red flag split over turns ("i want to" then
  // "die") is caught by the split check (the context path's inside
  // handleContextChat, today's Echo's below), which a refusal (Echo off, the
  // daily limit, the limit store down) would skip. So before any of those
  // refusals the joined turns are checked; a hit gets the referral instead.
  // Unverified client history can only add a referral, never remove one. A
  // read failure lets the refusal go out; its copy carries the referral line.
  const splitReferral = async (): Promise<NextResponse | null> => {
    let joined: string;
    try {
      const prior = contextChatEnabled() ? await loadSplitCheckTurns(uid, scanId, region) : withoutReferrals(history).slice(-19);
      joined = joinedUserTurns(prior, message);
    } catch (err) {
      console.error("skin-check chat: split check before a refusal failed:", (err as Error)?.name ?? "unknown");
      return null;
    }
    if (!redFlagHit(joined)) return null;
    const reply = referralCopyFor(joined);
    const turns = [...(historyOk ? history : []), { role: "user" as const, text: message }, { role: "echo" as const, text: reply }];
    let token: string | undefined;
    try {
      token = signHistory(uid, scanId, region, turns);
    } catch {
      token = undefined; // not configured: the referral still goes out
    }
    return NextResponse.json({ ok: true, reply, ...(token ? { historyToken: token } : {}) });
  };

  // TD-29 (5): the off switch, after the referral (which always goes out) and
  // before anything that reads, spends or calls Gemini.
  if (!echoOn()) {
    return (await splitReferral()) ?? NextResponse.json({ error: ECHO_OFF_COPY, code: "ECHO_OFF" }, { status: 503 });
  }

  if (historyError instanceof AdminNotConfiguredError) return misconfigured(historyError);
  if (historyError) throw historyError;
  if (!historyOk) {
    return NextResponse.json(
      { error: "This conversation couldn't be verified.", code: "CHAT_HISTORY_INVALID" },
      { status: 400 }
    );
  }

  // Today's Echo sends Gemini the signed history without referred exchanges,
  // capped like runEchoChat (20 messages with the new one). The split-message
  // check runs over exactly those turns, before the ledger and the quota.
  const sentHistory = withoutReferrals(history).slice(-19);
  if (!contextChatEnabled() && redFlagHit(joinedUserTurns(sentHistory, message))) {
    const reply = referralCopyFor(joinedUserTurns(sentHistory, message));
    const turns = [...history, { role: "user" as const, text: message }, { role: "echo" as const, text: reply }];
    return NextResponse.json({ ok: true, reply, historyToken: signHistory(uid, scanId, region, turns) });
  }

  // F13 (owner TD-20): only the newest measured check, after the referral
  // (which always goes out) and before the ledger and the quota. Any read
  // error refuses: it never lets an older check through.
  let scanCheck: EchoScanCheck;
  try {
    scanCheck = await checkEchoScan(uid, scanId);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) return misconfigured(err);
    console.error("skin-check chat: newest check unreadable:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
    return NextResponse.json({ error: "Echo can't check your scans right now. Please try again.", code: "CHAT_CHECK_UNAVAILABLE" }, { status: 503 });
  }
  if (scanCheck === "not_newest") {
    return NextResponse.json({ error: "Echo talks about your newest check only.", code: "CHAT_NOT_NEWEST" }, { status: 409 });
  }
  // The check just made whose reading has not landed (or an unreadable one):
  // the same retryable answer as before, and nothing is spent.
  if (scanCheck === "no_reading") {
    return NextResponse.json({ error: "This scan's analysis isn't available yet.", code: "CHAT_ANALYSIS_UNAVAILABLE" }, { status: 409 });
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

  // After the 18+ and consent gates (R-4): a user they refuse is told why,
  // whatever the key. Before the quota, so a misconfiguration spends nothing.
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

  // TD-29 (5): 20 questions per user per day (lib/echo-quota.ts), counted
  // here, after every gate, so a refused question spends nothing.
  const quotaLimited = await consumeEchoQuestion(uid);
  if (quotaLimited) return (await splitReferral()) ?? quotaLimited;

  try {
    // F12 (TD-20): the context-package path is the chat that ships. Today's
    // Echo below runs only behind the switch, in development or test.
    if (contextChatEnabled()) {
      const result = await handleContextChat({ uid, scanId, region, message });
      if (!result.ok) return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
      const turns = [...history, { role: "user" as const, text: message }, { role: "echo" as const, text: result.reply }];
      return NextResponse.json({ ok: true, reply: result.reply, historyToken: signHistory(uid, scanId, region, turns) });
    }

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
    const respond = (reply: string) =>
      NextResponse.json({ ok: true, reply, historyToken: signHistory(uid, scanId, region, [...history, userTurn, { role: "echo", text: reply }]) });
    // Our own band lines for this region (or the whole face) and one uncertainty line.
    const pkg = () =>
      buildContextPackage({
        regionFocus: region,
        message,
        skin: { scores, regionScores, regionLowConfidence: context.regionLowConfidence, pipelineVersion: context.pipelineVersion, schemaVersion: context.schemaVersion },
        answers,
      });

    // Red team (I02, area E): a question about change gets the fixed answer, no Gemini call
    // (GEMINI_BOUNDARY §6b). The same recall-first list as the context path
    // (owner decision TD-16 (2)), plus the change-question patterns: a narrower
    // list lost to paraphrase in three review rounds (final-review recheck), and
    // an invented change must never reach the user. Cost: ordinary questions with
    // "before", "better" or "change" also get the fixed answer (tracker F07, F12).
    if (comparisonHit(message) || checkComparisonHit(message)) return respond(comparisonAnswer(pkg()));

    const geminiReply = await getSkinCheckChatReply([...sentHistory, userTurn], {
      answers,
      scores,
      composite,
      regionFocus: focusScores ? { region: ECHO_REGION_LABELS[region], scores: focusScores } : null,
    });
    // Red team (I02, areas B and E): nothing Gemini says reaches the user or the
    // signed history unchecked. What is signed is what the user saw.
    const verdict = screenEchoReply(geminiReply);
    if (verdict.kind === "referral") return respond(REFERRAL_COPY);
    if (verdict.kind === "blocked") {
      console.warn("skin-check Echo reply blocked:", verdict.check);
      return respond([ECHO_FALLBACK_LEAD, ...fallbackLines(pkg())].join("\n"));
    }
    return respond(geminiReply);
  } catch (err) {
    // Category + message only — never the raw SDK error object, which can
    // carry request/response internals that don't belong in server logs.
    // Name and code only: a Firestore failure in loadTrustedEchoContext
    // carries the doc path (users/<uid>/...) in its message.
    console.error("skin-check Echo chat failed:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
    // F15: a Gemini timeout says so, and asks for another try.
    if (isGeminiTimeout(err)) {
      return NextResponse.json({ error: "Echo took too long to answer. Please try again.", code: "CHAT_TIMEOUT" }, { status: 504 });
    }
    return NextResponse.json(
      { error: "Couldn't reach Echo. Please try again.", code: "CHAT_SERVICE_ERROR" },
      { status: 502 }
    );
  }
}
