import { beforeEach, describe, expect, it, vi } from "vitest";

// O-2 = A: /api/skin-scan stores the client-asserted capture gate result on
// the scanAnalyses record, validated; an invalid value is dropped and the
// scan still succeeds (D-03a). Same stubbing as skin-scan-route-persist.
const { verifyFirebaseIdToken, adminDb, create } = vi.hoisted(() => {
  process.env.SKIN_SCAN_API_URL = "http://cv.test";
  return { verifyFirebaseIdToken: vi.fn(), adminDb: vi.fn(), create: vi.fn() };
});

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken, adminDb };
});

import { POST } from "@/app/api/skin-scan/route";
import { NextRequest } from "next/server";
import { toSkinState } from "@/lib/skin-state";
import { runCaptureGate } from "@/lib/capture-quality/gate";
import { MAX_CAPTURE_QUALITY_CHARS } from "@/lib/capture-quality/schema";
import { checkerboard } from "@/lib/capture-quality/synthetic-frames";
import { buildScanAnalysisRecord } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const RESULT = { ...syntheticAnalysis(), ...syntheticNative(), overlays: {} };
const QUALITY = runCaptureGate(checkerboard(400, 400, 1, 100, 156), { captureMethod: "native", retakeCount: 1 });

let seq = 0;
function post(fields: Record<string, string>) {
  seq += 1;
  const form = new FormData();
  form.append("image", new Blob([`bytes-${seq}`], { type: "image/jpeg" }), "scan.jpg");
  for (const [k, v] of Object.entries({ scanId: SCAN_ID, captureMethod: "native", ...fields })) form.append(k, v);
  return POST(new NextRequest("http://localhost:3000/api/skin-scan", {
    method: "POST", headers: { authorization: "Bearer good", "x-forwarded-for": `10.2.0.${seq % 250}` }, body: form,
  }));
}
const stored = () => create.mock.calls.at(-1)![1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCAN_API_SECRET", "secret");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(RESULT), { status: 200 })));
  verifyFirebaseIdToken.mockResolvedValue("verified-uid");
  create.mockResolvedValue(undefined);
  adminDb.mockImplementation(() => {
    const segs: string[] = [];
    const ref = { collection: (n: string) => (segs.push(n), ref), doc: (n: string) => (segs.push(n), ref), create: (d: unknown) => create(segs.join("/"), d) };
    return ref;
  });
});

describe("captureQuality persistence (O-2 = A)", () => {
  it("stores a valid result unchanged, labelled client-asserted with its version", async () => {
    expect(QUALITY.verdict).toBe("pass");
    const res = await post({ captureQuality: JSON.stringify(QUALITY) });
    expect(await res.json()).toMatchObject({ ok: true, persisted: true });
    expect(stored().captureQuality).toEqual(QUALITY);
    expect(stored().captureQuality).toMatchObject({ assertedBy: "client", schemaVersion: 1 });
  });

  it("the record stays a valid skinstate-1 source; quality.* stays null and captureQuality is not exposed", async () => {
    await post({ captureQuality: JSON.stringify({ ...QUALITY, verdict: "override", retakeReasons: ["too_dark"] }) });
    const [path, data] = create.mock.calls.at(-1)! as [string, Record<string, unknown>];
    const out = toSkinState({ ...data, createdAt: "2026-10-01T00:00:00.000Z" }, path, "verified-uid");
    expect(out.kind).toBe("skinstate");
    if (out.kind !== "skinstate") return;
    expect(out.state.quality).toMatchObject({ blur: null, exposure: null, pose: null, faceScale: null, occlusion: null, device: null });
    expect(JSON.stringify(out.state)).not.toContain("capture-quality-web");
  });

  const tooBig = JSON.stringify({ ...QUALITY, settingsVersion: "x".repeat(MAX_CAPTURE_QUALITY_CHARS) });
  it.each<[string, string]>([
    ["not JSON", "{not json"],
    ["another schemaVersion", JSON.stringify({ ...QUALITY, schemaVersion: 2 })],
    ["no schemaVersion", JSON.stringify({ ...QUALITY, schemaVersion: undefined })],
    ["assertedBy server", JSON.stringify({ ...QUALITY, assertedBy: "server" })],
    ["an extra key", JSON.stringify({ ...QUALITY, trusted: true })],
    ["six checks", JSON.stringify({ ...QUALITY, checks: QUALITY.checks.slice(1) })],
    ["checks out of order", JSON.stringify({ ...QUALITY, checks: [...QUALITY.checks].reverse() })],
    ["an unknown retake reason", JSON.stringify({ ...QUALITY, retakeReasons: ["looks_bad"] })],
    ["a different capture method from the request", JSON.stringify({ ...QUALITY, captureMethod: "canvas" })],
    ["oversized", tooBig],
  ])("drops %s and still succeeds", async (_name, value) => {
    const res = await post({ captureQuality: value });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, persisted: true });
    expect(stored()).not.toHaveProperty("captureQuality");
  });

  it("no field: no key on the record", async () => {
    await post({});
    expect(stored()).not.toHaveProperty("captureQuality");
  });

  it("buildScanAnalysisRecord omits an undefined captureQuality", () => {
    const rec = buildScanAnalysisRecord(RESULT as unknown as SkinScanResult, { scanId: SCAN_ID, inputSha256: "0".repeat(64), requestId: "r", captureQuality: undefined });
    expect(rec).not.toHaveProperty("captureQuality");
  });
});
