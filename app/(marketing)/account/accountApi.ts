import { CONSENTS_ROUTE, CONSENT_TEXTS, type ConsentState, type NewConsentPurpose } from "@/lib/feature-contracts/consents";
import { EXPORT_ROUTE } from "@/lib/feature-contracts/data-export";
import { NOTIFICATIONS_ROUTE, SENDABLE_TYPES, WAITS_ON, type NotificationPrefs, type NotificationType } from "@/lib/feature-contracts/notifications";

// Screens 20 and 22 (G37): calls to the G31, H36 and H37 routes, built against
// lib/feature-contracts and tested with its fixtures (tests/account-mm.test.ts).
// fetch is passed in so the tests need no browser.

export type Result<T> = { ok: true; data: T } | { ok: false; status: number; code?: string | undefined; retryAfter?: number | undefined };
type Fetch = typeof fetch;

async function call<T>(f: Fetch, token: string, url: string, init?: { method: string; body: unknown }): Promise<Result<T>> {
  try {
    const res = await f(url, {
      method: init?.method ?? "GET",
      headers: { authorization: `Bearer ${token}`, ...(init ? { "content-type": "application/json" } : {}) },
      ...(init ? { body: JSON.stringify(init.body) } : {}),
    });
    const json = await res.json().catch(() => null);
    return res.ok ? { ok: true, data: json as T } : { ok: false, status: res.status, code: (json as { code?: string } | null)?.code };
  } catch {
    return { ok: false, status: 0 };
  }
}

export const getPrefs = (f: Fetch, token: string) => call<NotificationPrefs>(f, token, NOTIFICATIONS_ROUTE);
export const patchType = (f: Fetch, token: string, type: NotificationType, on: boolean) =>
  call<NotificationPrefs>(f, token, NOTIFICATIONS_ROUTE, { method: "PATCH", body: { types: { [type]: on } } });

/** A type outside SENDABLE_TYPES is shown disabled with the line naming what it waits for. */
export function rowState(type: NotificationType): { disabled: boolean; waitsOn: string | undefined } {
  const disabled = !SENDABLE_TYPES.includes(type);
  return { disabled, waitsOn: disabled ? WAITS_ON[type] : undefined };
}

export const getConsents = (f: Fetch, token: string) => call<{ consents: ConsentState[] }>(f, token, CONSENTS_ROUTE);
/** Always sends the version of the wording on screen (H36), so the ledger records what was shown. */
export const postConsent = (f: Fetch, token: string, purpose: NewConsentPurpose, granted: boolean) =>
  call<ConsentState>(f, token, CONSENTS_ROUTE, { method: "POST", body: { purpose, granted, version: CONSENT_TEXTS[purpose].version } });

/**
 * Optimistic switch: shows the new value at once, sends it, and puts the old
 * value back when the server does not confirm. Returns the server's answer.
 */
export async function optimistic<T>(set: (on: boolean) => void, on: boolean, send: () => Promise<Result<T>>): Promise<Result<T>> {
  set(on);
  const r = await send();
  if (!r.ok) set(!on);
  return r;
}

/** The file name from Content-Disposition, else project-skin-data-<date>.json. */
export function exportFileName(disposition: string | null, now = new Date()): string {
  const m = disposition?.match(/filename="?([\w.-]+)"?/);
  return m?.[1] ?? `project-skin-data-${now.toISOString().slice(0, 10)}.json`;
}

/** H37: fetches the export as a file (never parsed or shown). */
export async function fetchExport(f: Fetch, token: string): Promise<Result<{ blob: Blob; name: string }>> {
  try {
    const res = await f(EXPORT_ROUTE, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const code = ((await res.json().catch(() => null)) as { code?: string } | null)?.code;
      const retry = Number(res.headers.get("retry-after"));
      return { ok: false, status: res.status, code, ...(retry > 0 ? { retryAfter: retry } : {}) };
    }
    return { ok: true, data: { blob: await res.blob(), name: exportFileName(res.headers.get("content-disposition")) } };
  } catch {
    return { ok: false, status: 0 };
  }
}

/** "in about 3 hours" / "in about 20 minutes" from a Retry-After in seconds; null when unknown. */
export function retryIn(seconds: number | undefined): { hours: number } | { minutes: number } | null {
  if (!seconds) return null;
  return seconds >= 3600 ? { hours: Math.ceil(seconds / 3600) } : { minutes: Math.max(1, Math.ceil(seconds / 60)) };
}

/** Saves a blob through a temporary link. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
