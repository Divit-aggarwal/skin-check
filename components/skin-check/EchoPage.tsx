"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, MotionConfig } from "framer-motion";
import { AlertCircle, BarChart3, BookOpen, Camera, ChevronDown, ChevronLeft, ChevronRight, ListChecks, MessageCircle, Sparkles, Stethoscope, UserRound } from "lucide-react";
import { TypingIndicator } from "@/components/primitives/TypingIndicator";
import { ECHO_COPY as E } from "./echoCopy";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { PhotoCheckLine, ReadingsTable } from "@/components/dashboard/CheckReadings";
import { formatDate } from "@/components/dashboard/format";
import { loadDashboard } from "@/components/dashboard/data";
import { newestEchoSession } from "@/components/dashboard/echo-session";
import { hasQuestionAnswers, safetyQuestionsAnswered } from "@/lib/skin-check-validation";
import { QUESTIONS_COPY as Q } from "./questionsCopy";
import { readingsOf, toDate } from "@/components/dashboard/state";
import { AccountButton, btnGhost, btnPrimary, btnSecondary, card, EmptyState, SignedOutCard, ErrorState, eyebrow, lead, LoadingState, page, PageHeader, phoneChrome, ReloadButton, textLink, tintCard } from "@/components/ui/page";
import { ChatBubble, ChatInput, Chip, EchoAvatar, IconWell, SuggestionChips, Wordmark } from "@/components/ui/kit";
import { useSkinCheckSession, type EchoThread, type EchoThreadMessage } from "@/lib/skin-check-session-context";
import { getEchoOpening, getSkinCheckChatReply, ApiError, type ShownProduct } from "@/lib/api";
import { ProductCards, splitDoctorLine, splitRedFlagNote } from "./ProductCards";
import { COPY } from "@/lib/rules/settings";
import { pickStarters, STARTER_POOL } from "./echoStarters";
import { ECHO_REGIONS, ECHO_REGION_LABELS, isEchoRegion, type EchoRegion } from "@/lib/echo-regions";
import { useAuth } from "@/lib/auth-context";
import { AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { REFERRAL_LINE } from "@/lib/context/prefilter";

// The helpline numbers in Echo's fixed replies (lib/context/prefilter.ts) as
// tap-to-call links. Gemini's own answers never carry a number (the
// validator refuses one), so only fixed text is ever linked.
const PHONE = /(1800-89-14416|\b14416\b|\b112\b)/;
function withPhoneLinks(text: string) {
  return text.split(PHONE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={`tel:${part.replace(/-/g, "")}`} className="font-semibold underline underline-offset-2">
        {part}
      </a>
    ) : (
      part
    )
  );
}

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
  // TD-29 (5): Echo switched off, or this user's questions for today used up.
  // Both carry the help line: the user cannot write to Echo for now.
  ECHO_OFF: `${E.off} ${REFERRAL_LINE}`,
  ECHO_DAILY_LIMIT: `${E.dailyLimit} ${REFERRAL_LINE}`,
  // The limit store could not be read: retryable, and it happens exactly when the
  // split red-flag check cannot read turns either, so the help line goes with it.
  ECHO_LIMIT_UNAVAILABLE: `${E.limitUnavailable} ${REFERRAL_LINE}`,
};
const NOT_RETRYABLE = new Set(["CHAT_MISCONFIGURED", "UNDER_18", "ATTESTATION_REQUIRED", "AI_CONSENT_REQUIRED", "CHAT_NOT_NEWEST", "ECHO_OFF", "ECHO_DAILY_LIMIT"]);

function greetingFor(region: EchoRegion): string {
  return `Hey — let's talk about your ${ECHO_REGION_LABELS[region].toLowerCase()}. What would you like to know?`;
}

let messageSeq = 0;

// Mockup 18's three "what Echo does" tiles, in the order of E.does.
const DOES_ICONS = [BookOpen, MessageCircle, UserRound] as const;
// Mockup 18's quick actions, only to pages that exist (no product list page yet).
const QUICK = [
  { href: "/skin-check", icon: Camera, copy: E.quick.check, well: "bg-brand-100 text-brand-700" },
  { href: "/routine", icon: ListChecks, copy: E.quick.routine, well: "bg-concern-texture-soft text-concern-texture" },
  { href: "/checks", icon: BarChart3, copy: E.quick.checks, well: "bg-concern-pigment-soft text-concern-pigment" },
] as const;
const TYPING = "rounded-card rounded-bl-md border border-brand-border bg-brand-surface text-brand-text-muted shadow-none";

