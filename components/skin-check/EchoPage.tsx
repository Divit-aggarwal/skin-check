"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { TypingIndicator } from "@/components/primitives/TypingIndicator";
import { EchoBubble } from "./EchoBubble";
import { EchoMark } from "./EchoMark";
import { useSkinCheckSession, type EchoThread, type EchoThreadMessage } from "@/lib/skin-check-session-context";
import { getSkinCheckChatReply, ApiError } from "@/lib/api";
import { bandScores } from "@/lib/skin-check-rules";
import { ECHO_REGIONS, ECHO_REGION_LABELS, isEchoRegion, type EchoRegion } from "@/lib/echo-regions";
import type { SkinScanScores } from "@/types/skin-scan";
import { useAuth } from "@/lib/auth-context";
import { AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";

// hydration is labeled "Dryness" - see lib/skin-check-skus.ts's METRIC_LABELS
// comment. Same reasoning, same relabel, kept in sync across both sites.
const CATEGORY_LABELS: Record<keyof SkinScanScores, string> = {
  redness: "Redness",
  oiliness: "Oiliness",
  texture: "Texture",
  pores: "Pores",
  blemishes: "Blemishes",
  hydration: "Dryness",
  pigment: "Pigment",
};
const CATEGORY_KEYS = Object.keys(CATEGORY_LABELS) as (keyof SkinScanScores)[];

const RETRYABLE_ERROR_MESSAGE = "Couldn't reach Echo just now.";
const CONFIG_ERROR_MESSAGE = "Echo isn't set up yet — this isn't something retrying will fix.";

// Privacy gates on the chat route (H02a, H03c). Retrying can't fix these, so
// they get their own message and no Retry button.
const GATE_MESSAGES: Record<string, string> = {
  UNDER_18: "Echo is only available to people aged 18 or over.",
  ATTESTATION_REQUIRED: "Please confirm your age in Skin Check before using Echo.",
};
const NOT_RETRYABLE = new Set(["CHAT_MISCONFIGURED", "UNDER_18", "ATTESTATION_REQUIRED", "AI_CONSENT_REQUIRED"]);

function greetingFor(region: EchoRegion): string {
  return `Hey — let's talk about your ${ECHO_REGION_LABELS[region].toLowerCase()}. What would you like to know?`;
}

let messageSeq = 0;

// /echo (Step 4b) — replaces the old modal EchoChat with a dedicated page:
// one thread per real skin-scan region, tab-switched (not route-switched,
// so switching never remounts and each thread's history lives only in
// SkinCheckSessionProvider — see that file's isolation contract). Session
// data comes from the same provider, mirrored in from SkinCheckDashboard on
// scan success; if it's empty (fresh tab, or a refresh — session is
// deliberately in-memory only, see Step 4b spec) there's nothing to ground
// Echo in, so this shows a way back to /skin-check instead of a blind chat.
export function EchoPage() {
  const searchParams = useSearchParams();
  const { session, threads, setThread } = useSkinCheckSession();

  const regionParam = searchParams.get("region");
  const [activeRegion, setActiveRegion] = useState<EchoRegion>(isEchoRegion(regionParam) ? regionParam : "forehead");
  const [draft, setDraft] = useState("");
  const [sendingRegion, setSendingRegion] = useState<EchoRegion | null>(null);
  // Transient, not part of `threads` — an error is UI state about a failed
  // request, not a message Echo said. The old version pushed a role:"echo"
  // error string into thread history, which meant it got replayed back to
  // Gemini as a model turn on the next send (context pollution) and gave the
  // user no way to retry without retyping. `retryBefore` (the thread and its
  // historyToken from BEFORE the failed turn) plus `retryMessage` are exactly
  // what failed to send, so Retry resends them verbatim instead of
  // reconstructing them (which could silently drop or reorder the failed turn).
  const [sendError, setSendError] = useState<{
    region: EchoRegion;
    retryBefore: EchoThread;
    retryMessage: EchoThreadMessage;
    retryable: boolean;
    code: string | undefined;
  } | null>(null);
  const { user } = useAuth();
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentFailed, setConsentFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Aborts any in-flight /api/skin-check/chat request when this page
  // unmounts (user taps "Back to Skin Check", or navigates away entirely,
  // while Echo is still thinking) — without this, the fetch resolves after
  // unmount and calls setThread/setSendError on a component that's
  // gone. One controller at a time matches sendingRegion's own one-in-flight
  // invariant (sendToEcho refuses to start a second request).
  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => abortControllerRef.current?.abort();
  }, []);

  const messages = threads[activeRegion].messages;
  const isThinking = sendingRegion === activeRegion;
  const activeError = sendError?.region === activeRegion ? sendError : null;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking, activeError]);

  if (!session) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 bg-surface px-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-blush-soft">
          <EchoMark className="h-5 w-5" />
        </span>
        <p className="text-sm text-text/70">
          We lost your check-in — Echo needs your Skin Check results to talk this through, and that session
          doesn&apos;t survive a refresh yet.
        </p>
        <Link
          href="/skin-check"
          className="h-12 rounded-full bg-text px-6 text-sm font-medium leading-[3rem] text-white transition-colors hover:bg-text/85"
        >
          Back to Skin Check
        </Link>
      </div>
    );
  }

  const regionScores = session.result.region_scores[activeRegion];
  const regionBands = regionScores ? bandScores(regionScores).bands : null;
  const activeSession = session; // fresh const so the closure below keeps the non-null narrowing

  // Shared by a fresh send and a Retry — `before` is the thread (and its
  // historyToken) prior to `userMessage`, which the caller has already shown,
  // so this never re-adds a user message and never duplicates a request:
  // sendingRegion gates both entry points the same way.
  async function sendToEcho(region: EchoRegion, before: EchoThread, userMessage: EchoThreadMessage) {
    if (sendingRegion) return;
    setSendError(null);
    setSendingRegion(region);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      // Only the scan's id and the thread go up — the server loads this
      // scan's scores and answers itself.
      const history = before.messages.map((m) => ({ role: m.role, text: m.text }));
      const { reply, historyToken } = await getSkinCheckChatReply(
        activeSession.scanId,
        region,
        history,
        before.historyToken,
        userMessage.text,
        controller.signal
      );
      if (controller.signal.aborted) return; // unmounted mid-request — nothing left to update
      setThread(region, {
        messages: [...before.messages, userMessage, { id: messageSeq++, role: "echo", text: reply }],
        historyToken,
      });
    } catch (err) {
      if (controller.signal.aborted) return;
      console.error("Echo region chat failed:", err instanceof Error ? err.message : err);
      const code = err instanceof ApiError ? err.code : undefined;
      // The server no longer vouches for this thread's history (e.g. a key
      // rotation) — start the thread over from the failed turn so Retry can
      // succeed instead of failing the same way forever.
      const retryBefore = code === "CHAT_HISTORY_INVALID" ? { messages: [], historyToken: null } : before;
      if (retryBefore !== before) setThread(region, { messages: [userMessage], historyToken: null });
      setSendError({ region, retryBefore, retryMessage: userMessage, retryable: !NOT_RETRYABLE.has(code ?? ""), code });
    } finally {
      if (!controller.signal.aborted) setSendingRegion(null);
      if (abortControllerRef.current === controller) abortControllerRef.current = null;
    }
  }

  function handleSend() {
    const text = draft.trim();
    if (!text || sendingRegion) return;

    const region = activeRegion;
    const before = threads[region];
    const userMessage: EchoThreadMessage = { id: messageSeq++, role: "user", text };
    setThread(region, { ...before, messages: [...before.messages, userMessage] });
    setDraft("");
    void sendToEcho(region, before, userMessage);
  }

  function handleRetry() {
    if (!activeError || sendingRegion) return;
    void sendToEcho(activeError.region, activeError.retryBefore, activeError.retryMessage);
  }

  // H03c: the server refused because there is no AI-share consent. Record the
  // user's yes, then resend the turn that was refused. LOCAL ONLY for now:
  // DRAFT copy (decision 7b), Gemini key pending (decision 6).
  async function grantAiShare() {
    if (!activeError || consentSaving) return;
    if (!user) {
      setConsentFailed(true);
      return;
    }
    setConsentSaving(true);
    setConsentFailed(false);
    try {
      const res = await fetch("/api/account/consent", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
        body: JSON.stringify({ purpose: "ai_share", granted: true, version: AI_SHARE_CONSENT_VERSION }),
      });
      if (res.ok) void sendToEcho(activeError.region, activeError.retryBefore, activeError.retryMessage);
      else setConsentFailed(true);
    } catch (err) {
      console.error("AI-share consent not recorded:", err instanceof Error ? err.message : err);
      setConsentFailed(true);
    } finally {
      setConsentSaving(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-surface px-6 pb-6 pt-6">
      <div className="flex shrink-0 items-center gap-3">
        <Link
          // K-1: a hand-off from the dashboard goes back there, not to an old results screen.
          href={session.fromDashboard ? "/dashboard" : "/skin-check"}
          aria-label={session.fromDashboard ? "Back to your skin checks" : "Back to Skin Check"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text/60 transition-opacity hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <p className="text-sm font-semibold text-text">Echo</p>
      </div>

      {/* Underline tab treatment, matching EchoTwin's category strip — not a
          filled pill (same "not a SaaS chatbot" reasoning as EchoBubble). */}
      <div
        className="mt-4 flex shrink-0 gap-4 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,transparent,black_12px,black_calc(100%-12px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        role="tablist"
        aria-label="Skin regions"
      >
        {ECHO_REGIONS.map((region) => {
          const active = region === activeRegion;
          return (
            <button
              key={region}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveRegion(region)}
              className="flex shrink-0 items-center px-1 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span
                className={`border-b-2 pb-1 text-label uppercase tracking-label transition-colors duration-150 ${
                  active ? "border-text text-text" : "border-transparent text-muted-foreground"
                }`}
              >
                {ECHO_REGION_LABELS[region]}
              </span>
            </button>
          );
        })}
      </div>

      {regionBands && (
        <div className="mt-4 shrink-0 rounded-2xl bg-canvas p-4">
          <div className="flex items-center justify-between">
            <p className="text-label font-semibold uppercase tracking-label text-muted-foreground">
              {ECHO_REGION_LABELS[activeRegion]} readings
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {CATEGORY_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-text/60">{CATEGORY_LABELS[key]}</span>
                <span className="text-xs font-medium text-blush">
                  {key === "pores" ? "Not measured yet" : regionBands[key]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="mt-4 min-h-0 flex-1 space-y-5 overflow-y-auto">
        {messages.length === 0 && <EchoBubble message={greetingFor(activeRegion)} />}
        {messages.map((m) =>
          m.role === "echo" ? (
            // Plain left-aligned body copy, no bubble/avatar chrome — same
            // "doesn't read as a chatbot" intent as EchoBubble, sized for a
            // running multi-turn reply rather than EchoBubble's single
            // editorial question/prompt treatment (which EchoBubble is now
            // used for elsewhere — see SkinCheckFlow.tsx).
            <p key={m.id} className="max-w-[90%] text-body leading-relaxed text-text">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-text px-4 py-3">
                <p className="text-[1.0625rem] leading-snug text-white">{m.text}</p>
              </div>
            </div>
          )
        )}
        <AnimatePresence initial={false}>
          {isThinking && (
            <TypingIndicator key="thinking" className="rounded-tl-sm bg-blush-soft text-blush" />
          )}
        </AnimatePresence>
        {activeError?.code === "AI_CONSENT_REQUIRED" && (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-2xl bg-blush-soft px-4 py-3">
            <p className="text-body text-text">{AI_SHARE_CONSENT_COPY}</p>
            <button
              type="button"
              onClick={() => void grantAiShare()}
              disabled={consentSaving || sendingRegion !== null}
              className="text-label font-semibold uppercase tracking-label text-blush underline underline-offset-2 disabled:opacity-50"
            >
              I agree
            </button>
            {consentFailed && (
              <p className="text-sm text-text/70">We couldn&apos;t save that. Please reload the page and try again.</p>
            )}
          </div>
        )}
        {activeError && activeError.code !== "AI_CONSENT_REQUIRED" && (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-2xl bg-blush-soft px-4 py-3">
            <p className="text-body text-text">
              {GATE_MESSAGES[activeError.code ?? ""] ?? (activeError.retryable ? RETRYABLE_ERROR_MESSAGE : CONFIG_ERROR_MESSAGE)}
            </p>
            {activeError.retryable && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={sendingRegion !== null}
                className="text-label font-semibold uppercase tracking-label text-blush underline underline-offset-2 disabled:opacity-50"
              >
                Retry
              </button>
            )}
          </div>
        )}
      </div>

      <div className="mt-4 flex shrink-0 items-center gap-2 pb-safe-bottom">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={`Ask Echo about your ${ECHO_REGION_LABELS[activeRegion].toLowerCase()}...`}
          aria-label={`Ask Echo about your ${ECHO_REGION_LABELS[activeRegion].toLowerCase()}`}
          // Matches ChatMessageSchema's text bound (app/api/skin-check/chat/
          // route.ts) — caps client-side so a too-long message fails to type
          // rather than failing at send with a 400 the UI can't usefully retry.
          maxLength={2000}
          disabled={sendingRegion !== null}
          className="h-12 flex-1 rounded-full border border-border bg-canvas px-4 text-sm text-text outline-none focus:border-blush/40 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sendingRegion !== null || !draft.trim()}
          aria-label="Send"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-text text-white transition-colors hover:bg-text/85 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path
              d="M2 9h14M9 2l7 7-7 7"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
