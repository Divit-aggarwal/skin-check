import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

// /api/routine/events. Firebase Admin is replaced by an in-memory store keyed
// by full document path; the auth, validation and path-building under test are
// the route's own.
const { verifyFirebaseIdToken, adminDb, store } = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  adminDb: vi.fn(),
  store: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken, adminDb };
});

// One extra, discontinued product so availability rules can be tested.
vi.mock("@/lib/catalog/catalogue", async () => {
  const actual = await vi.importActual<typeof import("@/lib/catalog/catalogue")>("@/lib/catalog/catalogue");
  const old = { ...actual.CATALOGUE.products[0]!, id: "old-product", name: "Old (SYNTHETIC)", availability: "discontinued" as const };
  const products = [...actual.CATALOGUE.products, old];
  return { ...actual, CATALOGUE: { ...actual.CATALOGUE, products }, getProduct: (id: string) => products.find((p) => p.id === id) };
});

import { GET, POST } from "@/app/api/routine/events/route";
import { NextRequest } from "next/server";
import { CATALOG_VERSION } from "@/lib/catalog/catalogue";
import { OTHER_PRODUCT_ID } from "@/lib/routine/events";

const UID = "verified-uid";
const ID1 = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ID2 = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const SCHED = { slot: "AM", days: [0, 1, 2, 3, 4, 5, 6] };
const start = { type: "start", eventId: ID1, productId: "sample-cleanser", effectiveDate: "2026-10-01", timeZone: "Asia/Kolkata", schedule: SCHED };

function fakeDb() {
  const collection = (prefix: string) => ({
    doc: (id: string) => docRef(`${prefix}/${id}`),
    get: async () => ({
      docs: Array.from(store.entries())
        .filter(([p]) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes("/"))
        .map(([, data]) => ({ data: () => data })),
    }),
  });
  const docRef = (path: string) => ({
    collection: (n: string) => collection(`${path}/${n}`),
    create: async (data: Record<string, unknown>) => {
      if (store.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
      // Resolve the serverTimestamp sentinel the way Firestore does.
      store.set(path, { ...structuredClone({ ...data, recordedAt: null }), recordedAt: Timestamp.fromDate(new Date()) });
    },
    get: async () => ({ data: () => store.get(path) }),
  });
  return { collection };
}

let ip = 0;
const headers = (token: string | null = "good") => ({
  "x-forwarded-for": `10.9.0.${++ip % 250}`,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});
const post = (body: unknown, token: string | null = "good") =>
  POST(new NextRequest("http://localhost/api/routine/events", { method: "POST", headers: headers(token), body: JSON.stringify(body) }));
const get = (query = "", token: string | null = "good") =>
  GET(new NextRequest(`http://localhost/api/routine/events${query}`, { headers: headers(token) }));
const code = async (r: Response) => ((await r.json()) as { code?: string }).code;
const path = (id: string, uid = UID) => `users/${uid}/routineEvents/${id}`;

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  // 2026-10-03 00:00 in Asia/Kolkata; still 2026-10-02 in UTC.
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T18:30:00Z"));
  verifyFirebaseIdToken.mockImplementation(async (t: string) => {
    if (t !== "good") throw Object.assign(new Error("bad"), { code: "auth/argument-error" });
    return UID;
  });
  adminDb.mockImplementation(fakeDb);
});
afterEach(() => vi.useRealTimers());

