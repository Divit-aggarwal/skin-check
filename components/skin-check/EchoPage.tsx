"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { ConfidenceBadge } from "@/components/primitives/ConfidenceBadge";
import { TypingIndicator } from "@/components/primitives/TypingIndicator";
import { EchoBubble } from "./EchoBubble";
import { EchoMark } from "./EchoMark";
import { useSkinCheckSession, type EchoThreadMessage } from "@/lib/skin-check-session-context";
import { getSkinCheckChatReply } from "@/lib/api";
import { bandScores } from "@/lib/skin-check-rules";
import { ECHO_REGIONS, ECHO_REGION_LABELS, isEchoRegion, type EchoRegion } from "@/lib/echo-regions";
import type { SkinScanScores } from "@/types/skin-scan";

// hydration is labeled "Dryness" - see SkinCheckDashboard.tsx's MAP_LABELS
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

const ERROR_MESSAGE = "I couldn't reach Echo just now — try sending that again?";

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
  const { session, threads, setThreadMessages } = useSkinCheckSession();

  const regionParam = searchParams.get("region");
  const [activeRegion, setActiveRegion] = useState<EchoRegion>(isEchoRegion(regionParam) ? regionParam : "forehead");
  const [draft, setDraft] = useState("");
  const [sendingRegion, setSendingRegion] = useState<EchoRegion | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const messages = threads[activeRegion];
  const isThinking = sendingRegion === activeRegion;

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isThinking]);

  if (!session) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 bg-white px-6 text-center">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#F7E3E3]">
          <EchoMark className="h-5 w-5" />
        </span>
        <p className="text-sm text-[#1A1A1A]/70">
          We lost your check-in — Echo needs your Skin Check results to talk this through, and that session
          doesn&apos;t survive a refresh yet.
        </p>
        <Link
          href="/skin-check"
          className="h-12 rounded-full bg-[#E02D79] px-6 text-sm font-medium leading-[3rem] text-white"
        >
          Back to Skin Check
        </Link>
      </div>
    );
  }

  const regionScores = session.result.region_scores[activeRegion];
  const regionBands = regionScores ? bandScores(regionScores).bands : null;
  const activeSession = session; // fresh const so the closure below keeps the non-null narrowing

  async function handleSend() {
    const text = draft.trim();
    if (!text || sendingRegion) return;

    const region = activeRegion;
    const nextMessages: EchoThreadMessage[] = [...threads[region], { id: messageSeq++, role: "user", text }];
    setThreadMessages(region, nextMessages);
    setDraft("");
    setSendingRegion(region);

    try {
      const history = nextMessages.map((m) => ({ role: m.role, text: m.text }));
      const focusScores = activeSession.result.region_scores[region];
      const reply = await getSkinCheckChatReply(
        history,
        activeSession.answers,
        activeSession.result.scores,
        activeSession.composite,
        focusScores ? { region: ECHO_REGION_LABELS[region], scores: focusScores } : null
      );
      setThreadMessages(region, [...nextMessages, { id: messageSeq++, role: "echo", text: reply }]);
    } catch (err) {
      console.error("Echo region chat failed:", err);
      setThreadMessages(region, [...nextMessages, { id: messageSeq++, role: "echo", text: ERROR_MESSAGE }]);
    } finally {
      setSendingRegion(null);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-white px-6 pb-6 pt-6">
      <div className="flex shrink-0 items-center gap-3">
        <Link
          href="/skin-check"
          aria-label="Back to Skin Check"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#1A1A1A]/60 transition-opacity hover:text-[#1A1A1A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <p className="text-sm font-semibold text-[#1A1A1A]">Echo</p>
      </div>

      <div className="mt-4 flex shrink-0 gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Skin regions">
        {ECHO_REGIONS.map((region) => {
          const active = region === activeRegion;
          return (
            <button
              key={region}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setActiveRegion(region)}
              className={
                "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2 " +
                (active
                  ? "bg-[#E02D79] text-white"
                  : "bg-[#FAF4EF] text-[#1A1A1A]/60 hover:bg-[#FAF4EF]/70")
              }
            >
              {ECHO_REGION_LABELS[region]}
            </button>
          );
        })}
      </div>

      {regionBands && (
        <div className="mt-4 shrink-0 rounded-2xl bg-[#FAF4EF] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[length:var(--home-text-label,0.8125rem)] font-semibold uppercase tracking-[0.12em] text-[#98415A]/70">
              {ECHO_REGION_LABELS[activeRegion]} readings
            </p>
            <ConfidenceBadge level={session.composite.confidence} />
          </div>
          <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
            {CATEGORY_KEYS.map((key) => (
              <div key={key} className="flex items-center justify-between">
                <span className="text-xs text-[#1A1A1A]/60">{CATEGORY_LABELS[key]}</span>
                <span className="text-xs font-medium text-[#98415A]">
                  {key === "pores" ? "Not measured yet" : regionBands[key]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div ref={scrollRef} className="mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto">
        {messages.length === 0 && <EchoBubble message={greetingFor(activeRegion)} />}
        {messages.map((m) =>
          m.role === "echo" ? (
            <EchoBubble key={m.id} message={m.text} />
          ) : (
            <div key={m.id} className="flex justify-end">
              <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-[#98415A] px-4 py-3">
                <p className="text-[1.0625rem] leading-snug text-white">{m.text}</p>
              </div>
            </div>
          )
        )}
        <AnimatePresence initial={false}>
          {isThinking && (
            <TypingIndicator
              key="thinking"
              className="rounded-tl-sm bg-[#F7E3E3] text-[#98415A]"
            />
          )}
        </AnimatePresence>
      </div>

      <div className="mt-4 flex shrink-0 items-center gap-2 pb-safe-bottom">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSend();
          }}
          placeholder={`Ask Echo about your ${ECHO_REGION_LABELS[activeRegion].toLowerCase()}...`}
          disabled={sendingRegion !== null}
          className="h-12 flex-1 rounded-full border border-[#1A1A1A]/10 bg-[#FAF4EF] px-4 text-sm text-[#1A1A1A] outline-none focus:border-[#98415A]/40 disabled:opacity-60"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={sendingRegion !== null || !draft.trim()}
          aria-label="Send"
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#E02D79] text-white transition-opacity disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
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
