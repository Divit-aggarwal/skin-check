import { beforeEach, describe, expect, it, vi } from "vitest";

// H01b erase route with fakes: order, stop-on-failure, identity only from the
// token, fresh sign-in, and the decision 9(b) receipt.
const { order, markErased, verifyFirebaseIdTokenClaims, revokeRefreshTokens, deleteUser, recursiveDelete, eraseUserPrefix, receipts, assertEraseConfigured } =
  vi.hoisted(() => {
    const order: string[] = [];
    return {
      order,
      markErased: vi.fn(async () => void order.push("mark")),
      verifyFirebaseIdTokenClaims: vi.fn(),
      revokeRefreshTokens: vi.fn(async () => void order.push("revoke")),
      deleteUser: vi.fn(async () => void order.push("auth")),
      recursiveDelete: vi.fn(async () => void order.push("firestore")),
      eraseUserPrefix: vi.fn(async () => {
        order.push("s3");
        return 2;
      }),
      receipts: { add: vi.fn(async (_: Record<string, unknown>) => ({})) },
      assertEraseConfigured: vi.fn(),
    };
  });

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return {
    bearerToken: actual.bearerToken,
    AdminNotConfiguredError: actual.AdminNotConfiguredError,
    verifyFirebaseIdTokenClaims,
    adminAuth: () => ({ revokeRefreshTokens, deleteUser }),
    adminDb: () => ({
      collection: (name: string) =>
        name === "erasures" ? receipts : { doc: (id: string) => ({ path: `${name}/${id}` }) },
      recursiveDelete,
    }),
  };
});
vi.mock("@/lib/s3", async () => {
  const actual = await vi.importActual<typeof import("@/lib/s3")>("@/lib/s3");
  return { ...actual, eraseUserPrefix, assertEraseConfigured };
});
vi.mock("@/lib/erase", async () => {
  const actual = await vi.importActual<typeof import("@/lib/erase")>("@/lib/erase");
  return { ...actual, markErased };
});
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null };
});

import { POST } from "@/app/api/account/erase/route";
import { ERASE_CONFIRMATION } from "@/lib/consent";
import { S3NotConfiguredError } from "@/lib/s3";
import { NextRequest } from "next/server";

const UID = "uid-erase-a";
const now = () => Math.floor(Date.now() / 1000);

