import { beforeEach, describe, expect, it, vi } from "vitest";

// Gate 02: /api/skin-check/chat sits behind a verified Firebase ID token.
// Firebase, Gemini, and the rate limiter are stubbed; the auth ordering under
// test is the route's own.
const { verifyFirebaseIdToken, getSkinCheckChatReply, consumeDailyQuota, loadTrustedEchoContext } = vi.hoisted(
  () => ({
    verifyFirebaseIdToken: vi.fn(),
    getSkinCheckChatReply: vi.fn(),
    consumeDailyQuota: vi.fn(),
    loadTrustedEchoContext: vi.fn(),
  })
);

// F13: the route's newest-check guard; tests/echo-newest-scan.test.ts covers it.
vi.mock("@/lib/echo-newest-scan", () => ({ checkEchoScan: async () => "ok" }));
vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return {
    bearerToken: actual.bearerToken,
    AdminNotConfiguredError: actual.AdminNotConfiguredError,
    verifyFirebaseIdToken,
  };
});
vi.mock("@/lib/gemini", () => ({ getSkinCheckChatReply }));
// Trusted-context loading has its own suite (skin-check-chat-trusted-context.test.ts).
vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext }));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null, consumeDailyQuota };
});

// Privacy lane (H02a/H03c): this suite tests auth and trusted context, not the
// consent gates (tests/privacy-chat-gate.test.ts), so the user is attested and consented.
vi.mock("@/app/api/account/_ledger", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/account/_ledger")>("@/app/api/account/_ledger");
  return { ...actual, ageStatus: async () => "over18", latestGrant: async () => true };
});
import { POST } from "@/app/api/skin-check/chat/route";
import { AdminNotConfiguredError } from "@/lib/firebase/admin";
import { NextRequest } from "next/server";

const BODY = { scanId: "0f8fad5b-d9cb-469f-a165-70867728950e", region: "cheeks", history: [], message: "hi" };
const SCORES = { redness: 1, oiliness: 1, texture: 1, pores: 0, blemishes: 1, hydration: 1, pigment: 1 };

function post(authorization?: string, body: unknown = BODY) {
  return POST(
    new NextRequest("http://localhost:3000/api/skin-check/chat", {
      method: "POST",
      headers: { "content-type": "application/json", ...(authorization ? { authorization } : {}) },
      body: JSON.stringify(body),
    })
  );
}

const firebaseError = (code: string) => Object.assign(new Error(`Firebase: ${code}`), { code });

async function expectUnauthorized(res: Response) {
  expect(res.status).toBe(401);
  expect(await res.json()).toEqual({ error: "Authentication required.", code: "AUTH_REQUIRED" });
  expect(getSkinCheckChatReply).not.toHaveBeenCalled();
  expect(consumeDailyQuota).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
  // Today's Echo, which runs only behind the switch (F12, TD-20).
  vi.stubEnv("ECHO_CONTEXT_PATH", "off");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key");
  loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: {}, answers: {} });
  consumeDailyQuota.mockReturnValue(null);
  getSkinCheckChatReply.mockResolvedValue("hello from echo");
  verifyFirebaseIdToken.mockResolvedValue("user-a");
});

describe("Echo chat authentication", () => {
  it("no Authorization header → 401, no Gemini, no quota", async () => {
    await expectUnauthorized(await post());
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it.each(["Basic x", "Bearer ", "Bearer"])("malformed header %j → 401 before verification", async (h) => {
    await expectUnauthorized(await post(h));
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it.each(["auth/argument-error", "auth/id-token-expired", "auth/id-token-revoked"])(
    "verification failure %s → 401 without leaking the reason",
    async (code) => {
      verifyFirebaseIdToken.mockRejectedValue(firebaseError(code));
      const res = await post("Bearer bad");
      const text = await res.clone().text();
      await expectUnauthorized(res);
      expect(text).not.toContain(code);
      expect(text).not.toMatch(/expired|revoked/i);
    }
  );

  it("admin not configured → 500 AUTH_MISCONFIGURED", async () => {
    verifyFirebaseIdToken.mockRejectedValue(new AdminNotConfiguredError(["FIREBASE_PRIVATE_KEY"]));
    const res = await post("Bearer good");
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("AUTH_MISCONFIGURED");
    expect(getSkinCheckChatReply).not.toHaveBeenCalled();
  });

  it("valid token → 200 with reply, Gemini called once", async () => {
    const res = await post("Bearer good");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, reply: "hello from echo", historyToken: expect.any(String) });
    expect(verifyFirebaseIdToken).toHaveBeenCalledWith("good");
    expect(getSkinCheckChatReply).toHaveBeenCalledTimes(1);
    expect(consumeDailyQuota).toHaveBeenCalledTimes(1);
  });

  it("a uid in the body is not an identity source", async () => {
    const res = await post("Bearer token-for-user-a", { ...BODY, uid: "someone-else" });
    // Strict schema rejects it outright — it never reaches context loading or Gemini.
    expect(res.status).toBe(400);
    expect(verifyFirebaseIdToken).toHaveBeenCalledWith("token-for-user-a");
    expect(loadTrustedEchoContext).not.toHaveBeenCalled();
    expect(getSkinCheckChatReply).not.toHaveBeenCalled();
  });

  it("trusted context is loaded under the verified uid", async () => {
    await post("Bearer token-for-user-a");
    expect(loadTrustedEchoContext).toHaveBeenCalledWith("user-a", BODY.scanId);
  });

  it("unauthenticated with GEMINI_API_KEY unset → 401, not 500", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    await expectUnauthorized(await post());
  });

  it("authenticated with GEMINI_API_KEY unset → 500 CHAT_MISCONFIGURED", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await post("Bearer good");
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("CHAT_MISCONFIGURED");
  });
});
