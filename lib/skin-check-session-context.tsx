"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { SkinCheckAnswers } from "@/types/skin-check";
import type { CaptureMethod, SkinScanResult } from "@/types/skin-scan";
import type { CompositeScore } from "@/lib/skin-check-score";
import type { EchoRegion } from "@/lib/echo-regions";

export interface EchoThreadMessage {
  id: number;
  role: "user" | "echo";
  text: string;
}

export interface SkinCheckSession {
  /** The displayed result's scanId — Echo names it; the server loads the facts. */
  scanId: string;
  answers: SkinCheckAnswers;
  result: SkinScanResult;
  composite: CompositeScore;
  photo: Blob;
  original?: Blob | undefined;
  /** True when this scan's original image is already in private S3. */
  originalStored?: boolean | undefined;
  /** Set only if the user consented to retention for this scan. */
  retentionConsentVersion?: string | undefined;
  captureMethod: CaptureMethod;
}

export interface EchoThread {
  messages: EchoThreadMessage[];
  /** Server MAC over `messages` (lib/echo-history-token.ts); null until Echo first replies. */
  historyToken: string | null;
}

type EchoThreads = Record<EchoRegion, EchoThread>;

const EMPTY_THREAD: EchoThread = { messages: [], historyToken: null };
const EMPTY_THREADS: EchoThreads = { forehead: EMPTY_THREAD, cheeks: EMPTY_THREAD, nose: EMPTY_THREAD, chin: EMPTY_THREAD };

interface SkinCheckSessionContextValue {
  session: SkinCheckSession | null;
  /** null clears the session — used when starting a new scan. */
  setSession: (session: SkinCheckSession | null) => void;
  threads: EchoThreads;
  setThread: (region: EchoRegion, thread: EchoThread) => void;
}

const SkinCheckSessionContext = createContext<SkinCheckSessionContextValue | null>(null);

// In-memory only — no sessionStorage/localStorage. This is a deliberate
// limitation (see /echo's Step 4b spec): refreshing loses the session and
// every thread's history, ahead of real persistence in Step 5. Scoped to the
// (marketing) layout since /skin-check and /echo are its only consumers.
export function SkinCheckSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SkinCheckSession | null>(null);
  const [threads, setThreads] = useState<EchoThreads>(EMPTY_THREADS);

  // Threads belong to one scan: Echo's facts and each thread's historyToken
  // are bound to scanId server-side, so a new scan starts every thread fresh.
  const sessionScanId = session?.scanId;
  useEffect(() => setThreads(EMPTY_THREADS), [sessionScanId]);

  function setThread(region: EchoRegion, thread: EchoThread) {
    setThreads((prev) => ({ ...prev, [region]: thread }));
  }

  return (
    <SkinCheckSessionContext.Provider value={{ session, setSession, threads, setThread }}>
      {children}
    </SkinCheckSessionContext.Provider>
  );
}

export function useSkinCheckSession(): SkinCheckSessionContextValue {
  const ctx = useContext(SkinCheckSessionContext);
  if (!ctx) {
    throw new Error("useSkinCheckSession must be used inside <SkinCheckSessionProvider>.");
  }
  return ctx;
}
