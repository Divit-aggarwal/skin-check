import { beforeEach, describe, expect, it, vi } from "vitest";

// The token verifier and the presigner are the two things this route is a
// wrapper around; mocking them is what lets the ownership assertions below be
// about the ROUTE's logic rather than about Firebase or AWS.
// vi.hoisted: vi.mock factories run before module-level consts initialise, so
// the shared spies have to be created in the hoisted block.
const { verifyFirebaseIdToken, presignOriginalUpload } = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  presignOriginalUpload: vi.fn(),
}));

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return {
    // bearerToken is the real implementation — header parsing is part of what
    // these tests check.
    bearerToken: actual.bearerToken,
    AdminNotConfiguredError: actual.AdminNotConfiguredError,
    verifyFirebaseIdToken,
  };
});

vi.mock("@/lib/s3", () => ({
  presignOriginalUpload,
  UPLOAD_URL_TTL_SECONDS: 300,
  MAX_ORIGINAL_BYTES: 25 * 1024 * 1024,
  S3NotConfiguredError: class S3NotConfiguredError extends Error {},
}));

import { POST } from "@/app/api/skin-scan/upload/route";
import { NextRequest } from "next/server";

const PRESIGNED = "https://bucket.s3.ap-south-1.amazonaws.com/signed";
const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
// Every presign carries image-retention consent — the route refuses without it.
const CONSENT = {
  imageRetentionConsent: true,
  imageRetentionConsentVersion: "skin image retention version 2",
  contentLength: 2_000_000,
};

// The route rate-limits per client IP before it does anything else (same
// ordering as POST /api/skin-scan). Each call gets its own x-forwarded-for so
// the suite tests the handler rather than the shared 5/min burst bucket.
let callSeq = 0;
function headers(authorization?: string): Record<string, string> {
  callSeq += 1;
  return {
    "x-forwarded-for": `10.0.0.${callSeq % 250}`,
    ...(authorization ? { authorization } : {}),
  };
}

