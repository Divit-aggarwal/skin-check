import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// TD-47 server side: the conditions source call, the place lookup, the push
// signing, the endpoint allow-list, what is due, and the routes' gates.
const { verifyFirebaseIdToken, adminDb } = vi.hoisted(() => ({ verifyFirebaseIdToken: vi.fn(), adminDb: vi.fn() }));
vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken, adminDb };
});

import { fetchWeather, WeatherUnavailableError } from "@/lib/home/open-meteo";
import { allowedEndpoint, dueToday, sendReminders, subscriptionId, vapidHeader } from "@/lib/home/push";
import { POST as weatherPOST } from "@/app/api/home/weather/route";
import { POST as placePOST } from "@/app/api/home/place/route";
import { DELETE as remindersDELETE, POST as remindersPOST } from "@/app/api/home/reminders/route";
import { GET as sendGET } from "@/app/api/home/reminders/send/route";

const FORECAST = { utc_offset_seconds: 19800, current: { time: "2026-10-11T09:30", relative_humidity_2m: 68 }, daily: { uv_index_max: [7.4] } };
const AIR = { current: { time: "2026-10-11T09:00", us_aqi: 85 } };

function stubFetch(fail = false) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
    calls.push(String(url));
    if (fail) return new Response("down", { status: 503 });
    return Response.json(String(url).includes("air-quality") ? AIR : FORECAST);
  }));
  return calls;
}

