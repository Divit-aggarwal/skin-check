"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft, ChevronRight, SendHorizontal } from "lucide-react";
import { TypingIndicator } from "@/components/primitives/TypingIndicator";
import { EchoBubble } from "./EchoBubble";
import { EchoMark } from "./EchoMark";
import { ECHO_COPY as E } from "./echoCopy";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { PhotoCheckLine, ReadingRows } from "@/components/dashboard/CheckReadings";
import { formatDate } from "@/components/dashboard/format";
import { loadDashboard } from "@/components/dashboard/data";
import { newestEchoSession } from "@/components/dashboard/echo-session";
import { readingsOf, toDate } from "@/components/dashboard/state";
import { btnPrimary, EmptyState, ErrorState, eyebrow, LoadingState, page, PageHeader, ReloadButton } from "@/components/ui/page";import { useSkinCheckSession, type EchoThread, type EchoThreadMessage } from "@/lib/skin-check-session-context";
import { getSkinCheckChatReply, ApiError } from "@/lib/api";
import { ECHO_REGIONS, ECHO_REGION_LABELS, isEchoRegion, type EchoRegion } from "@/lib/echo-regions";
import { useAuth } from "@/lib/auth-context";
import { AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";

const RETRYABLE_ERROR_MESSAGE = "Couldn't reach Echo just now. Please try again.";
const CONFIG_ERROR_MESSAGE = "Echo isn't set up yet — this isn't something retrying will fix.";

// Privacy gates on the chat route (H02a, H03c). Retrying can't fix these, so
// they get their own message and no Retry button.
const GATE_MESSAGES: Record<string, string> = {
  UNDER_18: "Echo is only available to people aged 18 or over.",
  ATTESTATION_REQUIRED: "Please confirm your age in Skin Check before using Echo.",
  // F15: Gemini ran out of time; the Retry button stays (the code is retryable).
  CHAT_TIMEOUT: "Echo took too long to answer. Please try again.",
  // F13: a newer check exists; Echo talks about that one (open it from the dashboard).
  CHAT_NOT_NEWEST: "Echo talks about your newest check only. Open it from your dashboard.",
};
const NOT_RETRYABLE = new Set(["CHAT_MISCONFIGURED", "UNDER_18", "ATTESTATION_REQUIRED", "AI_CONSENT_REQUIRED", "CHAT_NOT_NEWEST"]);

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
  const { user, loading: authLoading } = useAuth();
  const [consentSaving, setConsentSaving] = useState(false);
  const [consentFailed, setConsentFailed] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  // G03: /echo opened from the nav, or after a refresh, builds the session for
  // the newest reading itself (the same helper as Home's Chat with Echo).
  const [start, setStart] = useState<"loading" | "none" | "error">("loading");
  const { setSession } = useSkinCheckSession();
  useEffect(() => {
    if (session || !user) return;
    let active = true;
    setStart("loading");
    loadDashboard(user.uid).then(
      (data) => {
        if (!active) return;
        const next = newestEchoSession(user.uid, data);
        if (next) setSession(next);
        else setStart("none");
      },
      (error) => {
        console.error("[echo] newest check not loaded", error instanceof Error ? error.name : error);
        if (active) setStart("error");
      }
    );
    return () => {
      active = false;
    };
  }, [session, user, setSession]);

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
      <main className={page}>
        <PageHeader title={E.title} />
        {authLoading || (user && start === "loading") ? (
          <LoadingState label={E.loading} blocks={["h-24", "h-64"]} />
        ) : !user ? (
          <EmptyState body={E.signedOut} action={<Link href="/account" className={btnPrimary}>{E.signIn}</Link>} />
        ) : start === "error" ? (
          <ErrorState body={E.loadFailed} action={<ReloadButton label={E.tryAgain} />} />
        ) : (
          <EmptyState body={C.chat.needsReading} action={<Link href="/skin-check" className={btnPrimary}>{E.newCheck}</Link>} />
        )}
      </main>
    );
  }

  const readings = readingsOf(session.result as unknown as Record<string, unknown>);
  const record = session.result as unknown as Record<string, unknown>;
  const date = formatDate(toDate(record.createdAt));
  const verdict = (record.captureQuality as { verdict?: unknown } | undefined)?.verdict;
  const photoCheck = verdict === "pass" || verdict === "override" || verdict === "unchecked" ? verdict : null;
  const area = readings.areas.find((a) => a.region === activeRegion);
  const areaLabel = ECHO_REGION_LABELS[activeRegion].toLowerCase();
  const activeSession = session; // fresh const so the closure below keeps the non-null narrowing

  // The readings of the check being discussed, with the fixed line (TD-25 (4), TD-24 (1)).
  const panel = (
    <div className="flex flex-col gap-4">
      <div>
        <p className={`${eyebrow} mb-1`}>{E.talkingAbout}</p>
        <p className="font-display text-xl font-semibold">{E.checkFrom(date)}</p>
      </div>
      {photoCheck && <PhotoCheckLine text={C.photoCheck[photoCheck]} />}
      <p className="rounded-2xl bg-brand-mist px-4 py-3 text-sm text-brand-ink">{C.history.pastLine}</p>
      <div>
        <h3 className="mb-1 font-semibold">{E.wholeFace}</h3>
        <ReadingRows bands={readings.bands} />
      </div>
      {area && (
        <div>
          <h3 className="mb-1 font-semibold">{area.label}</h3>
          <ReadingRows bands={area.bands} />
        </div>
      )}
      <Link href={`/checks/${encodeURIComponent(session.scanId)}`} className="inline-flex min-h-11 items-center gap-1 font-medium text-brand-forest underline-offset-4 hover:underline">
        {E.openCheck}
        <ChevronRight aria-hidden size={16} />
      </Link>
    </div>
  );

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
    // The chat fills the screen above the phone's bottom bar; on a wide screen
    // the readings sit beside it (TD-25 (1), from direction B).
    <main className="mx-auto flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] w-full max-w-[1200px] flex-col sm:h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6 lg:border-r lg:border-brand-line lg:px-8">
        <header className="flex shrink-0 items-start gap-2 pt-4 sm:pt-8">
          <Link
            // K-1: a hand-off from the dashboard goes back there, not to an old results screen.
            href={session.fromDashboard ? "/dashboard" : "/skin-check"}
            aria-label={session.fromDashboard ? "Back to your skin checks" : "Back to Skin Check"}
            className="-ml-2 grid size-11 shrink-0 place-items-center rounded-full text-brand-muted hover:bg-brand-linen hover:text-brand-ink"
          >
            <ChevronLeft aria-hidden className="h-5 w-5" />
          </Link>
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 font-display text-[28px] font-semibold leading-tight sm:text-4xl">
              <span aria-hidden className="grid size-9 place-items-center rounded-full bg-brand-mist">
                <EchoMark className="h-4 w-4" />
              </span>
              {E.title}
            </h1>
            <p className="mt-1 text-sm text-brand-muted">{E.intro(date)}</p>
          </div>
        </header>

        <div role="group" aria-label={E.areaPicker} className="mt-4 flex shrink-0 gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
          {ECHO_REGIONS.map((region) => (
            <button
              key={region}
              type="button"
              aria-pressed={region === activeRegion}
              onClick={() => setActiveRegion(region)}
              className="min-h-11 shrink-0 rounded-full border border-brand-line bg-brand-paper px-4 text-sm font-medium aria-pressed:border-brand-action aria-pressed:bg-brand-action aria-pressed:text-white"
            >
              {ECHO_REGION_LABELS[region]}
            </button>
          ))}
        </div>

        {/* Phone and tablet: the same readings, folded away until asked for. */}
        <details className="mt-3 shrink-0 rounded-2xl bg-brand-linen px-4 py-2 lg:hidden">
          <summary className="flex min-h-11 cursor-pointer items-center font-medium">{E.readingsSummary}</summary>
          <div className="pb-3 pt-2">{panel}</div>
        </details>

        <div ref={scrollRef} role="log" aria-live="polite" className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && <EchoBubble message={greetingFor(activeRegion)} />}
        {messages.map((m) =>
          m.role === "echo" ? (
            // Plain left-aligned body copy, no bubble/avatar chrome — same
            // "doesn't read as a chatbot" intent as EchoBubble, sized for a
            // running multi-turn reply rather than EchoBubble's single
            // editorial question/prompt treatment (which EchoBubble is now
            // used for elsewhere — see SkinCheckFlow.tsx).
            <p key={m.id} className="max-w-[90%] rounded-2xl rounded-bl-md bg-brand-linen px-4 py-3 leading-relaxed text-brand-ink">
              {m.text}
            </p>
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-br-md bg-brand-action px-4 py-3">
                <p className="leading-snug text-white">{m.text}</p>
              </div>
            </div>
          )
        )}
        <AnimatePresence initial={false}>
          {isThinking && (
            <TypingIndicator key="thinking" className="rounded-tl-sm bg-brand-linen text-brand-muted" />
          )}
        </AnimatePresence>
        {activeError?.code === "AI_CONSENT_REQUIRED" && (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-2xl border border-brand-line bg-brand-linen px-4 py-3">
            <p className="text-body text-text">{AI_SHARE_CONSENT_COPY}</p>
            <button
              type="button"
              onClick={() => void grantAiShare()}
              disabled={consentSaving || sendingRegion !== null}
              className="inline-flex min-h-11 items-center font-semibold text-brand-forest underline underline-offset-2 disabled:opacity-50"
            >
              I agree
            </button>
            {consentFailed && (
              <p className="text-sm text-text/70">We couldn&apos;t save that. Please reload the page and try again.</p>
            )}
          </div>
        )}
        {activeError && activeError.code !== "AI_CONSENT_REQUIRED" && (
          <div role="alert" className="flex flex-col items-start gap-2 rounded-2xl border border-brand-line bg-brand-linen px-4 py-3">
            <p className="text-body text-text">
              {GATE_MESSAGES[activeError.code ?? ""] ?? (activeError.retryable ? RETRYABLE_ERROR_MESSAGE : CONFIG_ERROR_MESSAGE)}
            </p>
            {activeError.retryable && (
              <button
                type="button"
                onClick={handleRetry}
                disabled={sendingRegion !== null}
                className="inline-flex min-h-11 items-center font-semibold text-brand-forest underline underline-offset-2 disabled:opacity-50"
              >
                Retry
              </button>
            )}
          </div>
        )}
        </div>

        <form
          className="flex shrink-0 items-center gap-2 border-t border-brand-line py-3"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={E.placeholder(areaLabel)}
            aria-label={E.placeholder(areaLabel)}
            // Matches ChatMessageSchema's text bound (app/api/skin-check/chat/
            // route.ts) — caps client-side so a too-long message fails to type
            // rather than failing at send with a 400 the UI can't usefully retry.
            maxLength={2000}
            disabled={sendingRegion !== null}
            className="h-12 min-w-0 flex-1 rounded-full border border-brand-line bg-brand-paper px-4 text-base text-brand-ink disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={sendingRegion !== null || !draft.trim()}
            aria-label={E.send}
            className="grid size-12 shrink-0 place-items-center rounded-full bg-brand-action text-white hover:bg-brand-action-hover disabled:bg-brand-linen2 disabled:text-brand-muted"
          >
            <SendHorizontal aria-hidden size={20} />
          </button>
        </form>
      </div>

      <aside aria-label={E.readingsSummary} className="hidden min-h-0 overflow-y-auto px-6 py-8 lg:block">
        {panel}
      </aside>
    </main>
  );
}
