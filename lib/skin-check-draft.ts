"use client";

import type { SkinCheckAnswers } from "@/types/skin-check";
import type { CaptureMethod, SkinScanResult } from "@/types/skin-scan";

// Anonymous, pre-authentication draft storage for an in-progress Skin Check.
//
// Split on purpose, by size rather than by taste:
//   - questionnaire answers + position → localStorage (small, and
//     SYNCHRONOUS, so the flow can decide where to resume without an async
//     gap the UI would have to render around).
//   - photo blob + scan result → IndexedDB (a JPEG and a result carrying up
//     to 7 base64 overlay PNGs are megabytes; localStorage's ~5MB string
//     quota is the wrong tool and would throw QuotaExceededError).
//
// Nothing here requires a Firebase user — that's the point. The draft exists
// before auth, and is cleared the moment the scan is written to Firestore
// under a real uid (see lib/firebase/skin-checks.ts).

// 2: PHASE 1 inserted the "verify" section at index 1, shifting every later
// section index by one, and changed which answer ids are persisted. A v1
// draft restored against the new SECTIONS array would resume the user at the
// wrong section (old "skin-photo" → new "verify", and so on), so v1 drafts
// are discarded rather than misread — see loadDraft's version gate.
export const DRAFT_VERSION = 2;

const DRAFT_KEY = "skin-check-draft";
// Abandoned drafts shouldn't resurrect a half-answered questionnaire days
// later — the user has moved on, and stale answers are worse than none.
const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

// Never persisted. The phone number is only ever written to answers AFTER
// Firebase verifies it, at which point the draft is being cleared anyway —
// but a failed save must not leave PII sitting in localStorage.
// `phone_verify` is the pre-capture auth step's answer and is equally PII;
// leaving it out also means a restored draft can never assert "already
// verified" on its own — that claim only ever comes from Firebase auth state.
const SENSITIVE_ANSWER_IDS = ["final_phone", "phone_verify"];

export interface SkinCheckDraft {
  version: number;
  /** Stable id for this scan attempt — also the Firestore document id. */
  scanId: string;
  answers: SkinCheckAnswers;
  sectionIndex: number;
  updatedAt: number;
}

export function newScanId(): string {
  // randomUUID needs a secure context; the fallback keeps a draft working on
  // plain-HTTP local testing rather than throwing on the flow's first render.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Returns the stored draft, or null if there is none, it's unreadable, it
 * was written by a different schema version, or it has aged out. Any of
 * those also clears it — a draft we can't use is only a liability.
 */
export function loadDraft(): SkinCheckDraft | null {
  if (typeof window === "undefined") return null;
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(DRAFT_KEY);
  } catch {
    // Private mode / storage disabled. Drafts are an enhancement, not a
    // requirement — the questionnaire still works entirely in memory.
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") throw new Error("not an object");
    const draft = parsed as SkinCheckDraft;
    // Version gate: this is what stops a future questionnaire change from
    // crashing on an old draft's shape. Bump DRAFT_VERSION and old drafts
    // are discarded, not misread.
    if (draft.version !== DRAFT_VERSION) throw new Error("version mismatch");
    if (typeof draft.scanId !== "string" || !draft.scanId) throw new Error("no scanId");
    if (!draft.answers || typeof draft.answers !== "object") throw new Error("no answers");
    if (Date.now() - draft.updatedAt > DRAFT_TTL_MS) throw new Error("stale");
    return {
      version: draft.version,
      scanId: draft.scanId,
      answers: draft.answers,
      sectionIndex: typeof draft.sectionIndex === "number" ? draft.sectionIndex : 0,
      updatedAt: draft.updatedAt,
    };
  } catch {
    void clearDraft();
    return null;
  }
}

/** Incremental — called on every answer commit, not only at the end. */
export function saveDraft(draft: Omit<SkinCheckDraft, "version" | "updatedAt">): void {
  if (typeof window === "undefined") return;
  const answers: SkinCheckAnswers = { ...draft.answers };
  for (const id of SENSITIVE_ANSWER_IDS) delete answers[id];
  try {
    window.localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ ...draft, answers, version: DRAFT_VERSION, updatedAt: Date.now() })
    );
  } catch {
    // Quota or disabled storage — the in-memory flow is unaffected.
  }
}

// ─── Photo + scan result (IndexedDB) ───────────────────────────────────────

const DB_NAME = "skin-check";
const DB_VERSION = 1;
const STORE = "scan";
const SCAN_KEY = "current";

export interface DraftScan {
  scanId: string;
  photo: Blob;
  /** null while the CV call is still in flight or failed. */
  result: SkinScanResult | null;
  captureMethod: CaptureMethod;
}

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    // Blocked/errored (private browsing in some engines) — the flow degrades
    // to "photo not restored", never to a broken questionnaire.
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

/** Stores the blob itself, not a base64 copy — IndexedDB takes Blobs natively. */
export async function saveDraftScan(scan: DraftScan): Promise<void> {
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(scan, SCAN_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}

/**
 * Only returns the stored scan if it belongs to `scanId`. A photo from an
 * abandoned draft must never be silently attached to a different scan —
 * that's requirement 4 (image matched to the correct scan) enforced at the
 * one place the two could drift apart.
 */
export async function loadDraftScan(scanId: string): Promise<DraftScan | null> {
  const db = await openDb();
  if (!db) return null;
  try {
    const stored = await new Promise<DraftScan | null>((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(SCAN_KEY);
      req.onsuccess = () => resolve((req.result as DraftScan | undefined) ?? null);
      req.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
    if (!stored || stored.scanId !== scanId || !(stored.photo instanceof Blob)) return null;
    return stored;
  } finally {
    db.close();
  }
}

/**
 * Drops both halves of the draft. Called after the scan is safely in
 * Firestore, and when the user deliberately starts a new scan — so an
 * abandoned draft never becomes a permanent record, and a completed one
 * never gets restored over a fresh start.
 */
export async function clearDraft(): Promise<void> {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to do — the TTL check in loadDraft is the backstop.
    }
  }
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(SCAN_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
      tx.onabort = () => resolve();
    });
  } finally {
    db.close();
  }
}