describe("POST /api/routine/events", () => {
  it("no token and a bad token give 401, with no write", async () => {
    expect((await post(start, null)).status).toBe(401);
    expect((await post(start, "forged")).status).toBe(401);
    expect(store.size).toBe(0);
  });

  it("a uid field in the body is rejected (strict)", async () => {
    const r = await post({ ...start, uid: "victim" });
    expect(r.status).toBe(400);
    expect(store.size).toBe(0);
  });

  it("unknown productId / toProductId give 400 unknown_product", async () => {
    expect(await code(await post({ ...start, productId: "nope" }))).toBe("unknown_product");
    const sub = { ...start, type: "substitute", toProductId: "nope" };
    expect(await code(await post(sub))).toBe("unknown_product");
  });

  it("OTHER_PRODUCT_ID is accepted as productId and toProductId", async () => {
    expect((await post({ ...start, productId: OTHER_PRODUCT_ID })).status).toBe(201);
    const sub = { ...start, eventId: ID2, type: "substitute", productId: "sample-cleanser", toProductId: OTHER_PRODUCT_ID };
    expect((await post(sub)).status).toBe(201);
  });

  it("a body over 4 KB gives 413 even without a Content-Length", async () => {
    const big = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode(JSON.stringify({ ...start, pad: "x".repeat(5000) })));
        c.close();
      },
    });
    const r = await POST(
      new NextRequest("http://localhost/api/routine/events", { method: "POST", headers: headers(), body: big, duplex: "half" } as never)
    );
    expect(r.status).toBe(413);
    expect(store.size).toBe(0);
  });

  it("an upper-case eventId is rejected, so one event has one spelling", async () => {
    expect((await post({ ...start, eventId: ID1.toUpperCase() })).status).toBe(400);
  });

  it("toProductId === productId gives 400", async () => {
    expect((await post({ ...start, type: "substitute", toProductId: start.productId })).status).toBe(400);
  });

  it("starting a non-available product gives product_not_available; stop and usage of it are accepted", async () => {
    expect(await code(await post({ ...start, productId: "old-product" }))).toBe("product_not_available");
    const sub = { ...start, type: "substitute", toProductId: "old-product" };
    expect(await code(await post(sub))).toBe("product_not_available");
    const { schedule: _s, ...base } = start;
    void _s;
    expect((await post({ ...base, type: "stop", productId: "old-product" })).status).toBe(201);
    const usage = { ...base, eventId: ID2, type: "usage", productId: "old-product", slot: "AM", status: "used" };
    expect((await post(usage)).status).toBe(201);
  });

  it("writes to users/{uid from the token}/routineEvents/{eventId} and nowhere else", async () => {
    expect((await post(start)).status).toBe(201);
    expect(Array.from(store.keys())).toEqual([path(ID1)]);
  });

  it("a future effectiveDate for the time zone gives future_date (Asia/Kolkata midnight)", async () => {
    expect((await post({ ...start, effectiveDate: "2026-10-03" })).status).toBe(201);
    expect(await code(await post({ ...start, eventId: ID2, effectiveDate: "2026-10-04" }))).toBe("future_date");
    expect(await code(await post({ ...start, eventId: ID2, effectiveDate: "2026-10-03", timeZone: "UTC" }))).toBe("future_date");
  });

  it("an invalid time zone gives 400", async () => {
    expect((await post({ ...start, timeZone: "Mars/Olympus" })).status).toBe(400);
  });

  it("stores server recordedAt, catalogVersion, source and schemaVersion", async () => {
    await post({ ...start, recordedAt: "2020-01-01" }).then((r) => expect(r.status).toBe(400));
    await post(start);
    const doc = store.get(path(ID1))!;
    expect(doc).toMatchObject({ ...start, schemaVersion: 1, catalogVersion: CATALOG_VERSION, source: "user" });
    expect(doc.recordedAt).toBeInstanceOf(Timestamp);
  });

  it("a replay with the same input gives 200 and no second write, even after a catalogue version bump", async () => {
    expect((await post(start)).status).toBe(201);
    const before = structuredClone(store.get(path(ID1)));
    expect((await post(start)).status).toBe(200);
    expect(store.get(path(ID1))).toEqual(before);
    store.set(path(ID1), { ...store.get(path(ID1))!, catalogVersion: "catalog-older" });
    expect((await post(start)).status).toBe(200);
  });

  it("the same eventId with a different body gives 409", async () => {
    await post(start);
    expect(await code(await post({ ...start, productId: "sample-sunscreen" }))).toBe("event_id_conflict");
  });

  it("a substitution creates a new document and leaves the earlier start unchanged", async () => {
    await post(start);
    const before = structuredClone(store.get(path(ID1)));
    const sub = { ...start, eventId: ID2, type: "substitute", toProductId: "sample-moisturiser", effectiveDate: "2026-10-02" };
    expect((await post(sub)).status).toBe(201);
    expect(store.size).toBe(2);
    expect(store.get(path(ID1))).toEqual(before);
  });
});

describe("GET /api/routine/events", () => {
  it("needs auth", async () => {
    expect((await get("", null)).status).toBe(401);
  });

  it("returns only the caller's events, with routine and adherence", async () => {
    await post(start);
    store.set(path(ID2, "victim"), { ...start, eventId: ID2, productId: "sample-sunscreen", recordedAt: Timestamp.now() });
    const r = await get();
    expect(r.status).toBe(200);
    const body = await r.json();
    expect(body.events.map((e: { eventId: string }) => e.eventId)).toEqual([ID1]);
    expect(body.today).toBe("2026-10-03");
    expect(body.routine).toEqual([{ productId: "sample-cleanser", schedule: SCHED, since: "2026-10-01" }]);
    expect(body.adherence.counts).toEqual({ used: 0, skipped: 0, unknown: 3 });
    expect(JSON.stringify(body.products)).not.toContain("claims");
  });

  it("an invalid tz gives 400 bad_time_zone; a valid tz moves today", async () => {
    expect(await code(await get("?tz=Mars/Olympus"))).toBe("bad_time_zone");
    expect((await (await get("?tz=UTC")).json()).today).toBe("2026-10-02");
  });
});

describe("per-user write cap", () => {
  it("the 201st POST in a day from one uid gives 429, whatever its IP", async () => {
    verifyFirebaseIdToken.mockResolvedValue("busy-uid");
    for (let i = 0; i < 200; i++) expect((await post({})).status).toBe(400);
    expect(await code(await post(start))).toBe("too_many_events");
  });
});