// /echo: one thread per face area, switched in place (no remount), each held
// only in SkinCheckSessionProvider (in memory).
// TD-34: Echo's opening suggestion for the check, fetched once per check on
// this page (the server keeps it, so a reload costs nothing). "none" covers
// every refusal (switch off, limit, no answers): the plain greeting stays.
// "error" is a failure worth one more try (timeout, network, a 5xx).
const OPENING_NONE = new Set(["OPENING_UNAVAILABLE", "ECHO_PRODUCTS_OFF", "ECHO_OFF", "ECHO_DAILY_LIMIT", "CHAT_NOT_NEWEST", "UNDER_18", "ATTESTATION_REQUIRED", "CHAT_MISCONFIGURED", "CHAT_ANALYSIS_UNAVAILABLE"]);
type Opening =
  | { status: "loading" | "none" | "consent" | "error"; scanId: string }
  | { status: "done"; scanId: string; reply: string; products: ShownProduct[] };

export function EchoPage({ echoOn = true, productsOn = true }: { echoOn?: boolean; productsOn?: boolean } = {}) {
  const searchParams = useSearchParams();
  const { session, threads, setThread } = useSkinCheckSession();

  const regionParam = searchParams.get("region");
  const [activeRegion, setActiveRegion] = useState<EchoRegion>(isEchoRegion(regionParam) ? regionParam : "forehead");
  const activeRegionRef = useRef(activeRegion);
  activeRegionRef.current = activeRegion;
  const [draft, setDraft] = useState("");
  const [sendingRegion, setSendingRegion] = useState<EchoRegion | null>(null);
  // UI state, never part of `threads`: an error is not something Echo said and
  // must not reach Gemini as a turn. Retry resends `retryBefore` (the thread
  // and token before the failed turn) and `retryMessage` exactly.
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

  const [opening, setOpening] = useState<Opening | null>(null);
  // The same "answered enough" rule as the server (F11), so a partly answered check asks for nothing.
  const openingWanted = !!session && !!user && echoOn && productsOn && safetyQuestionsAnswered(session.answers);
  const openingScanId = session?.scanId;
  const loadOpening = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!openingWanted || !openingScanId) return;
    const controller = new AbortController();
    const load = () => {
      setOpening({ status: "loading", scanId: openingScanId });
      getEchoOpening(openingScanId, activeRegionRef.current, controller.signal).then(
        (o) => setOpening({ status: "done", scanId: openingScanId, ...o }),
        (err) => {
          if (controller.signal.aborted) return;
          const code = err instanceof ApiError ? err.code : undefined;
          const status = code === "AI_CONSENT_REQUIRED" ? "consent" : code && OPENING_NONE.has(code) ? "none" : "error";
          setOpening({ status, scanId: openingScanId });
        }
      );
    };
    loadOpening.current = load;
    load();
    return () => {
      controller.abort();
      loadOpening.current = null;
    };
  }, [openingWanted, openingScanId]);
  const shownOpening = opening && opening.scanId === openingScanId ? opening : null;

  // Owner decision 2026-10-11: starter questions, a new set on each visit and after each answer.
  const askedKey = Object.values(threads).flatMap((t) => t.messages.filter((m) => m.role === "user").map((m) => m.text)).join("\n");
  const answerCount = threads[activeRegion].messages.filter((m) => m.role === "echo").length;
  const [starters, setStarters] = useState<string[]>([]);
  useEffect(() => {
    setStarters(pickStarters({ productsOn, asked: askedKey ? askedKey.split("\n") : [] }));
  }, [productsOn, askedKey, answerCount]);

  // TD-47: a starter tapped on Home arrives as ?ask=. Only an exact pool
  // question is sent (never any other text from a link), only once, and only
  // where Echo's own starters would show; the consent and limit gates still
  // apply on the server. The parameter is then removed from the address.
  const askParam = searchParams.get("ask");
  const askedFromHome = useRef(false);
  const handleSendRef = useRef<(text: string) => void>(() => undefined);
  useEffect(() => {
    if (askedFromHome.current || !askParam || !session || !echoOn) return;
    askedFromHome.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("ask");
    window.history.replaceState(window.history.state, "", url);
    const pool = productsOn ? Object.values(STARTER_POOL).flat() : Object.entries(STARTER_POOL).filter(([g]) => g !== "products").flatMap(([, q]) => q);
    // Only a question Home itself handed over in this tab (security review TD-47): a link from elsewhere sends nothing.
    let handed: string | null = null;
    try {
      handed = sessionStorage.getItem("home-v2:ask");
      sessionStorage.removeItem("home-v2:ask");
    } catch {
      /* storage blocked: nothing is sent */
    }
    if (handed === askParam && pool.includes(askParam) && safetyQuestionsAnswered(session.answers)) handleSendRef.current(askParam);
  }, [askParam, session, echoOn, productsOn]);

  const messages = threads[activeRegion].messages;
  const isThinking = sendingRegion === activeRegion;
  const activeError = sendError?.region === activeRegion ? sendError : null;

  useEffect(() => {
    // TD-34: before the first question, the opening is read from its first line, not its last card.
    const top = messages.length === 0 && !isThinking && !activeError ? 0 : scrollRef.current?.scrollHeight ?? 0;
    const still = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    scrollRef.current?.scrollTo({ top, behavior: still ? "auto" : "smooth" });
  }, [messages, isThinking, activeError, shownOpening]);

  if (!session) {
    return (
      <main className={page}>
        <PageHeader title={E.title} />
        {authLoading || (user && start === "loading") ? (
          <LoadingState label={E.loading} blocks={["h-24", "h-64"]} />
        ) : !user ? (
          <SignedOutCard body={E.signedOut} />
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
      <p className="rounded-card bg-brand-100 px-4 py-3 text-sm text-brand-text">{C.history.pastLine}</p>
      {/* TD-40: the same table as the results, Home and an opened check. */}
      <ReadingsTable view={readings} />
      <Link href={`/checks/${encodeURIComponent(session.scanId)}`} className={textLink}>
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
      const { reply, historyToken, products } = await getSkinCheckChatReply(
        activeSession.scanId,
        region,
        history,
        before.historyToken,
        userMessage.text,
        controller.signal
      );
      if (controller.signal.aborted) return; // unmounted mid-request — nothing left to update
      setThread(region, {
        messages: [...before.messages, userMessage, { id: messageSeq++, role: "echo", text: reply, ...(products.length > 0 ? { products } : {}) }],
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

  function handleSend(typed = draft) {
    const text = typed.trim();
    if (!text || sendingRegion) return;

    const region = activeRegion;
    const before = threads[region];
    const userMessage: EchoThreadMessage = { id: messageSeq++, role: "user", text };
    setThread(region, { ...before, messages: [...before.messages, userMessage] });
    setDraft("");
    void sendToEcho(region, before, userMessage);
  }

  handleSendRef.current = handleSend;

  function handleRetry() {
    if (!activeError || sendingRegion) return;
    void sendToEcho(activeError.region, activeError.retryBefore, activeError.retryMessage);
  }

  // H03c: the server refused because there is no AI-share consent. Record the
  // user's yes, then resend the turn that was refused (version 1 copy,
  // TD-29 (4)).
  async function grantAiShare() {
    const openingConsent = shownOpening?.status === "consent";
    if ((!activeError && !openingConsent) || consentSaving) return;
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
      if (!res.ok) setConsentFailed(true);
      else {
        // TD-34: the opening waited for this consent too (or read the ledger just before it).
        if (shownOpening && shownOpening.status !== "done") loadOpening.current?.();
        if (activeError) void sendToEcho(activeError.region, activeError.retryBefore, activeError.retryMessage);
      }
    } catch (err) {
      console.error("AI-share consent not recorded:", err instanceof Error ? err.message : err);
      setConsentFailed(true);
    } finally {
      setConsentSaving(false);
    }
  }

  // TD-50 (mockups 18, 19): an area with no question yet opens on Echo's
  // introduction (18); once asked, the compact Echo header and the chat (19).
  const empty = messages.length === 0;
  const echoAvatar = <EchoAvatar size={36} className="shrink-0" />;

  // TD-46: one thread per face area.
  const areaPicker = (
    <div className="flex flex-col gap-2">
      {empty && (
        <p aria-hidden className={eyebrow}>
          {E.areaPicker}
        </p>
      )}
      <div role="group" aria-label={E.areaPicker} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:px-0">
        {ECHO_REGIONS.map((region) => (
          <Chip key={region} selected={region === activeRegion} onClick={() => setActiveRegion(region)}>
            {ECHO_REGION_LABELS[region]}
          </Chip>
        ))}
      </div>
      {empty && <p className="text-sm text-brand-text-muted">{E.areaHint}</p>}
    </div>
  );

  const alertBox = `${card} !p-4 flex flex-col items-start gap-2`;

  // The question box and the starters (input first on 18, starters first on 19).
  const startersShown = echoOn && starters.length > 0 && safetyQuestionsAnswered(session.answers) && activeError?.code !== "ECHO_DAILY_LIMIT" && activeError?.code !== "ECHO_OFF";
  const starterChips = startersShown && <SuggestionChips label={E.startersLabel} items={starters} onPick={(q) => handleSend(q)} disabled={sendingRegion !== null} />;
  // TD-29 (5): with Echo switched off, a plain notice replaces the input.
  const box = (
    <>
      {!echoOn ? (
        <div role="status" className="my-3 space-y-2 rounded-card bg-brand-50 px-4 py-3 text-sm text-brand-text-muted">
          <p>{E.off}</p>
          <p>{withPhoneLinks(REFERRAL_LINE)}</p>
        </div>
      ) : (
        <ChatInput
          icon={Sparkles}
          label={E.placeholder(areaLabel)}
          sendLabel={E.send}
          value={draft}
          onChange={setDraft}
          onSend={() => handleSend()}
          // Matches ChatMessageSchema's text bound (app/api/skin-check/chat/
          // route.ts) — caps client-side so a too-long message fails to type
          // rather than failing at send with a 400 the UI can't usefully retry.
          maxLength={2000}
          // TD-29 (5): after the day's limit, every question would fail the same way.
          disabled={sendingRegion !== null || activeError?.code === "ECHO_DAILY_LIMIT"}
        />
      )}
    </>
  );
  const composer = empty ? (
    <div className="flex flex-col gap-3">
      {box}
      {starterChips}
    </div>
  ) : (
    <>
      {starterChips && <div className="pt-2">{starterChips}</div>}
      <div className="py-3">{box}</div>
    </>
  );

  return (
    <MotionConfig reducedMotion="user">
    {/* The chat fills the screen above the phone's bottom bar; on a wide screen
        the readings sit beside it (TD-25 (1), from direction B). */}
    <main className="mx-auto flex h-[calc(100dvh-4rem-env(safe-area-inset-bottom))] w-full max-w-[1200px] flex-col sm:h-dvh lg:grid lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex min-h-0 flex-1 flex-col px-4 sm:px-6 lg:border-r lg:border-brand-border lg:px-8 lg:pt-6">
        <header className={`grid shrink-0 grid-cols-[44px_1fr_44px] items-center sm:pt-6 ${phoneChrome}`}>
          <Link
            // K-1: a hand-off from the dashboard goes back there, not to an old results screen.
            href={session.fromDashboard ? "/dashboard" : "/skin-check"}
            aria-label={session.fromDashboard ? "Back to your skin checks" : "Back to Skin Check"}
            className="-ml-2 grid size-11 place-items-center rounded-full text-brand-text hover:bg-brand-50"
          >
            <ChevronLeft aria-hidden size={22} />
          </Link>
          <Wordmark centred />
          <AccountButton />
        </header>

        {/* Mockup 19: the compact Echo header once a question is asked. */}
        {!empty && (
          <div className="flex shrink-0 items-center gap-3 pb-3 pt-2">
            <EchoAvatar size={56} className="shrink-0" />
            <div className="min-w-0 flex-1">
              <h1 className="flex items-start gap-0.5 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-brand-text">
                {E.title}
                <Sparkles aria-hidden size={16} className="mt-1 text-brand-700" />
              </h1>
              <p className="truncate text-sm text-brand-text-muted">{E.checkFrom(date)}</p>
            </div>
            <Link href={`/checks/${encodeURIComponent(session.scanId)}`} className={`${btnGhost} shrink-0 gap-1.5 bg-brand-50 !px-3 text-sm lg:hidden`}>
              <UserRound aria-hidden size={16} />
              {E.openCheck}
            </Link>
          </div>
        )}
        {!empty && <div className="shrink-0 border-b border-brand-border pb-2">{areaPicker}</div>}

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-4">
          {/* Mockup 18: who Echo is and what it does (it explains; it does not decide). */}
          {empty && (
            <section className="flex flex-col gap-5 pb-5 pt-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 pt-2">
                  <p className={`${eyebrow} tracking-[0.3em]`}>{E.meet}</p>
                  <h1 className="mt-1 flex items-start gap-1 text-[56px] font-semibold leading-none tracking-[-0.03em] text-brand-900">
                    {E.title}
                    <Sparkles aria-hidden size={26} className="mt-0.5 text-brand-700" />
                  </h1>
                  <p className={`mt-2 ${lead}`}>{E.tagline}</p>
                </div>
                {/* Echo's hello in a bubble over its avatar (mockup 18). */}
                <div className="relative flex w-[46%] max-w-[200px] shrink-0 flex-col items-center">
                  <p className="z-10 self-end rounded-card rounded-bl-md bg-brand-100 px-3 py-2 text-[13px] leading-snug text-brand-text">
                    <span className="block font-semibold">{E.hello}</span>
                    {E.helloLine}
                  </p>
                  <EchoAvatar size={120} className="-mt-3 drop-shadow-[0_0_24px_rgba(191,230,207,0.9)]" />
                </div>
              </div>
              <p className="-mt-2 text-brand-text-muted">{E.intro(date)}</p>
              <ul aria-label={E.doesLabel} className="grid grid-cols-3 gap-2">
                {E.does.map((line, i) => (
                  <li key={line} className={`${card} flex items-center gap-2 !p-2.5 text-[13px] font-medium leading-snug text-brand-text`}>
                    <IconWell icon={DOES_ICONS[i]!} size={36} />
                    {line}
                  </li>
                ))}
              </ul>
              {/* Mockup 18: the question box and the starters up here until the first question. */}
              {composer}
              <section aria-labelledby="quick-title" className="flex flex-col gap-3">
                <h2 id="quick-title" className="text-xl font-semibold text-brand-text">
                  {E.quickTitle}
                </h2>
                <ul className="grid grid-cols-3 gap-2">
                  {QUICK.map((q) => (
                    <li key={q.href}>
                      <Link href={q.href} className={`${card} flex h-full flex-col items-center gap-1.5 !p-3 text-center transition-colors duration-fast hover:bg-brand-50`}>
                        <IconWell icon={q.icon} size={44} className={q.well} />
                        <span className="text-sm font-semibold leading-snug text-brand-text">{q.copy.title}</span>
                        <span className="text-xs text-brand-text-muted">{q.copy.body}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
              {areaPicker}
            </section>
          )}

          {/* TD-33 (1): F11 is kept, so a check without answers gets no Echo answer; say so up front. */}
          {!hasQuestionAnswers(session.answers) && (
            <div role="note" className={`${tintCard} mt-3 flex flex-col items-start gap-1 text-brand-text`}>
              <p>{Q.echoNotice}</p>
              <Link href="/questions" className={textLink}>
                {Q.answerLink}
              </Link>
            </div>
          )}

          {/* Phone and tablet: the same readings, folded away until asked for. */}
          <details className={`group mt-3 rounded-card border border-brand-border bg-brand-surface px-4 py-1 lg:hidden`}>
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between font-medium text-brand-text [&::-webkit-details-marker]:hidden">
              {E.readingsSummary}
              <ChevronDown aria-hidden size={18} className="transition-transform group-open:rotate-180" />
            </summary>
            <div className="pb-3 pt-2">{panel}</div>
          </details>

          <div role="log" aria-live="polite" className="mt-4 flex flex-col gap-4">
            {echoOn && messages.length === 0 && (
              <ChatBubble from="echo" avatar={echoAvatar}>
                {greetingFor(activeRegion)}
              </ChatBubble>
            )}
            {echoOn && shownOpening?.status === "done" && (
              <div className="flex flex-col gap-3">
                {splitRedFlagNote(shownOpening.reply).note && (
                  <p role="note" className={`${tintCard} flex items-start gap-2 !py-3 text-sm text-brand-text`}>
                    <Stethoscope aria-hidden size={18} className="mt-0.5 shrink-0 text-brand-700" />
                    <span>{COPY.referral}</span>
                  </p>
                )}
                <ChatBubble from="echo" avatar={echoAvatar}>
                  {withPhoneLinks(splitDoctorLine(splitRedFlagNote(shownOpening.reply).text).text)}
                </ChatBubble>
                <div className="pl-10">
                  <ProductCards products={shownOpening.products} doctorLine={splitDoctorLine(shownOpening.reply).doctorLine} skinType={session.answers?.skin_type} />
                </div>
              </div>
            )}
            {echoOn && shownOpening?.status === "error" && (
              <div className="flex flex-wrap items-center gap-x-2 pl-10 text-sm text-brand-text-muted">
                <p>{E.openingFailed}</p>
                <button type="button" onClick={() => loadOpening.current?.()} className={textLink}>
                  {E.tryAgain}
                </button>
              </div>
            )}
            {echoOn && shownOpening?.status === "loading" && (
              <div className="flex items-end gap-2">
                {echoAvatar}
                <TypingIndicator label={E.openingLoading} className={TYPING} />
              </div>
            )}
            {messages.map((m) =>
              m.role === "echo" ? (
                <div key={m.id} className="flex flex-col gap-3">
                  <ChatBubble from="echo" avatar={echoAvatar}>
                    {withPhoneLinks(m.products ? splitDoctorLine(m.text).text : m.text)}
                  </ChatBubble>
                  {m.products && (
                    <div className="pl-10">
                      <ProductCards products={m.products} doctorLine={splitDoctorLine(m.text).doctorLine} skinType={session.answers?.skin_type} />
                    </div>
                  )}
                </div>
              ) : (
                <ChatBubble key={m.id} from="user">
                  {m.text}
                </ChatBubble>
              )
            )}
            <AnimatePresence initial={false}>
              {isThinking && (
                <div key="thinking" className="flex items-end gap-2">
                  {echoAvatar}
                  <TypingIndicator className={TYPING} />
                </div>
              )}
            </AnimatePresence>
            {(activeError?.code === "AI_CONSENT_REQUIRED" || (!activeError && echoOn && shownOpening?.status === "consent")) && (
              <div role="alert" className={alertBox}>
                <p className="text-brand-text">{AI_SHARE_CONSENT_COPY}</p>
                <button
                  type="button"
                  onClick={() => void grantAiShare()}
                  disabled={consentSaving || sendingRegion !== null}
                  className={btnPrimary}
                >
                  I agree
                </button>
                {consentFailed && (
                  <p className="text-sm text-brand-text-muted">We couldn&apos;t save that. Please reload the page and try again.</p>
                )}
              </div>
            )}
            {activeError && activeError.code !== "AI_CONSENT_REQUIRED" && (
              <div role="alert" className={alertBox}>
                <p className="flex items-start gap-2 text-brand-text">
                  <AlertCircle aria-hidden size={20} className="mt-0.5 shrink-0 text-brand-error" />
                  <span>{withPhoneLinks(GATE_MESSAGES[activeError.code ?? ""] ?? (activeError.retryable ? RETRYABLE_ERROR_MESSAGE : CONFIG_ERROR_MESSAGE))}</span>
                </p>
                {activeError.retryable && (
                  <button
                    type="button"
                    onClick={handleRetry}
                    disabled={sendingRegion !== null}
                    className={`${btnSecondary} disabled:opacity-50`}
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Mockup 19: the starters and the box under the chat once a question is asked (on 18 they sit in the introduction). */}
        {!empty && <div className="shrink-0">{composer}</div>}
      </div>

      <aside aria-label={E.readingsSummary} className="hidden min-h-0 overflow-y-auto overscroll-contain bg-brand-surface px-6 py-8 lg:block">
        {panel}
      </aside>
    </main>
    </MotionConfig>
  );
}