const post = (body: unknown = { confirm: ERASE_CONFIRMATION }, authorization: string | null = "Bearer t") =>
  POST(
    new NextRequest("http://localhost/api/account/erase", {
      method: "POST",
      headers: authorization ? { authorization } : {},
      body: JSON.stringify(body),
    })
  );

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  verifyFirebaseIdTokenClaims.mockResolvedValue({ uid: UID, auth_time: now() - 10 });
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("erase route", () => {
  it("marks the account erased first (H04, TD-19), then revoke, S3, Firestore, Auth, all for the token's uid", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, steps: { mark: "done", revoke: "done", s3: "done", firestore: "done", auth: "done" } });
    expect(order).toEqual(["mark", "revoke", "s3", "firestore", "auth"]);
    expect(markErased).toHaveBeenCalledWith(UID);
    expect(revokeRefreshTokens).toHaveBeenCalledWith(UID);
    expect(eraseUserPrefix).toHaveBeenCalledWith(UID);
    expect(recursiveDelete).toHaveBeenCalledWith({ path: `users/${UID}` });
    expect(deleteUser).toHaveBeenCalledWith(UID);
  });

  it("an S3 failure stops Firestore and Auth and names the step", async () => {
    eraseUserPrefix.mockRejectedValueOnce(new Error("AccessDenied"));
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ ok: false, failedStep: "s3", completedSteps: ["mark", "revoke"] });
    expect(recursiveDelete).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
    expect(receipts.add).not.toHaveBeenCalled();
  });

  it("a Firestore failure stops Auth", async () => {
    recursiveDelete.mockRejectedValueOnce(new Error("unavailable"));
    const res = await post();
    expect(await res.json()).toMatchObject({ failedStep: "firestore", completedSteps: ["mark", "revoke", "s3"] });
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it("a revoke failure stops everything", async () => {
    revokeRefreshTokens.mockRejectedValueOnce(new Error("down"));
    expect(await (await post()).json()).toMatchObject({ failedStep: "revoke", completedSteps: ["mark"] });
    expect(eraseUserPrefix).not.toHaveBeenCalled();
  });

  it("running again after a partial failure completes the remaining steps", async () => {
    recursiveDelete.mockRejectedValueOnce(new Error("unavailable"));
    await post();
    order.length = 0;
    const res = await post();
    expect(res.status).toBe(200);
    expect(order).toEqual(["mark", "revoke", "s3", "firestore", "auth"]);
  });

  it("a failure to mark the account erased stops everything (nothing is deleted without the marker)", async () => {
    markErased.mockRejectedValueOnce(new Error("down"));
    expect(await (await post()).json()).toMatchObject({ failedStep: "mark", completedSteps: [] });
    expect(revokeRefreshTokens).not.toHaveBeenCalled();
    expect(eraseUserPrefix).not.toHaveBeenCalled();
  });

  it("an Auth user already gone counts as done", async () => {
    deleteUser.mockRejectedValueOnce(Object.assign(new Error("gone"), { code: "auth/user-not-found" }));
    expect((await post()).status).toBe(200);
  });

  it("the uid comes only from the token: a body uid is a 400 and nothing runs", async () => {
    const res = await post({ confirm: ERASE_CONFIRMATION, uid: "victim" });
    expect(res.status).toBe(400);
    expect(order).toEqual([]);
  });

  it("a missing or wrong confirmation is a 400", async () => {
    for (const body of [{}, { confirm: "delete" }]) expect((await post(body)).status).toBe(400);
    expect(order).toEqual([]);
  });

  it("no token is a 401; a token that fails verification is a 401", async () => {
    expect((await post(undefined, null)).status).toBe(401);
    verifyFirebaseIdTokenClaims.mockRejectedValueOnce(Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" }));
    expect((await post()).status).toBe(401);
    expect(order).toEqual([]);
  });

  it("a sign-in older than the limit is 403 REAUTH_REQUIRED and nothing runs", async () => {
    verifyFirebaseIdTokenClaims.mockResolvedValueOnce({ uid: UID, auth_time: now() - 301 });
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("REAUTH_REQUIRED");
    expect(order).toEqual([]);
  });

  it("erase credentials unset: 500 before anything runs, not even the revoke", async () => {
    assertEraseConfigured.mockImplementationOnce(() => {
      throw new S3NotConfiguredError(["S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID"]);
    });
    const res = await post();
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ failedStep: "s3", completedSteps: [] });
    expect(order).toEqual([]);
  });

  it("preflight: a uid that is not one plain path segment is refused before anything runs", async () => {
    for (const uid of ["victim/scans", "..", "a.b"]) {
      verifyFirebaseIdTokenClaims.mockResolvedValueOnce({ uid, auth_time: now() - 10 });
      const res = await post();
      expect(res.status).toBe(500);
      expect((await res.json()).failedStep).toBe("preflight");
    }
    expect(order).toEqual([]);
  });

  it("preflight: production with FIRESTORE_EMULATOR_HOST set is refused before anything runs", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:8080");
    const res = await post();
    vi.unstubAllEnvs();
    expect(res.status).toBe(500);
    expect((await res.json()).failedStep).toBe("preflight");
    expect(order).toEqual([]);
  });

  it("logs carry the error name and code, never the message (it can embed the doc path)", async () => {
    recursiveDelete.mockRejectedValueOnce(Object.assign(new Error(`BulkWriter failed at users/${UID}/skinChecks/x`), { code: 14 }));
    await post();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(UID);
  });

  it("writes one receipt with no uid, no uid hash and no phone (decision 9b)", async () => {
    await post();
    expect(receipts.add).toHaveBeenCalledTimes(1);
    const receipt = receipts.add.mock.calls[0]![0] as Record<string, unknown>;
    expect(Object.keys(receipt).sort()).toEqual(["erasedAt", "s3ObjectsDeleted", "schemaVersion", "steps"]);
    expect(Object.keys(receipt.steps as object)).toEqual(["mark", "revoke", "s3", "firestore", "auth"]);
    expect(JSON.stringify(receipt)).not.toContain(UID);
  });

  it("a failed receipt write is logged and the response is still ok", async () => {
    receipts.add.mockRejectedValueOnce(new Error("down"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(errorLog).toHaveBeenCalled();
  });

  it("no log line carries the uid", async () => {
    eraseUserPrefix.mockRejectedValueOnce(new Error("AccessDenied"));
    await post();
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain(UID);
  });
});
