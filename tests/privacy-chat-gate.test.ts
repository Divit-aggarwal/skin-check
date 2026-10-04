import { beforeEach, describe, expect, it, vi } from "vitest";

// H02a/H03c gates on /api/skin-check/chat: Gemini is never called, and no
// quota is spent, for an under-18, unattested or (later) unconsented user.
const { verifyFirebaseIdToken, getSkinCheckChatReply, consumeDailyQuota, loadTrustedEchoContext, ageStatus, latestGrant } =
  vi.hoisted(() => ({
    verifyFirebaseIdToken: vi.fn(),
    getSkinCheckChatReply: vi.fn(),
    consumeDailyQuota: vi.fn(),
    loadTrustedEchoContext: vi.fn(),
    ageStatus: vi.fn(),
    latestGrant: vi.fn(),
  }));

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken };
});
vi.mock("@/lib/gemini", () => ({ getSkinCheckChatReply }));
vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext }));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null, consumeDailyQuota };
});
vi.mock("@/app/api/account/_ledger", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/account/_ledger")>("@/app/api/account/_ledger");
  return { ...actual, ageStatus, latestGrant, withLedgerTimeout: <T,>(p: Promise<T>) => actual.withLedgerTimeout(p, 20) };
});

import { POST } from "@/app/api/skin-check/chat/route";
import { NextRequest } from "next/server";

const BODY = { scanId: "0f8fad5b-d9cb-469f-a165-70867728950e", region: "cheeks", history: [], message: "hi" };
const SCORES = { redness: 1, oiliness: 1, texture: 1, pores: 0, blemishes: 1, hydration: 1, pigment: 1 };

const post = () =>
  POST(
    new NextRequest("http://localhost/api/skin-check/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify(BODY),
    })
  );

async function expectRefused(status: number, code: string) {
  const res = await post();
  expect(res.status).toBe(status);
  expect((await res.json()).code).toBe(code);
  expect(getSkinCheckChatReply).not.toHaveBeenCalled();
  expect(consumeDailyQuota).not.toHaveBeenCalled();
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key"); // seeds the history MAC
  verifyFirebaseIdToken.mockResolvedValue("uid-chat");
  consumeDailyQuota.mockReturnValue(null);
  loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: {}, answers: {} });
  getSkinCheckChatReply.mockResolvedValue("reply");
  ageStatus.mockResolvedValue("over18");
  latestGrant.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("chat age gate", () => {
  it("attested 18+: Gemini is called", async () => {
    expect((await post()).status).toBe(200);
    expect(ageStatus).toHaveBeenCalledWith("uid-chat");
    expect(getSkinCheckChatReply).toHaveBeenCalledTimes(1);
  });

  it("under 18: 403 UNDER_18", async () => {
    ageStatus.mockResolvedValue("under18");
    await expectRefused(403, "UNDER_18");
  });

  it("bypass: a client that skipped the attestation route is refused", async () => {
    ageStatus.mockResolvedValue("missing");
    await expectRefused(403, "ATTESTATION_REQUIRED");
  });

  it("the read throws: 503, fails closed", async () => {
    ageStatus.mockRejectedValue(new Error("down"));
    await expectRefused(503, "CONSENT_CHECK_UNAVAILABLE");
  });

  it("the read hangs: 503, fails closed", async () => {
    ageStatus.mockReturnValue(new Promise(() => {}));
    await expectRefused(503, "CONSENT_CHECK_UNAVAILABLE");
  });
});

describe("chat AI-share consent gate (H03c)", () => {
  it("reads the grant at the current version for the verified uid", async () => {
    const { AI_SHARE_CONSENT_VERSION } = await import("@/lib/consent");
    expect((await post()).status).toBe(200);
    expect(latestGrant).toHaveBeenCalledWith("uid-chat", "ai_share", AI_SHARE_CONSENT_VERSION);
  });

  it("no grant: 403 AI_CONSENT_REQUIRED", async () => {
    latestGrant.mockResolvedValue(null);
    await expectRefused(403, "AI_CONSENT_REQUIRED");
  });

  it("a grant followed by a later withdrawal: 403", async () => {
    latestGrant.mockResolvedValue(false);
    await expectRefused(403, "AI_CONSENT_REQUIRED");
  });

  it("the consent read throws: 503, fails closed", async () => {
    latestGrant.mockRejectedValue(new Error("down"));
    await expectRefused(503, "CONSENT_CHECK_UNAVAILABLE");
  });

  it("under 18 wins over a consent grant", async () => {
    ageStatus.mockResolvedValue("under18");
    await expectRefused(403, "UNDER_18");
  });
});

// R-4 (dashboard report): the Gemini key check comes after the 18+ and consent gates.
describe("no Gemini key: the gates still answer first", () => {
  beforeEach(() => vi.stubEnv("GEMINI_API_KEY", ""));

  it("under 18: 403 UNDER_18, not 500", async () => {
    ageStatus.mockResolvedValue("under18");
    await expectRefused(403, "UNDER_18");
  });

  it("unattested: 403 ATTESTATION_REQUIRED, not 500", async () => {
    ageStatus.mockResolvedValue("missing");
    await expectRefused(403, "ATTESTATION_REQUIRED");
  });

  it("no AI-share consent: 403 AI_CONSENT_REQUIRED, not 500", async () => {
    latestGrant.mockResolvedValue(null);
    await expectRefused(403, "AI_CONSENT_REQUIRED");
  });

  it("an admitted user: 500 CHAT_MISCONFIGURED, and no quota spent", async () => {
    await expectRefused(500, "CHAT_MISCONFIGURED");
  });
});
