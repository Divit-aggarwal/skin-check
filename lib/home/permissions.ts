// TD-47: the two permission choices and what Home does about each. Pure.

/** What the user's choice came to, saved per permission in users/{uid}/settings/home. */
export type PermissionOutcome = "allowed" | "not_now" | "refused" | "unsupported";

/** The browser's own answer, as navigator.permissions reports it, or "unsupported". */
export type BrowserState = "granted" | "denied" | "prompt" | "unsupported";

/** The outcome of tapping "Allow": the browser decides. */
export function outcomeOf(state: BrowserState): PermissionOutcome {
  return state === "granted" ? "allowed" : state === "denied" ? "refused" : state === "unsupported" ? "unsupported" : "not_now";
}

/** What a Home card offers while its permission is missing. */
export type Prompt = "none" | "ask" | "blocked" | "unsupported";

/**
 * Ask again only where the browser still can ask; a browser block needs the
 * browser's own settings (the app can never prompt past it).
 */
export function promptFor(state: BrowserState, satisfied: boolean): Prompt {
  if (satisfied) return "none";
  return state === "denied" ? "blocked" : state === "unsupported" ? "unsupported" : state === "granted" ? "none" : "ask";
}

/** A place, as saved: integer tenths of a degree, never a precise position. */
export interface SavedCity {
  name: string;
  region: string;
  country: string;
  latE1: number;
  lonE1: number;
  source: "device" | "typed";
}

export interface HomeSettings {
  location?: PermissionOutcome;
  reminders?: PermissionOutcome;
  city?: SavedCity | null;
  /** Set when the permissions screen was answered; the screen shows only while absent. */
  askedAt?: unknown;
}

/**
 * The permissions screen shows only right after a check's results, only
 * once, and only for a choice not made yet (a choice made on a Home card or in
 * Account is never asked again). A settings read that failed is "error",
 * never "no choices": the screen does not show then (flow review TD-47).
 */
export function showPermissions(o: { afterCheck: boolean; settings: HomeSettings | null | "error"; weather: boolean; push: boolean }): boolean {
  if (!o.afterCheck || o.settings === "error" || o.settings?.askedAt) return false;
  return (o.weather && !o.settings?.location) || (o.push && !o.settings?.reminders);
}

/** iPhone and iPad web push needs the site on the home screen (iOS 16.4+). */
export function needsHomeScreen(userAgent: string, standalone: boolean): boolean {
  const ios = /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && /Mobile\//.test(userAgent));
  return ios && !standalone;
}

/** Set in sessionStorage when a check's results are shown; Home reads it (TD-47 (3)). */
export const AFTER_CHECK_KEY = "home-v2:after-check";
