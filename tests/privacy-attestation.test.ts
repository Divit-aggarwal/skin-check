import { beforeEach, describe, expect, it, vi } from "vitest";

// H02a: POST /api/account/attestation records over18 true/false in the ledger.
const { verifyFirebaseIdToken, appendConsent, ageStatus } = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  appendConsent: vi.fn(),
  ageStatus: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken };
});
vi.mock("@/app/api/account/_ledger", () => ({ appendConsent, ageStatus }));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null };
});

import { POST } from "@/app/api/account/attestation/route";
import { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION } from "@/lib/consent";
import { NextRequest } from "next/server";

const post = (body: unknown, authorization: string | null = "Bearer t") =>
  POST(
    new NextRequest("http://localhost/api/account/attestation", {
      method: "POST",
      headers: authorization ? { authorization } : {},
      body: JSON.stringify(body),
    })
  );

beforeEach(() => {
  vi.clearAllMocks();
  verifyFirebaseIdToken.mockResolvedValue("uid-att");
  appendConsent.mockResolvedValue(undefined);
  ageStatus.mockResolvedValue("over18");
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("attestation route", () => {
  it("unauthenticated: 401, nothing written", async () => {
    expect((await post({ ageBucket: "25-34", version: AGE_ATTESTATION_VERSION }, null)).status).toBe(401);
    verifyFirebaseIdToken.mockRejectedValueOnce(new Error("bad"));
    expect((await post({ ageBucket: "25-34", version: AGE_ATTESTATION_VERSION })).status).toBe(401);
    expect(appendConsent).not.toHaveBeenCalled();
  });

  it("strict body: extra keys such as uid or over18 are a 400", async () => {
    for (const extra of [{ uid: "victim" }, { over18: true }]) {
      const res = await post({ ageBucket: "25-34", version: AGE_ATTESTATION_VERSION, ...extra });
      expect(res.status).toBe(400);
    }
    expect((await post({ ageBucket: "17", version: AGE_ATTESTATION_VERSION })).status).toBe(400);
    expect(appendConsent).not.toHaveBeenCalled();
  });

  it("under-18 records granted:false; every other bucket records granted:true; the bucket is never stored", async () => {
    for (const ageBucket of ["under-18", "18-24", "25-34", "35-44", "45-plus"]) {
      appendConsent.mockClear();
      await post({ ageBucket, version: AGE_ATTESTATION_VERSION });
      expect(appendConsent).toHaveBeenCalledWith("uid-att", {
        purpose: "age_18_plus",
        granted: ageBucket !== "under-18",
        version: AGE_ATTESTATION_VERSION,
        copy: AGE_ATTESTATION_COPY,
        scanId: null,
        source: "attestation_route",
      });
    }
  });

  it("a stale version: 409 and nothing written", async () => {
    const res = await post({ ageBucket: "25-34", version: "old" });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_STALE");
    expect(appendConsent).not.toHaveBeenCalled();
  });

  it("sticky: an 18+ answer after an under-18 record reports over18:false (decision 4)", async () => {
    ageStatus.mockResolvedValue("under18");
    const res = await post({ ageBucket: "18-24", version: AGE_ATTESTATION_VERSION });
    expect(await res.json()).toEqual({ ok: true, over18: false });
  });

  it("ledger unavailable: 500 LEDGER_UNAVAILABLE", async () => {
    appendConsent.mockRejectedValueOnce(new Error("down"));
    const res = await post({ ageBucket: "25-34", version: AGE_ATTESTATION_VERSION });
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("LEDGER_UNAVAILABLE");
  });
});
