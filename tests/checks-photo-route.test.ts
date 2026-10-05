import { beforeEach, describe, expect, it, vi } from "vitest";

// G03 / TD-25 (2): GET /api/checks/photo returns a signed-in user's OWN kept
// photo and nothing else. The owner asked for these attacks: another user's
// photo, an old login, a guessed address, a deleted account.

type Doc = { exists: boolean; get: (k: string) => unknown };
const { verifyFirebaseIdToken, originalExists, presignOriginalRead, docs } = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  originalExists: vi.fn(),
  presignOriginalRead: vi.fn(),
  docs: new Map<string, Record<string, unknown>>(),
}));

const docAt = (path: string): Doc => {
  const data = docs.get(path);
  return { exists: data !== undefined, get: (k: string) => data?.[k] };
};
const ref = (path: string) => ({
  get: async () => docAt(path),
  collection: (c: string) => ({ doc: (id: string) => ref(`${path}/${c}/${id}`) }),
});

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return {
    bearerToken: actual.bearerToken,
    AdminNotConfiguredError: actual.AdminNotConfiguredError,
    verifyFirebaseIdToken,
    adminDb: () => ({ collection: (c: string) => ({ doc: (id: string) => ref(`${c}/${id}`) }) }),
  };
});
vi.mock("@/lib/s3", () => ({
  originalExists,
  presignOriginalRead,
  READ_URL_TTL_SECONDS: 60,
  S3NotConfiguredError: class S3NotConfiguredError extends Error {},
}));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null };
});

import { NextRequest } from "next/server";
import { GET } from "@/app/api/checks/photo/route";

const MINE = "0f8fad5b-d9cb-469f-a165-70867728950e";
const THEIRS = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const get = (scanId: string | null = MINE, auth: string | null = "Bearer t") =>
  GET(new NextRequest(`http://localhost/api/checks/photo${scanId === null ? "" : `?scanId=${encodeURIComponent(scanId)}`}`, { headers: auth ? { authorization: auth } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  docs.clear();
  verifyFirebaseIdToken.mockResolvedValue("alice");
  docs.set(`users/alice/skinChecks/${MINE}`, { image: { stored: true } });
  docs.set(`users/bob/skinChecks/${THEIRS}`, { image: { stored: true } });
  originalExists.mockImplementation(async (key: string) => key === `users/alice/scans/${MINE}/original.jpg` || key === `users/bob/scans/${THEIRS}/original.jpg`);
  presignOriginalRead.mockImplementation(async (key: string) => `https://s3.example/${key}?sig`);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/checks/photo", () => {
  it("the owner gets a short-lived link to their own kept photo, never cacheable", async () => {
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: `https://s3.example/users/alice/scans/${MINE}/original.jpg?sig`, expiresIn: 60 });
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(res.headers.get("vary")).toBe("Authorization");
    expect(presignOriginalRead).toHaveBeenCalledWith(`users/alice/scans/${MINE}/original.jpg`);
  });

  it("no token, or a token that fails verification (expired, revoked, an old login, a deleted account): 401, nothing read", async () => {
    expect((await get(MINE, null)).status).toBe(401);
    expect((await get(MINE, "Basic abc")).status).toBe(401);
    verifyFirebaseIdToken.mockRejectedValue(Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" }));
    expect((await get()).status).toBe(401);
    verifyFirebaseIdToken.mockRejectedValue(Object.assign(new Error("gone"), { code: "auth/user-not-found" }));
    const res = await get();
    expect(res.status).toBe(401);
    expect(res.headers.get("cache-control")).toBe("private, no-store, max-age=0");
    expect(originalExists).not.toHaveBeenCalled();
    expect(presignOriginalRead).not.toHaveBeenCalled();
  });

  it("another user's photo: the key is always built from the caller's uid, so bob's check is a 404 for alice", async () => {
    const res = await get(THEIRS);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: "NO_PHOTO" });
    expect(presignOriginalRead).not.toHaveBeenCalled();
    for (const call of originalExists.mock.calls) expect(call[0]).toMatch(/^users\/alice\//);
  });

  it("guessed or crafted addresses: traversal, another prefix, empty and over-long ids are 404 with nothing looked up", async () => {
    for (const id of ["../bob/scans/x", "users/bob", "a/../b", "", "x".repeat(65), "short", `${MINE}.jpg`]) {
      const res = await get(id);
      expect(res.status, id).toBe(404);
    }
    expect((await get(null)).status).toBe(404);
    expect(originalExists).not.toHaveBeenCalled();
    expect(presignOriginalRead).not.toHaveBeenCalled();
  });

  it("a uid that is not one plain path segment is refused before any key is built", async () => {
    verifyFirebaseIdToken.mockResolvedValue("alice/../bob");
    expect((await get()).status).toBe(404);
    expect(originalExists).not.toHaveBeenCalled();
  });

  it("a deleted (being-erased) account gets nothing, even with a still-valid token", async () => {
    docs.set("erasedAccounts/alice", { sweepAfter: 1 });
    expect((await get()).status).toBe(404);
    expect(presignOriginalRead).not.toHaveBeenCalled();
  });

  it("nothing kept: no record, a record that says not kept, or no object in storage, all show nothing", async () => {
    docs.set(`users/alice/skinChecks/${MINE}`, { image: { stored: false } });
    expect((await get()).status).toBe(404);
    docs.set(`users/alice/skinChecks/${MINE}`, { image: null });
    expect((await get()).status).toBe(404);
    docs.delete(`users/alice/skinChecks/${MINE}`);
    expect((await get()).status).toBe(404);
    docs.set(`users/alice/skinChecks/${MINE}`, { image: { stored: true } });
    originalExists.mockResolvedValue(false);
    expect((await get()).status).toBe(404);
    expect(presignOriginalRead).not.toHaveBeenCalled();
  });

  it("a storage failure is a plain 500 and the log carries no key, uid or URL", async () => {
    originalExists.mockRejectedValue(Object.assign(new Error(`denied users/alice/scans/${MINE}/original.jpg`), { name: "AccessDenied" }));
    const res = await get();
    expect(res.status).toBe(500);
    const logged = JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls);
    expect(logged).not.toMatch(/alice|original\.jpg|https?:/);
  });

  it("the route never caches: it is dynamic and declares no revalidate", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("app/api/checks/photo/route.ts", "utf8");
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
    expect(src).not.toMatch(/revalidate|s-maxage|public/);
  });
});
