import { beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

// H37: GET /api/account/export gives a signed-in user their own data and
// nothing else: auth, the erased marker, 3 a day per uid, timestamps as ISO
// strings, the size limit, and only paths under the caller's own uid.

type Stored = { data: Record<string, unknown>; created: number };
const { verifyFirebaseIdToken, originalExists, presignExportRead, docs, readPaths } = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  originalExists: vi.fn(),
  presignExportRead: vi.fn(),
  docs: new Map<string, Stored>(),
  readPaths: [] as string[],
}));

const snap = (path: string) => {
  const d = docs.get(path);
  return { id: path.split("/").pop()!, exists: d !== undefined, data: () => d?.data, createTime: Timestamp.fromMillis(d?.created ?? 0) };
};
const docRef = (path: string): Record<string, unknown> => ({
  path,
  get: async () => (readPaths.push(path), snap(path)),
  collection: (c: string) => collRef(`${path}/${c}`),
});
const collRef = (path: string) => ({
  doc: (id: string) => docRef(`${path}/${id}`),
  get: async () => {
    readPaths.push(path);
    const ids = Array.from(docs.keys()).filter((k) => k.startsWith(`${path}/`) && !k.slice(path.length + 1).includes("/"));
    return { docs: ids.map(snap) };
  },
});

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return {
    bearerToken: actual.bearerToken,
    AdminNotConfiguredError: actual.AdminNotConfiguredError,
    verifyFirebaseIdToken,
    adminDb: () => ({
      collection: (c: string) => collRef(c),
      runTransaction: async (fn: (tx: unknown) => unknown) =>
        fn({
          get: (ref: { get: () => unknown }) => ref.get(),
          set: (ref: { path: string }, data: Record<string, unknown>) => docs.set(ref.path, { data, created: 0 }),
        }),
    }),
  };
});
vi.mock("@/lib/s3", () => ({
  originalExists,
  presignExportRead,
  S3NotConfiguredError: class S3NotConfiguredError extends Error {},
}));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null };
});

import { NextRequest } from "next/server";
import { GET } from "@/app/api/account/export/route";
import { NOT_INCLUDED, serializeWithinLimit, toPlain } from "@/app/api/account/_export";
import { EXPORT_COLLECTIONS, type DataExport } from "@/lib/feature-contracts/data-export";
import { bannedWordsIn } from "@/lib/catalog/wording";

const MINE = "0f8fad5b-d9cb-469f-a165-70867728950e";
const THEIRS = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const put = (path: string, data: Record<string, unknown>, created = 1) => docs.set(path, { data, created });

const get = (auth: string | null = "Bearer t") =>
  GET(new NextRequest("http://localhost/api/account/export", { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  docs.clear();
  readPaths.length = 0;
  verifyFirebaseIdToken.mockResolvedValue("alice");
  put(`users/alice/skinChecks/${MINE}`, {
    createdAt: Timestamp.fromDate(new Date("2026-10-01T10:00:00Z")),
    image: { stored: true },
    sideImages: { left: { stored: true }, right: { stored: false } },
  });
  put("users/alice/settings/home", { reminders: "allowed" });
  put(`users/bob/skinChecks/${THEIRS}`, { image: { stored: true }, secret: "BOBDATA" });
  put("users/bob/chatTurns/t1", { text: "BOBDATA" });
  originalExists.mockResolvedValue(true);
  presignExportRead.mockImplementation(async (key: string) => `https://s3.example/${key}?sig`);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/account/export", () => {
  it("the owner gets their own data as a dated, never-cached attachment", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="project-skin-data-\d{4}-\d{2}-\d{2}\.json"$/);
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    const file = (await res.json()) as DataExport;
    expect(file.uid).toBe("alice");
    expect(Object.keys(file.collections)).toEqual([...EXPORT_COLLECTIONS]);
    expect(file.collections.skinChecks).toEqual([
      { id: MINE, data: { createdAt: "2026-10-01T10:00:00.000Z", image: { stored: true }, sideImages: { left: { stored: true }, right: { stored: false } } } },
    ]);
    expect(file.collections.settings).toEqual([{ id: "home", data: { reminders: "allowed" } }]);
    expect(file.collections.checkins).toEqual([]); // BE3's collection may not exist yet
    expect(file.photos).toEqual([
      { scanId: MINE, angle: "front", url: `https://s3.example/users/alice/scans/${MINE}/original.jpg?sig` },
      { scanId: MINE, angle: "left", url: `https://s3.example/users/alice/scans/${MINE}/left.jpg?sig` },
    ]);
    expect(Date.parse(file.photoLinksExpireAt) - Date.parse(file.exportedAt)).toBe(3600_000);
    expect(file.truncated).toBe(false);
    expect(file.notIncluded).toEqual(NOT_INCLUDED);
  });

  it("only the caller's own paths are read, and another user's data never appears", async () => {
    const res = await get();
    expect(JSON.stringify(await res.json())).not.toMatch(/bob|BOBDATA|7c9e6679/);
    for (const p of readPaths) expect(p).toMatch(/^(users\/alice\/|erasedAccounts\/alice$)/);
    for (const [key] of originalExists.mock.calls) expect(key).toMatch(/^users\/alice\/scans\//);
  });

  it("a photo is linked only when the record says kept and storage has it", async () => {
    originalExists.mockImplementation(async (key: string) => !key.endsWith("left.jpg"));
    const file = (await (await get()).json()) as DataExport;
    expect(file.photos.map((p) => p.angle)).toEqual(["front"]);
    expect(originalExists).not.toHaveBeenCalledWith(expect.stringMatching(/right\.jpg$/));
  });

  it("no token or a failed verification: 401 and nothing read", async () => {
    expect((await get(null)).status).toBe(401);
    verifyFirebaseIdToken.mockRejectedValue(Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" }));
    const res = await get();
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ code: "AUTH_REQUIRED" });
    expect(readPaths).toEqual([]);
  });

  it("a uid that is not one plain path segment is refused before any read", async () => {
    verifyFirebaseIdToken.mockResolvedValue("alice/../bob");
    expect((await get()).status).toBe(403);
    expect(readPaths).toEqual([]);
  });

  it("an account being erased gets 403 and no data", async () => {
    put("erasedAccounts/alice", { sweepAfter: 1 });
    const res = await get();
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "NOT_ALLOWED" });
    expect(readPaths.filter((p) => p.includes("skinChecks"))).toEqual([]);
  });

  it("3 downloads a day per user, then 429 with Retry-After; another user is not affected", async () => {
    for (let i = 0; i < 3; i++) expect((await get()).status).toBe(200);
    const res = await get();
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ code: "TOO_MANY" });
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    verifyFirebaseIdToken.mockResolvedValue("carol");
    expect((await get()).status).toBe(200);
  });

  it("a storage failure is a plain 500 and the log carries no uid, key or URL", async () => {
    originalExists.mockRejectedValue(Object.assign(new Error(`denied users/alice/scans/${MINE}/original.jpg`), { name: "AccessDenied" }));
    const res = await get();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ code: "EXPORT_FAILED" });
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toMatch(/alice|original\.jpg|https?:/);
  });

  it("the route never caches", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/account/export/route.ts", "utf8");
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src).not.toMatch(/revalidate|s-maxage|public/);
  });
});

