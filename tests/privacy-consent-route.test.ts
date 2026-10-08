import { beforeEach, describe, expect, it, vi } from "vitest";

// H03c: POST /api/account/consent records the AI-share consent in the ledger.
const { verifyFirebaseIdToken, appendConsent } = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  appendConsent: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken };
});
vi.mock("@/app/api/account/_ledger", () => ({ appendConsent }));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null };
});

import { POST } from "@/app/api/account/consent/route";
import { AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { NextRequest } from "next/server";

const post = (body: unknown, authorization: string | null = "Bearer t") =>
  POST(
    new NextRequest("http://localhost/api/account/consent", {
      method: "POST",
      headers: authorization ? { authorization } : {},
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  verifyFirebaseIdToken.mockResolvedValue("uid-consent");
  appendConsent.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("AI-share consent route", () => {
  it("records a grant and a withdrawal under the verified uid", async () => {
    for (const granted of [true, false]) {
      appendConsent.mockClear();
      expect((await post({ purpose: "ai_share", granted, version: AI_SHARE_CONSENT_VERSION })).status).toBe(200);
      expect(appendConsent).toHaveBeenCalledWith("uid-consent", {
        purpose: "ai_share",
        granted,
        version: AI_SHARE_CONSENT_VERSION,
        copy: AI_SHARE_CONSENT_COPY,
        scanId: null,
        source: "consent_route",
      });
    }
  });

  it("401 without a verified token; nothing written", async () => {
    expect((await post({ purpose: "ai_share", granted: true, version: AI_SHARE_CONSENT_VERSION }, null)).status).toBe(401);
    expect(appendConsent).not.toHaveBeenCalled();
  });

  it("strict: another purpose, a uid, or a missing field is a 400", async () => {
    for (const body of [
      { purpose: "image_retention", granted: true, version: AI_SHARE_CONSENT_VERSION },
      { purpose: "age_18_plus", granted: true, version: AI_SHARE_CONSENT_VERSION },
      { purpose: "ai_share", granted: true, version: AI_SHARE_CONSENT_VERSION, uid: "victim" },
      { purpose: "ai_share", version: AI_SHARE_CONSENT_VERSION },
    ]) {
      expect((await post(body)).status).toBe(400);
    }
    expect(appendConsent).not.toHaveBeenCalled();
  });

  it("a stale version: 409, nothing written", async () => {
    expect((await post({ purpose: "ai_share", granted: true, version: "old" })).status).toBe(409);
    expect(appendConsent).not.toHaveBeenCalled();
  });

  // Owner decision TD-29 (4): the draft wording is version 1. No DRAFT text or version ships,
  // and the version differs from the draft one, so an old draft grant no longer counts.
  it("TD-29 (4): version 1 copy, no DRAFT in the version or the copy", () => {
    expect(AI_SHARE_CONSENT_VERSION).toBe("ai share version 1");
    expect(AI_SHARE_CONSENT_VERSION).not.toMatch(/draft/i);
    expect(AI_SHARE_CONSENT_COPY).not.toMatch(/draft/i);
    expect(AI_SHARE_CONSENT_COPY).toBe("Share my skin check with the AI assistant (processed by Google, outside India).");
  });
});
