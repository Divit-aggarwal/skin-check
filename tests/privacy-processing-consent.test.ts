import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Privacy step 14 (D-16, D-03a; requests R3 and R4): processing consent at
// scan time. Missing consent never refuses the scan; it only skips the record.
const { verifyFirebaseIdToken, adminDb, create, currentUser } = vi.hoisted(() => {
  process.env.SKIN_SCAN_API_URL = "http://cv.test";
  return { verifyFirebaseIdToken: vi.fn(), adminDb: vi.fn(), create: vi.fn(), currentUser: { value: { uid: "user-a" } as unknown } };
});

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken, adminDb };
});
vi.mock("@/lib/firebase/client", () => ({ auth: () => ({ currentUser: currentUser.value }) }));
vi.mock("firebase/auth", () => ({ getIdToken: async () => "fresh-id-token" }));

import { POST } from "@/app/api/skin-scan/route";
import { NextRequest } from "next/server";
import { PROCESSING_CONSENT_COPY, PROCESSING_CONSENT_TERMS_LABEL, PROCESSING_CONSENT_VERSION } from "@/lib/consent";
import { runSkinScan } from "@/lib/api";
import { retrySkinScan } from "@/lib/scan-retry";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const RESULT = { ...syntheticAnalysis(), ...syntheticNative(), overlays: {} };

let seq = 0;
function post(fields: Record<string, string>) {
  seq += 1;
  const form = new FormData();
  form.append("image", new Blob([`bytes-${seq}`], { type: "image/jpeg" }), "scan.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return POST(new NextRequest("http://localhost:3000/api/skin-scan", {
    method: "POST", headers: { authorization: "Bearer good", "x-forwarded-for": `10.3.0.${seq % 250}` }, body: form,
  }));
}
const writes = (kind: "consentLedger" | "scanAnalyses") =>
  create.mock.calls.filter(([path]) => String(path).includes(`/${kind}/`)).map(([, data]) => data as Record<string, unknown>);

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCAN_API_SECRET", "secret");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(RESULT), { status: 200 })));
  verifyFirebaseIdToken.mockResolvedValue("verified-uid");
  create.mockResolvedValue(undefined);
  adminDb.mockImplementation(() => {
    const segs: string[] = [];
    const ref = {
      collection: (n: string) => (segs.push(n), ref),
      doc: (n?: string) => (segs.push(n ?? "auto"), ref),
      create: (d: unknown) => create(segs.join("/"), d),
      where: () => ({ where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }), limit: () => ({ get: async () => ({ empty: true, docs: [] }) }), get: async () => ({ empty: true, docs: [] }) }),
    };
    return ref;
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("scan route: processing consent (R4)", () => {
  it.each([
    ["missing", {}],
    ["not the current version", { processingConsentVersion: "processing version 0" }],
  ])("%s: the result is returned, nothing is written, persisted:false consent_missing", async (_label, extra) => {
    const res = await post({ scanId: SCAN_ID, captureMethod: "native", ...extra });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, persisted: false, reason: "consent_missing" });
    expect(body.result).toEqual(expect.objectContaining({ scores: expect.any(Object) }));
    expect(create).not.toHaveBeenCalled();
  });

  it("with consent: one processing ledger entry for the scan, then the record", async () => {
    const res = await post({ scanId: SCAN_ID, captureMethod: "native", processingConsentVersion: PROCESSING_CONSENT_VERSION });
    expect(await res.json()).toMatchObject({ ok: true, persisted: true });
    expect(writes("consentLedger")).toEqual([
      expect.objectContaining({
        purpose: "processing",
        granted: true,
        version: PROCESSING_CONSENT_VERSION,
        copySha256: createHash("sha256").update(PROCESSING_CONSENT_COPY, "utf8").digest("hex"),
        scanId: SCAN_ID,
        source: "scan",
      }),
    ]);
    expect(writes("scanAnalyses")).toHaveLength(1);
    expect(String(create.mock.calls[0]![0])).toBe("users/verified-uid/consentLedger/auto");
  });

  it("a recovery re-send (client-asserted) still writes its ledger entry before the record", async () => {
    await post({ scanId: SCAN_ID, captureMethod: "native", processingConsentVersion: PROCESSING_CONSENT_VERSION, persistAttempt: "recovery" });
    expect(writes("consentLedger")).toHaveLength(1);
    expect(writes("scanAnalyses")).toHaveLength(1);
  });

  it("a failed ledger write never stops the scan or the record (D-03)", async () => {
    create.mockImplementation(async (path: string) => {
      if (path.includes("/consentLedger/")) throw Object.assign(new Error("users/verified-uid/..."), { code: 14 });
    });
    const res = await post({ scanId: SCAN_ID, captureMethod: "native", processingConsentVersion: PROCESSING_CONSENT_VERSION });
    expect(await res.json()).toMatchObject({ ok: true, persisted: true });
  });

  it("no scanId (old bundle): unchanged, no persisted key", async () => {
    const body = await (await post({})).json();
    expect(body).not.toHaveProperty("persisted");
    expect(body).not.toHaveProperty("reason");
  });
});

