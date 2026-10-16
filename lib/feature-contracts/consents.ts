// H36 (TD-51 (2)): separate consents, purposes from mockup 22. BE1 implements,
// lane E draws screen 22. Every grant and withdrawal is one append-only entry
// in users/{uid}/consentLedger (app/api/account/_ledger.ts); the newest entry
// at the current version wins. Texts are DRAFTS until the legal review (H29).
//
// What each withdrawal switches off in code:
// - personalisation: Echo's product suggestions and its opening (Echo still answers about readings).
//   The user's own routine record stays: it reads no checks and is their own log.
// - ai_share (existing): Echo entirely.
// - product_improvement, research: nothing reads them today (recorded only; no data leaves).
// - marketing: the "marketing" notification type (contracts/notifications.ts).

import type { ConsentPurpose } from "@/lib/consent";

export type NewConsentPurpose = "personalisation" | "product_improvement" | "research" | "marketing";

/** The switches on screen 22, in order. ai_share is the existing Echo consent. */
export type ConsentSwitch = NewConsentPurpose | Extract<ConsentPurpose, "ai_share">;

export interface ConsentText {
  version: string;
  title: string;
  copy: string;
  /** Default before the user ever answers. Only personalisation starts on (needed for the core app). */
  defaultGranted: boolean;
}

/** DRAFT copy (H29). Bump the version when the copy changes. */
export const CONSENT_TEXTS: Record<NewConsentPurpose, ConsentText> = {
  personalisation: {
    version: "personalisation DRAFT version 1",
    title: "Use my data for personalised suggestions",
    copy: "Use my checks and answers to choose which of our products and routine steps to show me.",
    defaultGranted: true,
  },
  product_improvement: {
    version: "product improvement DRAFT version 2",
    title: "Use my data to develop Project Skin",
    copy: "Let Project Skin use my checks to develop the app and its skin analysis.",
    defaultGranted: false,
  },
  research: {
    version: "research DRAFT version 1",
    title: "Use anonymised data for research",
    copy: "Let Project Skin use my checks, with my name and contact details removed, for skin research.",
    defaultGranted: false,
  },
  marketing: {
    version: "marketing DRAFT version 1",
    title: "Marketing messages",
    copy: "Send me news about new products and offers.",
    defaultGranted: false,
  },
};

export interface ConsentState {
  purpose: ConsentSwitch;
  granted: boolean;
  /** Version of the newest entry; null when the user never answered (the default applies). */
  version: string | null;
  /** ISO time of the newest entry, or null. */
  at: string | null;
}

/**
 * GET  /api/account/consents → 200 { consents: ConsentState[] } (one per ConsentSwitch, in screen order)
 * POST /api/account/consents body ConsentChange → 200 ConsentState
 *   400 BAD_REQUEST, 401 AUTH_REQUIRED, 403 NOT_ALLOWED, 409 VERSION_STALE, 500 LEDGER_UNAVAILABLE.
 * ai_share keeps its own route (/api/account/consent) and copy; this route reads it for GET only.
 */
export interface ConsentChange {
  purpose: NewConsentPurpose;
  granted: boolean;
  version: string;
}
export const CONSENTS_ROUTE = "/api/account/consents";
