import { beforeEach, describe, expect, it, vi } from "vitest";

// The browser half of the Phase 3 flow: Firebase token → presign → direct PUT
// → CV analysis. Firebase and the network are the only things stubbed; the
// ordering and the failure handling under test are lib/api.ts's own.
vi.mock("@/lib/firebase/client", () => ({ auth: () => ({ currentUser: { uid: "verified-uid" } }) }));
vi.mock("firebase/auth", () => ({ getIdToken: async () => "fresh-id-token" }));

import { isUploadError, runSkinScan, uploadOriginalImage } from "@/lib/api";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const UPLOAD_URL = "https://bucket.s3.ap-south-1.amazonaws.com/signed?X-Amz-Signature=abc";
const SCORES = {
  redness: 1, oiliness: 1, texture: 1, pores: 0, blemishes: 1, hydration: 1, pigment: 1,
};
const RESULT = {
  scores: SCORES,
  overlays: {},
  regions: ["forehead"],
  region_scores: { forehead: SCORES },
  region_raw: { forehead: { mean: 1 } },
  region_hist: {},
  region_hist_bin_edges: {},
  region_hist_corrected: {},
  pipeline_version: "scan-0.1.5-provisional",
};

const original = new Blob(["original-bytes"], { type: "image/jpeg" });
const photo = new Blob(["downscaled-bytes"], { type: "image/jpeg" });

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Records every fetch, answering each of the three endpoints in the flow. */
function stubFetch(overrides: { presign?: Response; put?: Response; scan?: Response } = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    if (url === "/api/skin-scan/upload") {
      return overrides.presign ?? json({ uploadUrl: UPLOAD_URL, key: `users/verified-uid/scans/${SCAN_ID}/original.jpg`, expiresIn: 300, contentType: "image/jpeg" });
    }
    if (url === UPLOAD_URL) return overrides.put ?? new Response(null, { status: 200 });
    if (url === "/api/skin-scan") return overrides.scan ?? json({ ok: true, result: RESULT });
    throw new Error(`unexpected fetch: ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("uploadOriginalImage", () => {
  it("sends the Firebase ID token and only the scanId to the presign endpoint", async () => {
    const calls = stubFetch();
    await uploadOriginalImage(SCAN_ID, original);

    const presign = calls[0]!;
    expect(presign.url).toBe("/api/skin-scan/upload");
    expect((presign.init.headers as Record<string, string>).Authorization).toBe("Bearer fresh-id-token");
    expect(JSON.parse(presign.init.body as string)).toEqual({
      scanId: SCAN_ID,
      contentLength: original.size,
      imageRetentionConsent: true,
      imageRetentionConsentVersion: "skin image retention version 1",
    });
  });

  it("PUTs the original directly to the returned presigned URL with the signed content type", async () => {
    const calls = stubFetch();
    await uploadOriginalImage(SCAN_ID, original);

    const put = calls[1]!;
    expect(put.url).toBe(UPLOAD_URL);
    expect(put.init.method).toBe("PUT");
    expect((put.init.headers as Record<string, string>)["Content-Type"]).toBe("image/jpeg");
    expect(put.init.body).toBe(original);
    // The image bytes never pass through Next.js.
    expect(calls.some((c) => c.url === "/api/skin-scan" && c.init.method === "PUT")).toBe(false);
  });

  it("never sends the ID token to S3", async () => {
    const calls = stubFetch();
    await uploadOriginalImage(SCAN_ID, original);
    expect(JSON.stringify(calls[1]!.init.headers)).not.toContain("fresh-id-token");
  });

  it("surfaces a refused presign as an upload error", async () => {
    stubFetch({ presign: json({ error: "nope" }, 500) });
    await expect(uploadOriginalImage(SCAN_ID, original)).rejects.toSatisfy(isUploadError);
  });

  it("surfaces an S3 rejection as an upload error", async () => {
    stubFetch({ put: new Response("AccessDenied", { status: 403 }) });
    await expect(uploadOriginalImage(SCAN_ID, original)).rejects.toSatisfy(isUploadError);
  });
});

describe("runSkinScan", () => {
  it("stores the original BEFORE running the analysis", async () => {
    const calls = stubFetch();
    const { result, originalStored } = await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", original, retentionConsent: true });

    expect(calls.map((c) => c.url)).toEqual(["/api/skin-scan/upload", UPLOAD_URL, "/api/skin-scan"]);
    expect(originalStored).toBe(true);
    expect(result.pipeline_version).toBe("scan-0.1.5-provisional");
  });

  it("does NOT run the analysis when the upload fails", async () => {
    const calls = stubFetch({ put: new Response("boom", { status: 500 }) });
    await expect(runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", original, retentionConsent: true })).rejects.toSatisfy(isUploadError);
    expect(calls.some((c) => c.url === "/api/skin-scan")).toBe(false);
  });

  it("still analyzes when there are no original bytes left (restored draft), and says nothing was stored", async () => {
    const calls = stubFetch();
    const { originalStored } = await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", retentionConsent: true });
    expect(calls.map((c) => c.url)).toEqual(["/api/skin-scan"]);
    expect(originalStored).toBe(false);
  });

  it("does not re-upload on retry when the original is already stored", async () => {
    const calls = stubFetch();
    const { originalStored } = await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", original, retentionConsent: true, alreadyStored: true });
    expect(calls.map((c) => c.url)).toEqual(["/api/skin-scan"]);
    expect(originalStored).toBe(true);
  });

  it("reports a CV failure as a scan error, not an upload error — the object stays in S3", async () => {
    stubFetch({ scan: json({ error: "boom" }, 502) });
    await expect(runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", original, retentionConsent: true })).rejects.not.toSatisfy(isUploadError);
  });
});

describe("retention consent gates persistent storage", () => {
  it("does NOT upload when retention consent was not given — but still analyzes", async () => {
    const calls = stubFetch();
    const { result, originalStored } = await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", original });

    // Analysis consent and retention consent are separate permissions: the
    // user agreed to have this photo read, not to have it kept.
    expect(calls.map((c) => c.url)).toEqual(["/api/skin-scan"]);
    expect(originalStored).toBe(false);
    expect(result.pipeline_version).toBe("scan-0.1.5-provisional");
  });

  it("does NOT upload when retention consent is explicitly false", async () => {
    const calls = stubFetch();
    const { originalStored } = await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", original, retentionConsent: false });
    expect(calls.some((c) => c.url === "/api/skin-scan/upload")).toBe(false);
    expect(calls.some((c) => c.url === UPLOAD_URL)).toBe(false);
    expect(originalStored).toBe(false);
  });

  it("uploads when retention consent is given", async () => {
    const calls = stubFetch();
    const { originalStored } = await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", original, retentionConsent: true });
    expect(calls.map((c) => c.url)).toEqual(["/api/skin-scan/upload", UPLOAD_URL, "/api/skin-scan"]);
    expect(originalStored).toBe(true);
  });

  it("sends the exact consent version, not a paraphrase", async () => {
    const calls = stubFetch();
    await uploadOriginalImage(SCAN_ID, original);
    expect(JSON.parse(calls[0]!.init.body as string).imageRetentionConsentVersion)
      .toBe("skin image retention version 1");
  });
});