describe("toPlain", () => {
  it("turns Timestamps into ISO strings at any depth and leaves the rest alone", () => {
    const t = Timestamp.fromDate(new Date("2026-01-02T03:04:05.006Z"));
    expect(toPlain({ a: t, b: [t, { c: t }], n: 1, s: "x", z: null, f: false })).toEqual({
      a: "2026-01-02T03:04:05.006Z",
      b: ["2026-01-02T03:04:05.006Z", { c: "2026-01-02T03:04:05.006Z" }],
      n: 1,
      s: "x",
      z: null,
      f: false,
    });
  });
});

describe("serializeWithinLimit", () => {
  const entry = (id: string, size: number) => ({ id, data: { pad: "x".repeat(size) } });
  const file = (): DataExport => ({
    formatVersion: 1,
    exportedAt: "2026-10-15T00:00:00.000Z",
    uid: "alice",
    collections: {
      ...(Object.fromEntries(EXPORT_COLLECTIONS.map((c) => [c, []])) as unknown as DataExport["collections"]),
      chatTurns: [entry("old", 400), entry("mid", 400), entry("new", 400)],
      settings: [entry("home", 300)],
    },
    photos: [],
    photoLinksExpireAt: "2026-10-15T01:00:00.000Z",
    notIncluded: [],
    truncated: false,
  });

  it("under the limit: the file is unchanged", () => {
    const f = file();
    const body = serializeWithinLimit(f, 1_000_000);
    expect(JSON.parse(body)).toEqual(file());
  });

  it("over the limit: the largest collection loses its oldest entries first, and the file says so", () => {
    const f = file();
    const full = Buffer.byteLength(JSON.stringify(f));
    const body = serializeWithinLimit(f, full - 300);
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(full - 300);
    const out = JSON.parse(body) as DataExport;
    expect(out.truncated).toBe(true);
    expect(out.collections.chatTurns.map((e) => e.id)).toEqual(["mid", "new"]);
    expect(out.collections.settings).toHaveLength(1);
    expect(out.notIncluded).toEqual(["Your oldest Echo messages: the file has a size limit, so only the newest ones fit."]);
  });

  it("keeps cutting, moving to the next largest collection, until it fits", () => {
    const body = serializeWithinLimit(file(), 700);
    expect(Buffer.byteLength(body)).toBeLessThanOrEqual(700);
    expect((JSON.parse(body) as DataExport).truncated).toBe(true);
  });
});

describe("wording", () => {
  it("notIncluded uses no banned words", () => {
    for (const line of NOT_INCLUDED) expect(bannedWordsIn(line), line).toEqual([]);
  });
});