function post(body: unknown, authorization?: string) {
  return POST(
    new NextRequest("http://localhost:3000/api/skin-scan/upload", {
      method: "POST",
      headers: headers(authorization),
      body: JSON.stringify(body),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  verifyFirebaseIdToken.mockResolvedValue("verified-uid");
  presignOriginalUpload.mockResolvedValue(PRESIGNED);
});

describe("authorization", () => {
  it("401s with no Authorization header", async () => {
    const res = await post({ scanId: SCAN_ID, ...CONSENT });
    expect(res.status).toBe(401);
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("401s on a malformed Authorization header", async () => {
    for (const header of ["Bearer", "Bearer ", "token-without-scheme", "Bearer a b"]) {
      const res = await post({ scanId: SCAN_ID, ...CONSENT }, header);
      expect(res.status, header).toBe(401);
    }
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it("401s on Basic auth instead of Bearer", async () => {
    const res = await post({ scanId: SCAN_ID, ...CONSENT }, "Basic dXNlcjpwYXNz");
    expect(res.status).toBe(401);
    expect(verifyFirebaseIdToken).not.toHaveBeenCalled();
  });

  it("401s on an invalid Firebase token", async () => {
    verifyFirebaseIdToken.mockRejectedValue(Object.assign(new Error("bad"), { code: "auth/argument-error" }));
    const res = await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer garbage");
    expect(res.status).toBe(401);
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("401s on an expired or revoked token", async () => {
    verifyFirebaseIdToken.mockRejectedValue(Object.assign(new Error("expired"), { code: "auth/id-token-expired" }));
    expect((await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer expired")).status).toBe(401);

    verifyFirebaseIdToken.mockRejectedValue(Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" }));
    expect((await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer revoked")).status).toBe(401);
  });

  it("never reveals why verification failed", async () => {
    verifyFirebaseIdToken.mockRejectedValue(Object.assign(new Error("x"), { code: "auth/id-token-expired" }));
    const body = await (await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer expired")).json();
    expect(body).toEqual({ error: "Authentication required.", code: "AUTH_REQUIRED" });
  });
});

describe("ownership", () => {
  it("builds the key from the DECODED uid", async () => {
    const res = await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer good");
    expect(res.status).toBe(200);
    expect(presignOriginalUpload).toHaveBeenCalledWith(`users/verified-uid/scans/${SCAN_ID}/original.jpg`, 2_000_000);
    expect((await res.json()).key).toBe(`users/verified-uid/scans/${SCAN_ID}/original.jpg`);
  });

  it("ignores a client-supplied uid entirely", async () => {
    const res = await post(
      { scanId: SCAN_ID, ...CONSENT, uid: "victim-uid", key: "users/victim-uid/scans/x/original.jpg", bucket: "other" },
      "Bearer good"
    );
    expect(res.status).toBe(200);
    expect(presignOriginalUpload).toHaveBeenCalledWith(`users/verified-uid/scans/${SCAN_ID}/original.jpg`, 2_000_000);
    expect(presignOriginalUpload.mock.calls[0]![0]).not.toContain("victim-uid");
  });

  it("rejects path traversal and malformed scan ids", async () => {
    for (const scanId of ["../other-user", "../../foo", "users/foo", "scans/bar", "", "x".repeat(200), 7, null]) {
      const res = await post({ scanId, ...CONSENT }, "Bearer good");
      expect(res.status, String(scanId)).toBe(400);
    }
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("400s on a body that isn't JSON", async () => {
    const res = await POST(
      new NextRequest("http://localhost:3000/api/skin-scan/upload", {
        method: "POST",
        headers: headers("Bearer good"),
        body: "not json",
      })
    );
    expect(res.status).toBe(400);
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });
});

describe("response", () => {
  it("presigns only after successful verification", async () => {
    const order: string[] = [];
    verifyFirebaseIdToken.mockImplementation(async () => {
      order.push("verify");
      return "verified-uid";
    });
    presignOriginalUpload.mockImplementation(async () => {
      order.push("presign");
      return PRESIGNED;
    });
    await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer good");
    expect(order).toEqual(["verify", "presign"]);
  });

  it("returns the upload URL, the key, the TTL and the signed content type — and nothing else", async () => {
    const body = await (await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer good")).json();
    expect(Object.keys(body).sort()).toEqual(["contentType", "expiresIn", "key", "uploadUrl"]);
    expect(body.uploadUrl).toBe(PRESIGNED);
    expect(body.expiresIn).toBe(300);
    expect(body.contentType).toBe("image/jpeg");
  });

  it("returns no AWS credentials", async () => {
    const raw = await (await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer good")).text();
    for (const secret of ["AKIA", "accessKeyId", "secretAccessKey", "sessionToken", "aws_secret"]) {
      expect(raw.toLowerCase()).not.toContain(secret.toLowerCase());
    }
  });

  it("500s (not 200) when S3 is misconfigured", async () => {
    presignOriginalUpload.mockRejectedValue(new Error("no bucket"));
    const res = await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer good");
    expect(res.status).toBe(500);
    expect((await res.json()).code).toBe("UPLOAD_MISCONFIGURED");
  });
});

describe("image-retention consent (the request contract)", () => {
  it("refuses to presign with no consent field at all", async () => {
    const res = await post({ scanId: SCAN_ID }, "Bearer good");
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("CONSENT_REQUIRED");
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("refuses consent: false", async () => {
    const res = await post(
      { scanId: SCAN_ID, imageRetentionConsent: false, imageRetentionConsentVersion: CONSENT.imageRetentionConsentVersion },
      "Bearer good"
    );
    expect(res.status).toBe(403);
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("refuses a truthy-but-not-true consent value", async () => {
    for (const value of ["true", 1, {}, "yes"]) {
      const res = await post(
        { scanId: SCAN_ID, imageRetentionConsent: value, imageRetentionConsentVersion: CONSENT.imageRetentionConsentVersion },
        "Bearer good"
      );
      expect(res.status, JSON.stringify(value)).toBe(403);
    }
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("refuses a wrong or superseded consent version", async () => {
    // "skin image retention version 1" is superseded by version 2 (TD-29 (3)): an old tab's
    // version-1 consent no longer signs an upload.
    for (const version of ["skin image retention version 0", "skin image retention version 1", "", "v1", null, undefined]) {
      const res = await post(
        { scanId: SCAN_ID, imageRetentionConsent: true, imageRetentionConsentVersion: version },
        "Bearer good"
      );
      expect(res.status, String(version)).toBe(403);
    }
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("checks authentication BEFORE consent — an unauthenticated request is 401, not 403", async () => {
    const res = await post({ scanId: SCAN_ID }, undefined);
    expect(res.status).toBe(401);
  });

  it("signs when consent is present and current", async () => {
    const res = await post({ scanId: SCAN_ID, ...CONSENT }, "Bearer good");
    expect(res.status).toBe(200);
    expect(presignOriginalUpload).toHaveBeenCalledOnce();
  });
});

// Second security review (H20): the URL is signed for one exact size, capped.
describe("upload size", () => {
  it.each([
    ["missing", undefined, 400],
    ["zero", 0, 400],
    ["negative", -1, 400],
    ["fractional", 1.5, 400],
    ["a string", "1000", 400],
    ["over the cap", 25 * 1024 * 1024 + 1, 413],
  ] as const)("%s size is refused before anything is presigned", async (_name, contentLength, status) => {
    const res = await post({ scanId: SCAN_ID, ...CONSENT, contentLength }, "Bearer good");
    expect(res.status).toBe(status);
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("control: a normal photo size and exactly the cap are signed for that size", async () => {
    for (const size of [3_500_000, 25 * 1024 * 1024]) {
      presignOriginalUpload.mockClear();
      expect((await post({ scanId: SCAN_ID, ...CONSENT, contentLength: size }, "Bearer good")).status).toBe(200);
      expect(presignOriginalUpload).toHaveBeenCalledWith(`users/verified-uid/scans/${SCAN_ID}/original.jpg`, size);
    }
  });
});

// C10 (TD-54 (2)): side photos of a three-angle check. Same route, same checks;
// only the key differs, and it is still built from the verified uid.
describe("upload angle (C10)", () => {
  it("absent or front: the front key, unchanged", async () => {
    for (const extra of [{}, { angle: "front" }]) {
      presignOriginalUpload.mockClear();
      const res = await post({ scanId: SCAN_ID, ...CONSENT, ...extra }, "Bearer good");
      expect(res.status).toBe(200);
      expect((await res.json()).key).toBe(`users/verified-uid/scans/${SCAN_ID}/original.jpg`);
      expect(presignOriginalUpload).toHaveBeenCalledWith(`users/verified-uid/scans/${SCAN_ID}/original.jpg`, CONSENT.contentLength);
    }
  });

  it("left and right: their own keys under the verified uid; a body uid is ignored", async () => {
    for (const angle of ["left", "right"]) {
      presignOriginalUpload.mockClear();
      const res = await post({ scanId: SCAN_ID, ...CONSENT, angle, uid: "victim" }, "Bearer good");
      expect(res.status).toBe(200);
      expect((await res.json()).key).toBe(`users/verified-uid/scans/${SCAN_ID}/${angle}.jpg`);
      expect(presignOriginalUpload).toHaveBeenCalledWith(`users/verified-uid/scans/${SCAN_ID}/${angle}.jpg`, CONSENT.contentLength);
    }
  });

  it.each([["back"], ["LEFT"], ["../original"], [""], [1], [null]])("angle %j is refused before anything is presigned", async (angle) => {
    const res = await post({ scanId: SCAN_ID, ...CONSENT, angle }, "Bearer good");
    expect(res.status).toBe(400);
    expect((await res.json()).code).toBe("INVALID_ANGLE");
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });

  it("a side needs the same consent and size checks as the front", async () => {
    expect((await post({ scanId: SCAN_ID, contentLength: 1000, angle: "left" }, "Bearer good")).status).toBe(403);
    expect((await post({ scanId: SCAN_ID, ...CONSENT, contentLength: 25 * 1024 * 1024 + 1, angle: "right" }, "Bearer good")).status).toBe(413);
    expect((await post({ scanId: "../x", ...CONSENT, angle: "left" }, "Bearer good")).status).toBe(400);
    expect(presignOriginalUpload).not.toHaveBeenCalled();
  });
});