describe("client: processing consent travels with the photo (R3)", () => {
  const scanResponse = (extra: Record<string, unknown>) =>
    new Response(JSON.stringify({ ok: true, result: RESULT, ...extra }), { status: 200 });

  it("runSkinScan sends the version, and consent_missing gets no recovery re-send", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => scanResponse({ persisted: false, reason: "consent_missing" }));
    vi.stubGlobal("fetch", fetchSpy);
    await runSkinScan({ scanId: SCAN_ID, photo: new Blob(["x"]), captureMethod: "native", processingConsentVersion: PROCESSING_CONSENT_VERSION });
    const sent = (fetchSpy.mock.calls[0] as unknown as [string, RequestInit])[1].body as FormData;
    expect(sent.get("processingConsentVersion")).toBe(PROCESSING_CONSENT_VERSION);
    await vi.runAllTimersAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("a real persist failure still gets one recovery re-send, carrying the version", async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.fn(async () => scanResponse({ persisted: false }));
    vi.stubGlobal("fetch", fetchSpy);
    await runSkinScan({ scanId: SCAN_ID, photo: new Blob(["x"]), captureMethod: "native", processingConsentVersion: PROCESSING_CONSENT_VERSION });
    await vi.runAllTimersAsync();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const retry = (fetchSpy.mock.calls[1] as unknown as [string, RequestInit])[1].body as FormData;
    expect(retry.get("persistAttempt")).toBe("recovery");
    expect(retry.get("processingConsentVersion")).toBe(PROCESSING_CONSENT_VERSION);
  });

  it("the dashboard retry re-sends the version and keeps it", async () => {
    const run = vi.fn(async () => ({ result: RESULT, originalStored: false }));
    const next = await retrySkinScan(
      { status: "error", message: "x", photo: new Blob(["p"]), captureMethod: "native", processingConsentVersion: PROCESSING_CONSENT_VERSION },
      SCAN_ID,
      run as never
    );
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ processingConsentVersion: PROCESSING_CONSENT_VERSION }));
    expect(next).toMatchObject({ status: "success", processingConsentVersion: PROCESSING_CONSENT_VERSION });
  });

  it("PhotoCapture shows the versioned copy and sends its version", () => {
    const src = readFileSync("components/skin-check/inputs/PhotoCapture.tsx", "utf8");
    expect(PROCESSING_CONSENT_COPY.split(PROCESSING_CONSENT_TERMS_LABEL)).toHaveLength(2);
    expect(src).toContain("PROCESSING_CONSENT_COPY.split(PROCESSING_CONSENT_TERMS_LABEL)");
    expect(src).toContain("{PROCESSING_TERMS_BEFORE}");
    expect(src).toContain("{PROCESSING_TERMS_AFTER}");
    expect(src).toContain("processingConsentVersion: PROCESSING_CONSENT_VERSION,\n    })");
    // The checkbox text is no longer written inline.
    expect(src).not.toContain("consent to my photo being collected and processed");
  });

  it("the version says DRAFT until the owner supplies the D-16 copy (decision 7a)", () => {
    expect(PROCESSING_CONSENT_VERSION).toContain("DRAFT");
  });
});
