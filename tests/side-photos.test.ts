import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

// C10 (TD-54 (2)): three-angle capture stores the left and right photos and
// never analyses them. Two parts: the client record (saveSkinCheck writes
// sideImages, never over-claiming), and the engine call (only the front photo
// goes to the CV service, whatever else the request carries).
const { setDoc, verifyFirebaseIdToken, adminDb } = vi.hoisted(() => {
  // Read at the skin-scan route's module scope, so it must exist before the import below.
  process.env.SKIN_SCAN_API_URL = "http://cv.test";
  return { setDoc: vi.fn(), verifyFirebaseIdToken: vi.fn(), adminDb: vi.fn() };
});

vi.mock("firebase/firestore", () => ({
  doc: (...path: unknown[]) => path,
  setDoc: (...args: unknown[]) => setDoc(...args),
  getDoc: vi.fn(),
  serverTimestamp: () => "server-ts",
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/firebase/client", () => ({ db: () => ({}) }));
vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken, adminDb };
});
vi.mock("@/app/api/account/_ledger", () => ({
  scanAgeGate: async () => null,
  appendConsent: async () => undefined,
  withLedgerTimeout: <T,>(p: Promise<T>) => p,
}));

import { NextRequest } from "next/server";
import { saveSkinCheck } from "@/lib/firebase/skin-checks";
import { POST as scan } from "@/app/api/skin-scan/route";
import { IMAGE_RETENTION_CONSENT_VERSION, IMAGE_RETENTION_CONSENT_VERSIONS, PROCESSING_CONSENT_VERSION } from "@/lib/consent";
import type { SkinScanResult, SkinScanState } from "@/types/skin-scan";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const RESULT = { scores: {}, regions: [], region_scores: {}, pipeline_version: "v" } as unknown as SkinScanResult;
const kept: SkinScanState = {
  status: "success",
  result: RESULT,
  photo: new Blob(["jpeg"]),
  captureMethod: "native",
  originalStored: true,
  retentionConsentVersion: IMAGE_RETENTION_CONSENT_VERSION,
};
// A valid engine reply (as in tests/skin-scan-route-persist.test.ts).
const SCORES = { redness: 1, oiliness: 1, texture: 1, pores: 0, blemishes: 1, hydration: 1, pigment: 1 };
const ENGINE_REPLY = {
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
const written = () => setDoc.mock.calls[0]![1] as Record<string, unknown>;

beforeEach(() => {
  vi.clearAllMocks();
  setDoc.mockResolvedValue(undefined);
});

describe("saveSkinCheck sideImages", () => {
  it("a front-only check writes no sideImages field at all", async () => {
    await saveSkinCheck("uid", SCAN_ID, {}, kept);
    expect(written()).not.toHaveProperty("sideImages");
  });

  it("sides the client watched land: stored with this uid's own key; a side that did not land: stored false", async () => {
    await saveSkinCheck("uid", SCAN_ID, {}, kept, {}, { left: true, right: false });
    expect(written().sideImages).toEqual({
      left: { stored: true, storage: "s3", key: `users/uid/scans/${SCAN_ID}/left.jpg` },
      right: { stored: false },
    });
  });

  it("no retention consent at the current version: never claims a side was kept", async () => {
    for (const s of [{ ...kept, retentionConsentVersion: undefined }, { ...kept, retentionConsentVersion: "skin image retention version 1" }]) {
      setDoc.mockClear();
      await saveSkinCheck("uid", SCAN_ID, {}, s, {}, { left: true, right: true });
      expect(written().sideImages).toEqual({ left: { stored: false }, right: { stored: false } });
    }
  });
});

describe("only the front photo is analysed", () => {
  beforeEach(() => {
    vi.stubEnv("SCAN_API_SECRET", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(ENGINE_REPLY), { status: 200 })));
    verifyFirebaseIdToken.mockResolvedValue("verified-uid");
    adminDb.mockImplementation(() => {
      const ref = { collection: () => ref, doc: () => ref, create: async () => undefined };
      return ref;
    });
  });

  it("extra photos, an angle or side fields in the request never reach the engine: one call, one image, the front bytes", async () => {
    const form = new FormData();
    form.append("image", new Blob(["front-bytes"], { type: "image/jpeg" }), "scan.jpg");
    form.append("left", new Blob(["left-bytes"], { type: "image/jpeg" }), "left.jpg");
    form.append("right", new Blob(["right-bytes"], { type: "image/jpeg" }), "right.jpg");
    form.append("angle", "left");
    form.append("scanId", SCAN_ID);
    form.append("processingConsentVersion", PROCESSING_CONSENT_VERSION);
    const res = await scan(new NextRequest("http://localhost/api/skin-scan", { method: "POST", headers: { authorization: "Bearer good", "x-forwarded-for": "10.7.0.1" }, body: form }));
    expect(res.status).toBe(200);
    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = fetchMock.mock.calls[0]![1]!.body as FormData;
    expect(Array.from(sent.keys())).toEqual(["image"]);
    expect(await (sent.get("image") as Blob).text()).toBe("front-bytes");
  });

  it("the scan route and the scan client never name a side key or the sideImages field", () => {
    for (const f of ["app/api/skin-scan/route.ts", "lib/api.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/sideImage|left\.jpg|right\.jpg|check-photos/);
    }
  });
});

describe("firestore.rules: every image-retention version list is the same", () => {
  it("the front's and the sides' consent clauses accept exactly IMAGE_RETENTION_CONSENT_VERSIONS", () => {
    const rules = readFileSync("firestore.rules", "utf8");
    const lists = Array.from(rules.matchAll(/imageRetentionVersion', ''\) in \[([^\]]*)\]/g)).map((m) => m[1]!.split(",").map((v: string) => v.trim().replace(/^'|'$/g, "")));
    expect(lists).toHaveLength(2);
    for (const list of lists) expect(list).toEqual([...IMAGE_RETENTION_CONSENT_VERSIONS]);
  });
});
