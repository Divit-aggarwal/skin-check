"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
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
  answers: SkinCheckAnswers;
  result: SkinScanResult;
  composite: CompositeScore;
  photo: Blob;
  original: Blob;
  captureMethod: CaptureMethod;
}

type EchoThreads = Record<EchoRegion, EchoThreadMessage[]>;

const EMPTY_THREADS: EchoThreads = { forehead: [], cheeks: [], nose: [], chin: [] };

interface SkinCheckSessionContextValue {
  session: SkinCheckSession | null;
  setSession: (session: SkinCheckSession) => void;
  threads: EchoThreads;
  setThreadMessages: (region: EchoRegion, messages: EchoThreadMessage[]) => void;
}

const SkinCheckSessionContext = createContext<SkinCheckSessionContextValue | null>(null);

// In-memory only — no sessionStorage/localStorage. This is a deliberate
// limitation (see /echo's Step 4b spec): refreshing loses the session and
// every thread's history, ahead of real persistence in Step 5. Scoped to the
// (marketing) layout since /skin-check and /echo are its only consumers.
export function SkinCheckSessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<SkinCheckSession | null>(null);
  const [threads, setThreads] = useState<EchoThreads>(EMPTY_THREADS);

  function setThreadMessages(region: EchoRegion, messages: EchoThreadMessage[]) {
    setThreads((prev) => ({ ...prev, [region]: messages }));
  }

  return (
    <SkinCheckSessionContext.Provider value={{ session, setSession, threads, setThreadMessages }}>
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
