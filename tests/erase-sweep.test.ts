import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// H04 + H21 (TD-19): the erased marker and the second sweep, with fakes. The
// real stack proof is tests/privacy.e2e.test.ts (late upload, late writes).
const h = vi.hoisted(() => {
  const markers = new Map<string, { sweepAfter: { toMillis(): number }; markedAt: unknown }>();
  return {
    markers,
    eraseUserPrefix: vi.fn(async (_uid: string) => 1),
    recursiveDelete: vi.fn(async (_ref: { path: string }) => undefined),
    deleted: [] as string[],
    deleteUser: vi.fn(async (_uid: string) => undefined),
  };
});

vi.mock("@/lib/s3", () => ({ eraseUserPrefix: h.eraseUserPrefix, UPLOAD_URL_TTL_SECONDS: 300 }));
vi.mock("@/lib/firebase/admin", () => {
  const markerDoc = (id: string) => ({
    id,
    ref: { delete: async () => void h.markers.delete(id) },
  });
  return {
    adminAuth: () => ({ deleteUser: h.deleteUser }),
    adminDb: () => ({
      collection: (name: string) => ({
        doc: (id: string) => ({ path: `${name}/${id}`, id, delete: async () => void h.deleted.push(`${name}/${id}`) }),
        where: (_f: string, _op: string, limit: { toMillis(): number }) => ({
          get: async () => ({
            docs: Array.from(h.markers.entries())
              .filter(([, m]) => m.sweepAfter.toMillis() <= limit.toMillis())
              .map(([id]) => markerDoc(id)),
          }),
        }),
      }),
      recursiveDelete: h.recursiveDelete,
      runTransaction: async (fn: (tx: unknown) => Promise<void>) =>
        fn({
          get: async (ref: { id: string }) => ({ get: (k: string) => (h.markers.get(ref.id) as Record<string, unknown> | undefined)?.[k] }),
          set: (ref: { id: string }, data: { sweepAfter: { toMillis(): number }; markedAt: unknown }) => void h.markers.set(ref.id, data),
        }),
    }),
  };
});

import { ERASE_SWEEP_DELAY_SECONDS, markErased, MAX_REQUEST_SECONDS, sweepDelaySeconds, sweepErasedAccounts } from "@/lib/erase";

const T0 = Date.UTC(2026, 9, 4, 10);
beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  h.markers.clear();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("sweep delay", () => {
  it("covers an old ID token, a request still running and an upload link still valid", () => {
    expect(ERASE_SWEEP_DELAY_SECONDS).toBe(3600 + 300 + 300);
  });

  it("no API route may run longer than the delay assumes", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/route\.tsx?$/.test(f)) files.push(p);
      }
    };
    walk("app/api");
    expect(files.length).toBeGreaterThan(5);
    for (const f of files) {
      const m = /export const maxDuration\s*=\s*(\d+)/.exec(readFileSync(f, "utf8"));
      if (m) expect(Number(m[1]), f).toBeLessThanOrEqual(MAX_REQUEST_SECONDS);
    }
  });

  it("the local override is used outside production and ignored in production builds", () => {
    vi.stubEnv("ERASE_SWEEP_DELAY_SECONDS", "2");
    vi.stubEnv("NODE_ENV", "development");
    expect(sweepDelaySeconds()).toBe(2);
    vi.stubEnv("NODE_ENV", "production");
    expect(sweepDelaySeconds()).toBe(ERASE_SWEEP_DELAY_SECONDS);
  });
});

describe("markErased", () => {
  it("sets the sweep time; a rerun never moves it earlier", async () => {
    await markErased("u1", T0);
    const first = h.markers.get("u1")!.sweepAfter.toMillis();
    expect(first).toBe(T0 + ERASE_SWEEP_DELAY_SECONDS * 1000);
    await markErased("u1", T0 - 60_000);
    expect(h.markers.get("u1")!.sweepAfter.toMillis()).toBe(first);
    await markErased("u1", T0 + 60_000);
    expect(h.markers.get("u1")!.sweepAfter.toMillis()).toBe(first + 60_000);
  });
});

describe("sweepErasedAccounts", () => {
  it("only due accounts: S3, the Firestore tree and Auth again, then the marker goes", async () => {
    await markErased("due", T0);
    await markErased("later", T0 + 3_600_000);
    const res = await sweepErasedAccounts(T0 + ERASE_SWEEP_DELAY_SECONDS * 1000);
    expect(res).toEqual({ swept: 1, failed: 0 });
    expect(h.eraseUserPrefix).toHaveBeenCalledWith("due");
    expect(h.recursiveDelete).toHaveBeenCalledWith(expect.objectContaining({ path: "users/due" }));
    expect(h.deleted).toContain("under18Accounts/due");
    expect(h.deleteUser).toHaveBeenCalledWith("due");
    expect(Array.from(h.markers.keys())).toEqual(["later"]);
  });

  it("nothing is due before the delay", async () => {
    await markErased("u", T0);
    expect(await sweepErasedAccounts(T0 + ERASE_SWEEP_DELAY_SECONDS * 1000 - 1)).toEqual({ swept: 0, failed: 0 });
    expect(h.eraseUserPrefix).not.toHaveBeenCalled();
  });

  it("a user already gone from Auth counts as done (an erase that finished)", async () => {
    await markErased("u", T0);
    h.deleteUser.mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "auth/user-not-found" }));
    expect(await sweepErasedAccounts(T0 + 1e9)).toEqual({ swept: 1, failed: 0 });
    expect(h.markers.size).toBe(0);
  });

  it("a failed step keeps that marker for the next run, the others still go, and no log carries a uid", async () => {
    await markErased("uid-bad", T0);
    await markErased("uid-good", T0);
    h.recursiveDelete.mockImplementationOnce(async () => {
      throw Object.assign(new Error("BulkWriter failed at users/uid-bad/x"), { code: 14 });
    });
    expect(await sweepErasedAccounts(T0 + 1e9)).toEqual({ swept: 1, failed: 1 });
    expect(Array.from(h.markers.keys())).toEqual(["uid-bad"]);
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toMatch(/uid-bad|uid-good/);
  });
});

describe("sweep route", () => {
  const call = async (authorization?: string) => {
    const { GET } = await import("@/app/api/account/erase/sweep/route");
    const { NextRequest } = await import("next/server");
    return GET(new NextRequest("http://localhost/api/account/erase/sweep", { headers: authorization ? { authorization } : {} }));
  };

  it("refuses when CRON_SECRET is not set", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer anything")).status).toBe(500);
    expect(h.eraseUserPrefix).not.toHaveBeenCalled();
  });

  it("401 with no or a wrong secret; nothing runs", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    await markErased("u", 0);
    for (const auth of [undefined, "Bearer wrong", "Bearer s3cret-valu", "s3cret-value", "Basic s3cret-value"]) {
      expect((await call(auth)).status, String(auth)).toBe(401);
    }
    expect(h.eraseUserPrefix).not.toHaveBeenCalled();
  });

  it("the right secret sweeps and returns counts only", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret-value");
    await markErased("u", 0);
    const res = await call("Bearer s3cret-value");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, swept: 1, failed: 0 });
  });
});
