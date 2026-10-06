import { beforeEach, describe, expect, it, vi } from "vitest";

// D-16 on the presign route: the server records image-retention consent before
// it hands out a URL, and a ledger problem never refuses the upload (D-03).
const { verifyFirebaseIdToken, presignOriginalUpload, appendConsent, scanAgeGate } = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  presignOriginalUpload: vi.fn(),
  appendConsent: vi.fn(),
  scanAgeGate: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken };
});
vi.mock("@/lib/s3", () => ({
  presignOriginalUpload,
  UPLOAD_URL_TTL_SECONDS: 300,
  MAX_ORIGINAL_BYTES: 25 * 1024 * 1024,
  S3NotConfiguredError: class S3NotConfiguredError extends Error {},
}));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null };
});
vi.mock("@/app/api/account/_ledger", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/account/_ledger")>("@/app/api/account/_ledger");
  return { ...actual, appendConsent, scanAgeGate, withLedgerTimeout: <T,>(p: Promise<T>) => actual.withLedgerTimeout(p, 20) };
});

import { POST } from "@/app/api/skin-scan/upload/route";
import { IMAGE_RETENTION_CONSENT_COPY, IMAGE_RETENTION_CONSENT_VERSION } from "@/lib/consent";
import { NextRequest, NextResponse } from "next/server";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CONSENT = { imageRetentionConsent: true, imageRetentionConsentVersion: IMAGE_RETENTION_CONSENT_VERSION, contentLength: 2_000_000 };

const post = (body: unknown = { scanId: SCAN_ID, ...CONSENT }) =>
  POST(
    new NextRequest("http://localhost/api/skin-scan/upload", {
      method: "POST",
      headers: { authorization: "Bearer t" },
      body: JSON.stringify(body),
    })
  );

let errorLog: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  vi.clearAllMocks();
  verifyFirebaseIdToken.mockResolvedValue("uid-upload");
  presignOriginalUpload.mockResolvedValue("https://signed");
  appendConsent.mockResolvedValue(undefined);
  scanAgeGate.mockResolvedValue(null);
  errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("presign writes the image_retention ledger entry", () => {
  it("writes the entry before the URL is returned, with nothing else in the flow called", async () => {
    let entryWrittenBeforePresign = false;
    presignOriginalUpload.mockImplementation(async () => {
      entryWrittenBeforePresign = appendConsent.mock.calls.length === 1;
      return "https://signed";
    });
    const res = await post();
    expect(res.status).toBe(200);
    expect(entryWrittenBeforePresign).toBe(true);
    expect(appendConsent).toHaveBeenCalledWith("uid-upload", {
      purpose: "image_retention",
      granted: true,
      version: IMAGE_RETENTION_CONSENT_VERSION,
      copy: IMAGE_RETENTION_CONSENT_COPY,
      scanId: SCAN_ID,
      source: "presign",
    });
  });

  it("retries a failed write once, then issues the URL anyway and logs without the uid", async () => {
    appendConsent.mockRejectedValue(new Error("firestore down"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(appendConsent).toHaveBeenCalledTimes(2);
    expect(errorLog).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain("uid-upload");
  });

  it("a hung write is cut off and the URL is still issued", async () => {
    appendConsent.mockReturnValue(new Promise(() => {}));
    const res = await post();
    expect(res.status).toBe(200);
    expect(appendConsent).toHaveBeenCalledTimes(2);
  });

  it("a second attempt that succeeds logs nothing", async () => {
    appendConsent.mockRejectedValueOnce(new Error("blip")).mockResolvedValueOnce(undefined);
    expect((await post()).status).toBe(200);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it("missing or wrong consent version: 403 CONSENT_REQUIRED and no ledger entry", async () => {
    for (const body of [{ scanId: SCAN_ID }, { scanId: SCAN_ID, imageRetentionConsent: true, imageRetentionConsentVersion: "old" }]) {
      const res = await post(body);
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe("CONSENT_REQUIRED");
    }
    expect(appendConsent).not.toHaveBeenCalled();
  });
});

describe("age gate wiring (gate logic: privacy-ledger.test.ts)", () => {
  it("asks the gate with the verified uid", async () => {
    await post();
    expect(scanAgeGate).toHaveBeenCalledWith("uid-upload", "skin-scan/upload");
  });

  it("a refusal is returned as is: nothing recorded, nothing presigned", async () => {
    scanAgeGate.mockResolvedValue(NextResponse.json({ code: "UNDER_18" }, { status: 403 }));
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("UNDER_18");
    expect(appendConsent).not.toHaveBeenCalled();
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });
});