beforeEach(() => {
  verifyFirebaseIdToken.mockReset().mockImplementation(async (t: string) => {
    if (t !== "good") throw new Error("bad token");
    return "uid-1";
  });
  vi.stubEnv("WEATHER_SWITCH", "on");
  // Outside production the source is the local stand-in; fetch is stubbed in each test.
  vi.stubEnv("WEATHER_LOCAL_BASE_URL", "http://weather.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

let ip = 0;
const req = (url: string, body: unknown, token: string | null = "good", method = "POST") =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { "x-forwarded-for": `10.7.0.${++ip % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

describe("conditions source (Open-Meteo)", () => {
  it("production: the paid customer hosts with the key, and only the rounded position", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPEN_METEO_API_KEY", "test-key");
    vi.stubEnv("WEATHER_LOCAL_BASE_URL", "http://127.0.0.1:1");
    const calls = stubFetch();
    expect(await fetchWeather(130, 776)).toEqual({ uv: 7.4, humidity: 68, usAqi: 85, observedAt: "2026-10-11T04:00:00.000Z" });
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      const u = new URL(c);
      expect(u.hostname).toMatch(/^customer-(air-quality-)?api\.open-meteo\.com$/);
      expect(u.searchParams.get("latitude")).toBe("13.0");
      expect(u.searchParams.get("longitude")).toBe("77.6");
      expect(u.searchParams.get("apikey")).toBe("test-key");
      expect(c).not.toMatch(/uid|city|Bengaluru/i);
    }
  });

  it("production without a key: unavailable, and the free hosts are never called", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPEN_METEO_API_KEY", "");
    const calls = stubFetch();
    await expect(fetchWeather(130, 776)).rejects.toBeInstanceOf(WeatherUnavailableError);
    expect(calls).toEqual([]);
  });

  it("a source failure is unavailable", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "k");
    stubFetch(true);
    await expect(fetchWeather(130, 776)).rejects.toBeInstanceOf(WeatherUnavailableError);
  });
});

describe("/api/home/weather and /api/home/place", () => {
  it("off unless WEATHER_SWITCH is on", async () => {
    vi.stubEnv("WEATHER_SWITCH", "");
    expect((await weatherPOST(req("/api/home/weather", { latE1: 130, lonE1: 776 }))).status).toBe(404);
    expect((await placePOST(req("/api/home/place", { query: "Del" }))).status).toBe(404);
  });

  it("signed-in users only (never an open proxy to the paid source)", async () => {
    const calls = stubFetch();
    expect((await weatherPOST(req("/api/home/weather", { latE1: 130, lonE1: 776 }, null))).status).toBe(401);
    expect((await weatherPOST(req("/api/home/weather", { latE1: 130, lonE1: 776 }, "forged"))).status).toBe(401);
    expect((await placePOST(req("/api/home/place", { latE1: 130, lonE1: 776 }, null))).status).toBe(401);
    expect(calls).toEqual([]);
  });

  it("a precise position is refused, not rounded and sent on", async () => {
    const calls = stubFetch();
    expect((await weatherPOST(req("/api/home/weather", { latE1: 129.7194, lonE1: 775.9369 }))).status).toBe(400);
    expect((await weatherPOST(req("/api/home/weather", { lat: 12.97194, lon: 77.59369 }))).status).toBe(400);
    expect((await placePOST(req("/api/home/place", { latE1: 129.7194, lonE1: 776 }))).status).toBe(400);
    expect((await weatherPOST(req("/api/home/weather", "x".repeat(2000)))).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("returns the reading, or 503 UNAVAILABLE so the page can carry on", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "k");
    stubFetch();
    const ok = await weatherPOST(req("/api/home/weather", { latE1: 130, lonE1: 776 }));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ uv: 7.4, humidity: 68, usAqi: 85 });
    stubFetch(true);
    const down = await weatherPOST(req("/api/home/weather", { latE1: 130, lonE1: 776 }));
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ code: "UNAVAILABLE" });
  });

  it("the position sent upstream is snapped to a listed place, so the paid source and its cache see a bounded set", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "k");
    const calls = stubFetch();
    // A grid point in the sea near Mumbai still goes upstream as a listed place's position.
    await weatherPOST(req("/api/home/weather", { latE1: 189, lonE1: 720 }));
    const near = (await import("@/lib/home/places")).nearestPlace(189, 720);
    expect(new URL(calls[0]!).searchParams.get("latitude")).toBe((near.latE1 / 10).toFixed(1));
  });

  it("development without the local stand-in never calls the paid hosts", async () => {
    vi.stubEnv("OPEN_METEO_API_KEY", "real-key");
    vi.stubEnv("WEATHER_LOCAL_BASE_URL", "");
    const calls = stubFetch();
    await expect(fetchWeather(130, 776)).rejects.toBeInstanceOf(WeatherUnavailableError);
    expect(calls).toEqual([]);
  });

  it("place: from a rounded position or a typed name, from the offline list (no outside call)", async () => {
    const calls = stubFetch();
    const near = await (await placePOST(req("/api/home/place", { latE1: 130, lonE1: 776 }))).json();
    expect(near.places[0]).toMatchObject({ name: "Bengaluru", latE1: 130, lonE1: 776 });
    const typed = await (await placePOST(req("/api/home/place", { query: "Chenn" }))).json();
    expect(typed.places[0]).toMatchObject({ name: "Chennai" });
    expect(calls).toEqual([]);
  });
});

describe("web push", () => {
  it("only real push services; never http, a port, or another host; the local prefix never in production", () => {
    expect(allowedEndpoint("https://fcm.googleapis.com/fcm/send/abc")).toBe(true);
    expect(allowedEndpoint("https://updates.push.services.mozilla.com/wpush/v2/abc")).toBe(true);
    expect(allowedEndpoint("https://web.push.apple.com/QGx")).toBe(true);
    expect(allowedEndpoint("https://wns2-par02p.notify.windows.com/w/?token=x")).toBe(true);
    expect(allowedEndpoint("http://fcm.googleapis.com/x")).toBe(false);
    expect(allowedEndpoint("https://fcm.googleapis.com:8443/x")).toBe(false);
    expect(allowedEndpoint("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(allowedEndpoint("https://169.254.169.254/latest")).toBe(false);
    expect(allowedEndpoint(42)).toBe(false);
    vi.stubEnv("PUSH_LOCAL_ENDPOINT_PREFIX", "http://127.0.0.1:9/push/");
    expect(allowedEndpoint("http://127.0.0.1:9/push/a")).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(allowedEndpoint("http://127.0.0.1:9/push/a")).toBe(false);
  });

  it("signs a VAPID token (ES256) for the push service's origin with our own keys", () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pub = publicKey.export({ format: "jwk" });
    const raw = Buffer.concat([Buffer.from([4]), Buffer.from(pub.x!, "base64url"), Buffer.from(pub.y!, "base64url")]);
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", raw.toString("base64url"));
    vi.stubEnv("VAPID_PRIVATE_KEY", privateKey.export({ format: "jwk" }).d!);
    const header = vapidHeader("https://fcm.googleapis.com/fcm/send/abc", Date.parse("2026-10-11T00:00:00Z"));
    const [, t, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(raw.toString("base64url"));
    const [h, b, s] = t!.split(".");
    expect(JSON.parse(Buffer.from(b!, "base64url").toString())).toMatchObject({ aud: "https://fcm.googleapis.com", exp: Date.parse("2026-10-11T12:00:00Z") / 1000 });
    const ok = verify("sha256", Buffer.from(`${h}.${b}`), { key: createPublicKey(publicKey.export({ format: "pem", type: "spki" })), dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"));
    expect(ok).toBe(true);
  });

  it("what is due: a check only on its due day; routine steps on their weekdays", () => {
    const check = (id: string, iso: string) => ({ id, data: { createdAt: new Date(iso), result: { scores: { redness: 0.3, oiliness: 0.3, texture: 0.3, pores: 0.3, blemishes: 0.3, hydration: 0.3, pigment: 0.3 } } } });
    const start = { type: "start", productId: "p", effectiveDate: "2026-10-01", recordedAt: "", eventId: "e", schedule: { slot: "AM", days: [0] } } as never;
    const data = { checks: [check("c1", "2026-10-04T05:00:00Z")], analyses: [], events: [start] };
    expect(dueToday("u", data, "Asia/Kolkata", new Date("2026-10-11T05:00:00Z"))).toEqual({ check: true, routine: true }); // a Sunday
    expect(dueToday("u", data, "Asia/Kolkata", new Date("2026-10-12T05:00:00Z"))).toEqual({ check: false, routine: false }); // overdue: no repeat
    expect(dueToday("u", { checks: [], analyses: [], events: [] }, "Asia/Kolkata", new Date())).toEqual({ check: false, routine: false });
  });

  // A Firestore stand-in for the cron: users with settings, events and subscriptions.
  function cronDb(users: Record<string, { reminders?: string; routine?: boolean; subs: { id: string; endpoint: string; createdAt?: number; lastSentOn?: string; timeZone?: string }[] }>) {
    const deleted: string[] = [];
    const updated: Record<string, unknown> = {};
    const start = { type: "start", productId: "p", effectiveDate: "2026-10-01", recordedAt: "", eventId: "e", schedule: { slot: "AM", days: [0, 1, 2, 3, 4, 5, 6] } };
    const docs = Object.entries(users).flatMap(([uid, u]) =>
      u.subs.map((sub) => ({
        ref: { parent: { parent: { id: uid } }, delete: async () => void deleted.push(`${uid}/${sub.id}`), update: async (d: unknown) => void (updated[`${uid}/${sub.id}`] = d) },
        data: () => ({ endpoint: sub.endpoint, timeZone: sub.timeZone ?? "Asia/Kolkata", lastSentOn: sub.lastSentOn, createdAt: { toMillis: () => sub.createdAt ?? 0 } }),
      }))
    );
    const db = {
      collectionGroup: () => ({ get: async () => ({ docs }) }),
      collection: () => ({
        doc: (uid: string) => ({
          collection: (c: string) => ({
            doc: () => ({ get: async () => ({ get: (f: string) => (f === "reminders" ? users[uid]?.reminders ?? "allowed" : undefined) }) }),
            get: async () => ({ docs: c === "routineEvents" && users[uid]?.routine !== false ? [{ id: "e", data: () => start }] : [] }),
          }),
        }),
      }),
    };
    return { db: db as never, deleted, updated };
  }
  const NOW = new Date("2026-10-11T03:30:00Z");
  const fcm = (x: string) => `https://fcm.googleapis.com/${x}`;

  it("the cron: one push per subscription per local day, only when due; a gone subscription is removed", async () => {
    const { db, deleted, updated } = cronDb({
      due: { subs: [{ id: "a", endpoint: fcm("a") }] },
      already: { subs: [{ id: "b", endpoint: fcm("b"), lastSentOn: "2026-10-11" }] },
      gone: { subs: [{ id: "g", endpoint: fcm("gone") }] },
      nothing: { routine: false, subs: [{ id: "c", endpoint: fcm("c") }] },
    });
    const send = vi.fn(async (endpoint: string) => (endpoint.endsWith("gone") ? ("gone" as const) : ("sent" as const)));
    expect(await sendReminders(db, NOW, send)).toEqual({ sent: 1, removed: 1, failed: 0, skipped: 0 });
    expect(send.mock.calls.map((c) => c[0])).toEqual([fcm("a"), fcm("gone")]);
    expect(updated).toEqual({ "due/a": { lastSentOn: "2026-10-11" } });
    expect(deleted).toEqual(["gone/g"]);
  });

  it("the cron: reminders turned off in Account send nothing, even with a subscription left on a browser", async () => {
    const { db } = cronDb({ off: { reminders: "not_now", subs: [{ id: "a", endpoint: fcm("a") }] } });
    const send = vi.fn(async () => "sent" as const);
    expect(await sendReminders(db, NOW, send)).toMatchObject({ sent: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("the cron: one browser shared by two accounts keeps only the newest account's subscription", async () => {
    const { db, deleted } = cronDb({ older: { subs: [{ id: "x", endpoint: fcm("shared"), createdAt: 1 }] }, newer: { subs: [{ id: "y", endpoint: fcm("shared"), createdAt: 2 }] } });
    const send = vi.fn(async () => "sent" as const);
    expect(await sendReminders(db, NOW, send)).toMatchObject({ sent: 1, removed: 1 });
    expect(deleted).toEqual(["older/x"]);
  });

  it("the cron: a stored time zone the runtime rejects falls back to India time instead of stopping everyone", async () => {
    const { db } = cronDb({ bad: { subs: [{ id: "a", endpoint: fcm("a"), timeZone: "Mars/Olympus" }] }, good: { subs: [{ id: "b", endpoint: fcm("b") }] } });
    expect(await sendReminders(db, NOW, vi.fn(async () => "sent" as const))).toMatchObject({ sent: 2, failed: 0 });
  });

  it("the cron: past its time budget it starts no new account and says how many are left", async () => {
    const { db } = cronDb({ a: { subs: [{ id: "a", endpoint: fcm("a") }] } });
    expect(await sendReminders(db, NOW, vi.fn(async () => "sent" as const), -1)).toMatchObject({ sent: 0, skipped: 1 });
  });

  function subsDb(existing: string[], markers: { erased?: boolean; under18?: boolean } = {}) {
    const set = vi.fn();
    const del = vi.fn();
    const paths: string[] = [];
    const docs = existing.map((id) => ({ id, ref: { delete: del } }));
    adminDb.mockReturnValue({
      collection: (name: string) => ({
        doc: (uid: string) =>
          name === "users"
            ? { collection: () => ({ get: async () => ({ size: docs.length, docs }), doc: (id: string) => (paths.push(`${uid}/${id}`), { set, delete: del }) }) }
            : { get: async () => ({ exists: name === "erasedAccounts" ? !!markers.erased : !!markers.under18 }) },
      }),
    });
    return { set, del, paths };
  }

  it("subscribe: off unless PUSH_SWITCH is on and the key is set; signed in; allow-listed endpoint; the id is the endpoint's hash", async () => {
    const { set, paths } = subsDb([]);
    const body = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", timeZone: "Asia/Kolkata" };
    expect((await remindersPOST(req("/api/home/reminders", body))).status).toBe(404);
    vi.stubEnv("PUSH_SWITCH", "on");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "x");
    expect((await remindersPOST(req("/api/home/reminders", body, null))).status).toBe(401);
    expect((await remindersPOST(req("/api/home/reminders", { endpoint: "https://evil.example/x" }))).status).toBe(400);
    expect((await remindersPOST(req("/api/home/reminders", body))).status).toBe(201);
    expect(Object.keys(set.mock.calls[0]![0]).sort()).toEqual(["createdAt", "endpoint", "timeZone"]);
    expect(paths.at(-1)).toBe(`uid-1/${subscriptionId(body.endpoint)}`);
  });

  it("subscribe: at most five browsers per account; an erased or under-18 account stores nothing", async () => {
    vi.stubEnv("PUSH_SWITCH", "on");
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "x");
    const body = { endpoint: "https://fcm.googleapis.com/fcm/send/new" };
    let db = subsDb(["1", "2", "3", "4", "5"]);
    expect((await remindersPOST(req("/api/home/reminders", body))).status).toBe(409);
    expect(db.set).not.toHaveBeenCalled();
    db = subsDb(["1", "2", "3", "4", subscriptionId(body.endpoint)]);
    expect((await remindersPOST(req("/api/home/reminders", body))).status).toBe(201); // the same browser again
    db = subsDb([], { under18: true });
    expect((await remindersPOST(req("/api/home/reminders", body))).status).toBe(403);
    db = subsDb([], { erased: true });
    expect((await remindersPOST(req("/api/home/reminders", body))).status).toBe(403);
    expect(db.set).not.toHaveBeenCalled();
  });

  it("turn off: {all: true} removes every browser of the account; {endpoint} only this one; both work with the switch off", async () => {
    const { del } = subsDb(["1", "2", "3"]);
    expect((await remindersDELETE(req("/api/home/reminders", { all: true }, "good", "DELETE"))).status).toBe(200);
    expect(del).toHaveBeenCalledTimes(3);
    expect((await remindersDELETE(req("/api/home/reminders", { endpoint: "https://fcm.googleapis.com/x" }, "good", "DELETE"))).status).toBe(200);
    expect(del).toHaveBeenCalledTimes(4);
    expect((await remindersDELETE(req("/api/home/reminders", { all: true }, null, "DELETE"))).status).toBe(401);
  });

  it("push requests never follow a redirect", async () => {
    const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const j = publicKey.export({ format: "jwk" });
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", Buffer.concat([Buffer.from([4]), Buffer.from(j.x!, "base64url"), Buffer.from(j.y!, "base64url")]).toString("base64url"));
    vi.stubEnv("VAPID_PRIVATE_KEY", privateKey.export({ format: "jwk" }).d!);
    const f = vi.fn(async () => new Response(null, { status: 201 }));
    vi.stubGlobal("fetch", f);
    const { sendPush } = await import("@/lib/home/push");
    expect(await sendPush(fcm("a"))).toBe("sent");
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1]).toMatchObject({ method: "POST", redirect: "error" });
  });

  it("the cron route needs the cron secret and does nothing while push is off", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    const get = (auth?: string) => sendGET(new NextRequest("http://localhost/api/home/reminders/send", { headers: auth ? { authorization: auth } : {} }));
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong!")).status).toBe(401);
    expect(await (await get("Bearer s3cret")).json()).toEqual({ ok: true, off: true });
  });
});

describe("nothing of Home reaches Gemini (TD-47 (4))", () => {
  it("no Echo or Gemini code reads the Home settings, the push subscriptions or the weather", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const files = [
      ...readdirSync("lib/context").map((f) => `lib/context/${f}`),
      "lib/gemini.ts",
      "lib/echo-trusted-context.ts",
      "lib/echo-newest-scan.ts",
      "app/api/skin-check/chat/route.ts",
    ];
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/"settings"|'settings'|pushSubscriptions|lib\/home|open-meteo|latE1/);
  });
});
