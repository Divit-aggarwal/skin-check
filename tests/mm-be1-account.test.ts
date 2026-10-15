import { beforeEach, describe, expect, it, vi } from "vitest";

// G31 notification switches and H36 consents (mm:be1): both routes, and the
// daily push's per-type filter, against a small in-memory Firestore. The real
// ledger helpers (app/api/account/_ledger.ts) run on it, so "newest wins" is
// the real rule. Server timestamps become increasing fake times.
const { docs, verify, clock } = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  verify: vi.fn(),
  clock: { t: Date.parse("2026-10-15T08:00:00Z") },
}));

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  const { FieldValue } = await vi.importActual<typeof import("firebase-admin/firestore")>("firebase-admin/firestore");
  const stamp = () => {
    const ms = (clock.t += 1000);
    return { toMillis: () => ms, toDate: () => new Date(ms) };
  };
  const resolve = (d: Record<string, unknown>) => Object.fromEntries(Object.entries(d).map(([k, v]) => [k, v instanceof FieldValue ? stamp() : v]));
  const snap = (path: string) => ({ exists: docs.has(path), data: () => docs.get(path), get: (f: string) => docs.get(path)?.[f] });
  const query = (path: string, filters: [string, unknown][]): Record<string, unknown> => ({
    where: (f: string, _op: string, v: unknown) => query(path, [...filters, [f, v]]),
    get: async () => {
      const hits = Array.from(docs.entries()).filter(([p, d]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/") && filters.every(([f, v]) => d[f] === v));
      return { empty: !hits.length, docs: hits.map(([, d]) => ({ data: () => d })) };
    },
  });
  let auto = 0;
  const collection = (path: string): Record<string, unknown> => ({
    ...query(path, []),
    doc: (id?: string) => {
      const p = `${path}/${id ?? `auto-${++auto}`}`;
      return {
        collection: (name: string) => collection(`${p}/${name}`),
        get: async () => snap(p),
        set: async (d: Record<string, unknown>) => void docs.set(p, resolve(d)),
        create: async (d: Record<string, unknown>) => void docs.set(p, resolve(d)),
      };
    },
  });
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken: verify, adminDb: () => ({ collection }) };
});
vi.mock("@/lib/rate-limit", async () => ({ ...(await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit")), checkRequestRate: () => null }));

import { NextRequest } from "next/server";
import { GET as prefsGET, PATCH as prefsPATCH } from "@/app/api/account/notifications/route";
import { GET as consentsGET, POST as consentsPOST } from "@/app/api/account/consents/route";
import { DEFAULT_NOTIFICATION_PREFS, SENDABLE_TYPES, WAITS_ON } from "@/lib/feature-contracts/notifications";
import { CONSENT_TEXTS, type ConsentState } from "@/lib/feature-contracts/consents";
import { AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { sha256 } from "@/app/api/account/_ledger";
import { sendReminders, wanted } from "@/lib/home/push";

const UID = "uid-be1";
const req = (url: string, method: string, body?: unknown, auth: string | null = "Bearer t") =>
  new NextRequest(`http://localhost${url}`, { method, headers: auth ? { authorization: auth } : {}, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
const getPrefs = async () => (await prefsGET(req("/api/account/notifications", "GET"))).json();
const patch = (body: unknown) => prefsPATCH(req("/api/account/notifications", "PATCH", body));
const getConsents = async (): Promise<ConsentState[]> => (await (await consentsGET(req("/api/account/consents", "GET"))).json()).consents;
const post = (body: unknown) => consentsPOST(req("/api/account/consents", "POST", body));
const grant = (purpose: keyof typeof CONSENT_TEXTS, granted: boolean) => post({ purpose, granted, version: CONSENT_TEXTS[purpose].version });
const settings = (name: string) => `users/${UID}/settings/${name}`;

beforeEach(() => {
  docs.clear();
  verify.mockReset().mockResolvedValue(UID);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("G31: GET/PATCH /api/account/notifications", () => {
  it("401 without a verified token, both ways; nothing written", async () => {
    expect((await prefsGET(req("/api/account/notifications", "GET", undefined, null))).status).toBe(401);
    expect((await prefsPATCH(req("/api/account/notifications", "PATCH", { types: { weekly_checkin: true } }, null))).status).toBe(401);
    verify.mockRejectedValueOnce(new Error("bad token"));
    expect((await patch({ types: { weekly_checkin: true } })).status).toBe(401);
    expect(docs.size).toBe(0);
  });

  it("no doc: the defaults, with an empty updatedAt", async () => {
    expect(await getPrefs()).toEqual({ ...DEFAULT_NOTIFICATION_PREFS, updatedAt: "" });
  });

  it("no doc: Home's reminders allowed reads routine_morning on (computed, nothing written)", async () => {
    docs.set(settings("home"), { reminders: "allowed" });
    expect((await getPrefs()).types).toEqual({ ...DEFAULT_NOTIFICATION_PREFS.types, routine_morning: true });
    docs.set(settings("home"), { reminders: "not_now" });
    expect((await getPrefs()).types.routine_morning).toBe(false);
    expect(docs.has(settings("notifications"))).toBe(false);
  });

  it("the first save merges onto what GET showed: the computed routine_morning is kept", async () => {
    docs.set(settings("home"), { reminders: "allowed" });
    const res = await patch({ types: { weekly_checkin: true }, weeklyCheckinDay: 3 });
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved.types).toMatchObject({ routine_morning: true, weekly_checkin: true });
    expect(saved.weeklyCheckinDay).toBe(3);
    expect(saved.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    // Home's switch no longer decides once a doc is saved.
    docs.set(settings("home"), { reminders: "not_now" });
    expect((await getPrefs()).types).toMatchObject({ routine_morning: true, weekly_checkin: true });
  });

  it("each field merges; products merge per id; switching off is always allowed", async () => {
    await patch({ types: { routine_morning: true }, products: { "refreshing-cleanser": true }, morningTime: "07:30" });
    await patch({ types: { routine_morning: false, echo_tips: false }, products: { "refreshing-cleanser": false } });
    const prefs = await getPrefs();
    expect(prefs.types.routine_morning).toBe(false);
    expect(prefs.products).toEqual({ "refreshing-cleanser": false });
    expect(prefs.morningTime).toBe("07:30");
    expect(prefs.eveningTime).toBe("21:00");
  });

  it("400: unknown type or key, a bad time or day, an unknown product, not JSON", async () => {
    for (const body of [
      { types: { sms: true } },
      { types: { routine_morning: "yes" } },
      { morningTime: "7:30" },
      { eveningTime: "24:00" },
      { weeklyCheckinDay: 7 },
      { weeklyCheckinDay: 1.5 },
      { products: { "not-a-product": true } },
      { uid: "victim" },
      { updatedAt: "2020-01-01T00:00:00Z" },
      [],
    ]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect((await prefsPATCH(new NextRequest("http://localhost/x", { method: "PATCH", headers: { authorization: "Bearer t" }, body: "{" }))).status).toBe(400);
    expect(docs.size).toBe(0);
  });

  it("409 NOT_SENDABLE: switching on a type the daily push cannot honour", async () => {
    expect(SENDABLE_TYPES).toEqual(["routine_morning", "weekly_checkin"]);
    for (const t of ["routine_evening", "product_usage", "weekly_summary", "recommendations", "echo_tips"]) {
      const res = await patch({ types: { [t]: true } });
      expect(res.status).toBe(409);
      expect((await res.json()).code).toBe("NOT_SENDABLE");
    }
    expect(docs.size).toBe(0);
  });

  it("409 NEEDS_CONSENT: marketing on without the marketing grant; with it, still NOT_SENDABLE today", async () => {
    const res = await patch({ types: { marketing: true } });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("NEEDS_CONSENT");
    await grant("marketing", true);
    expect((await (await patch({ types: { marketing: true } })).json()).code).toBe("NOT_SENDABLE");
    expect(docs.has(settings("notifications"))).toBe(false);
  });

  it("403 for an erased account, and for an under-18 account switching on; nothing written", async () => {
    docs.set("erasedAccounts/uid-be1", {});
    expect((await patch({ types: { weekly_checkin: true } })).status).toBe(403);
    expect((await patch({ types: { weekly_checkin: false } })).status).toBe(403);
    docs.clear();
    docs.set("under18Accounts/uid-be1", {});
    expect((await patch({ types: { weekly_checkin: true } })).status).toBe(403);
    expect(docs.has(settings("notifications"))).toBe(false);
  });

  it("an under-18 account can always switch off", async () => {
    docs.set("under18Accounts/uid-be1", {});
    docs.set(settings("home"), { reminders: "allowed" });
    const res = await patch({ types: { routine_morning: false } });
    expect(res.status).toBe(200);
    expect((await getPrefs()).types.routine_morning).toBe(false);
  });

  it("H36: a withdrawn (or never given) marketing consent reads the marketing type off", async () => {
    docs.set(settings("notifications"), { ...DEFAULT_NOTIFICATION_PREFS, types: { ...DEFAULT_NOTIFICATION_PREFS.types, marketing: true } });
    expect((await getPrefs()).types.marketing).toBe(false);
    await grant("marketing", true);
    expect((await getPrefs()).types.marketing).toBe(true);
    await grant("marketing", false);
    expect((await getPrefs()).types.marketing).toBe(false);
  });

  it("the waiting lines carry no banned word", () => {
    expect(Object.values(WAITS_ON).flatMap((line) => bannedWordsIn(line!))).toEqual([]);
  });
});

describe("H36: GET/POST /api/account/consents", () => {
  it("never answered: one state per switch in screen order, each at its default, no version or time", async () => {
    expect(await getConsents()).toEqual([
      { purpose: "personalisation", granted: true, version: null, at: null },
      { purpose: "product_improvement", granted: false, version: null, at: null },
      { purpose: "research", granted: false, version: null, at: null },
      { purpose: "marketing", granted: false, version: null, at: null },
      { purpose: "ai_share", granted: false, version: null, at: null },
    ]);
  });

  it("each grant and withdrawal is one ledger entry with its version, copy hash and time; the newest wins", async () => {
    expect((await grant("research", true)).status).toBe(200);
    const res = await grant("research", false);
    expect(await res.json()).toMatchObject({ purpose: "research", granted: false, version: CONSENT_TEXTS.research.version });
    const entries = Array.from(docs.entries()).filter(([p]) => p.startsWith(`users/${UID}/consentLedger/`)).map(([, d]) => d);
    expect(entries).toHaveLength(2);
    expect(entries[1]).toMatchObject({ purpose: "research", granted: false, version: CONSENT_TEXTS.research.version, copySha256: sha256(CONSENT_TEXTS.research.copy), source: "consent_route", scanId: null });
    const research = (await getConsents()).find((c) => c.purpose === "research")!;
    expect(research).toMatchObject({ granted: false, version: CONSENT_TEXTS.research.version });
    expect(research.at).toBe(new Date((entries[1]!.recordedAt as { toMillis(): number }).toMillis()).toISOString());
    await grant("research", true);
    expect((await getConsents()).find((c) => c.purpose === "research")!.granted).toBe(true);
  });

  it("personalisation can be withdrawn and given again", async () => {
    await grant("personalisation", false);
    expect((await getConsents())[0]).toMatchObject({ purpose: "personalisation", granted: false });
    await grant("personalisation", true);
    expect((await getConsents())[0]).toMatchObject({ purpose: "personalisation", granted: true });
  });

  it("an entry at an older version does not count: the default applies again", async () => {
    docs.set(`users/${UID}/consentLedger/old`, { purpose: "personalisation", granted: false, version: "personalisation DRAFT version 0", recordedAt: { toMillis: () => 1 } });
    expect((await getConsents())[0]).toEqual({ purpose: "personalisation", granted: true, version: null, at: null });
  });

  it("GET also reads ai_share at its current version", async () => {
    docs.set(`users/${UID}/consentLedger/ai`, { purpose: "ai_share", granted: true, version: AI_SHARE_CONSENT_VERSION, copySha256: sha256(AI_SHARE_CONSENT_COPY), recordedAt: { toMillis: () => Date.parse("2026-10-12T09:30:00Z") } });
    expect((await getConsents())[4]).toEqual({ purpose: "ai_share", granted: true, version: AI_SHARE_CONSENT_VERSION, at: "2026-10-12T09:30:00.000Z" });
  });

  it("409 VERSION_STALE for an old version; nothing written", async () => {
    const res = await post({ purpose: "marketing", granted: true, version: "marketing DRAFT version 0" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_STALE");
    expect(docs.size).toBe(0);
  });

  it("400: ai_share or another old purpose here, an unknown key, a missing field", async () => {
    for (const body of [
      { purpose: "ai_share", granted: true, version: AI_SHARE_CONSENT_VERSION },
      { purpose: "age_18_plus", granted: true, version: "x" },
      { purpose: "marketing", granted: true, version: CONSENT_TEXTS.marketing.version, uid: "victim" },
      { purpose: "marketing", version: CONSENT_TEXTS.marketing.version },
    ]) {
      expect((await post(body)).status, JSON.stringify(body)).toBe(400);
    }
    expect(docs.size).toBe(0);
  });

  it("401 without a token; 403 for an erased or under-18 account", async () => {
    expect((await consentsPOST(req("/api/account/consents", "POST", { purpose: "marketing", granted: true, version: CONSENT_TEXTS.marketing.version }, null))).status).toBe(401);
    expect((await consentsGET(req("/api/account/consents", "GET", undefined, null))).status).toBe(401);
    docs.set("under18Accounts/uid-be1", {});
    expect((await grant("marketing", true)).status).toBe(403);
    docs.clear();
    docs.set("erasedAccounts/uid-be1", {});
    expect((await grant("marketing", true)).status).toBe(403);
    expect((await grant("personalisation", false)).status).toBe(403);
  });

  it("an under-18 account can always withdraw (personalisation starts on)", async () => {
    docs.set("under18Accounts/uid-be1", {});
    expect((await grant("personalisation", false)).status).toBe(200);
    expect((await getConsents())[0]).toMatchObject({ purpose: "personalisation", granted: false });
  });

  // Known: product_improvement's contract title and copy say "improve" (BANNED_WORDS).
  // Kit request BE1-1 (docs/lanes/kit-requests.md). Turn back into it() when the copy changes.
  it.fails("the consent copy carries no banned word", () => {
    expect(Object.values(CONSENT_TEXTS).flatMap((t) => bannedWordsIn(`${t.title} ${t.copy}`))).toEqual([]);
  });
});

describe("G31: the daily push's per-type filter", () => {
  const prefs = (types: Record<string, boolean>, weeklyCheckinDay = 3) => ({ types: { ...DEFAULT_NOTIFICATION_PREFS.types, ...types }, weeklyCheckinDay } as never);
  it("routine_morning: only when a routine step is due", () => {
    expect(wanted(prefs({ routine_morning: true }), { routine: true }, 1)).toBe(true);
    expect(wanted(prefs({ routine_morning: true }), { routine: false }, 1)).toBe(false);
  });
  it("weekly_checkin: only on the chosen weekday", () => {
    expect(wanted(prefs({ weekly_checkin: true }), { routine: false }, 3)).toBe(true);
    expect(wanted(prefs({ weekly_checkin: true }), { routine: false }, 4)).toBe(false);
  });
  it("both off: nothing, even with a routine due on the chosen day", () => {
    expect(wanted(prefs({}), { routine: true }, 3)).toBe(false);
  });
});

describe("G31: sendReminders reads settings/notifications", () => {
  // 2026-10-11 09:00 in India: a Sunday (0). No checks and no routine, so today's rule sends nothing.
  const NOW = new Date("2026-10-11T03:30:00Z");
  const cron = (prefs: Record<string, unknown> | null) => {
    const sub = { ref: { parent: { parent: { id: "u1" } }, update: vi.fn(async () => undefined), delete: vi.fn() }, data: () => ({ endpoint: "https://fcm.googleapis.com/a", timeZone: "Asia/Kolkata" }) };
    const docSnap = (name: string) => (name === "home" ? { exists: true, get: () => "allowed" } : { exists: !!prefs, data: () => prefs, get: () => undefined });
    return {
      collectionGroup: () => ({ get: async () => ({ docs: [sub] }) }),
      collection: () => ({ doc: () => ({ collection: () => ({ doc: (name: string) => ({ get: async () => docSnap(name) }), get: async () => ({ docs: [] }) }) }) }),
    } as never;
  };
  const run = async (prefs: Record<string, unknown> | null) => {
    const send = vi.fn(async () => "sent" as const);
    return (await sendReminders(cron(prefs), NOW, send)).sent;
  };

  it("no prefs doc: today's rule (nothing due, nothing sent)", async () => {
    expect(await run(null)).toBe(0);
  });
  it("weekly_checkin on for Sunday: sent on Sunday; for Monday: not", async () => {
    expect(await run({ types: { weekly_checkin: true }, weeklyCheckinDay: 0 })).toBe(1);
    expect(await run({ types: { weekly_checkin: true }, weeklyCheckinDay: 1 })).toBe(0);
  });
  it("routine_morning on but no routine step due: nothing", async () => {
    expect(await run({ types: { routine_morning: true }, weeklyCheckinDay: 0 })).toBe(0);
  });
});
