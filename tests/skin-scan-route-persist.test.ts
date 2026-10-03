import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// C2: /api/skin-scan persists the full analysis via the Admin SDK. Firebase
// and the CV service are the only things stubbed; the path, id scheme, and
// failure handling under test are the route's own.
const { verifyFirebaseIdToken, adminDb, create } = vi.hoisted(() => {
  // Read at route-module scope, so it must exist before the import below.
  process.env.SKIN_SCAN_API_URL = "http://cv.test";
  return { verifyFirebaseIdToken: vi.fn(), adminDb: vi.fn(), create: vi.fn() };
});

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return {
    bearerToken: actual.bearerToken,
    AdminNotConfiguredError: actual.AdminNotConfiguredError,
    verifyFirebaseIdToken,
    adminDb,
  };
});

import { POST } from "@/app/api/skin-scan/route";
import { AdminNotConfiguredError } from "@/lib/firebase/admin";
import { NextRequest } from "next/server";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const SCORES = { redness: 1, oiliness: 1, texture: 1, pores: 0, blemishes: 1, hydration: 1, pigment: 1 };
const RESULT = {
  scores: SCORES,
  overlays: { redness: "iVBORw0KGgo=" },
  regions: ["forehead"],
  region_scores: { forehead: SCORES },
  region_raw: { forehead: { mean: 1 } },
  region_hist: {},
  region_hist_bin_edges: {},
  region_hist_corrected: {},
  pipeline_version: "scan-0.1.5-provisional",
};

const sha16 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 16);

let callSeq = 0;
function post(fields: Record<string, string> = {}, bytes = "photo-bytes") {
  callSeq += 1;
  const form = new FormData();
  form.append("image", new Blob([bytes], { type: "image/jpeg" }), "scan.jpg");
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return POST(
    new NextRequest("http://localhost:3000/api/skin-scan", {
      method: "POST",
      headers: { authorization: "Bearer good", "x-forwarded-for": `10.1.0.${callSeq % 250}` },
      body: form,
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCAN_API_SECRET", "secret");
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(RESULT), { status: 200 })));
  verifyFirebaseIdToken.mockResolvedValue("verified-uid");
  create.mockResolvedValue(undefined);
  // A path-recording stand-in for adminDb().collection().doc()...create().
  adminDb.mockImplementation(() => {
    const segs: string[] = [];
    const ref = {
      collection: (n: string) => (segs.push(n), ref),
      doc: (n: string) => (segs.push(n), ref),
      create: (data: unknown) => create(segs.join("/"), data),
    };
    return ref;
  });
});

describe("C2 analysis persistence", () => {
  it("no scanId → no write, response unchanged", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: RESULT });
    expect(adminDb).not.toHaveBeenCalled();
  });

  it("invalid scanId → no write, response unchanged", async () => {
    const res = await post({ scanId: "../other-user" });
    expect(await res.json()).toEqual({ ok: true, result: RESULT });
    expect(create).not.toHaveBeenCalled();
  });

  it("valid scanId → one create at users/{verifiedUid}/scanAnalyses/{scanId}_{hash16}; body uid ignored", async () => {
    const res = await post({ scanId: SCAN_ID, uid: "attacker-uid", captureMethod: "canvas" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: RESULT, persisted: true });
    expect(create).toHaveBeenCalledTimes(1);
    const [path, data] = create.mock.calls[0]!;
    expect(path).toBe(`users/verified-uid/scanAnalyses/${SCAN_ID}_${sha16("photo-bytes")}`);
    expect(data).toMatchObject({ scanId: SCAN_ID, source: "server", captureMethod: "canvas", region_raw: RESULT.region_raw });
    expect(data.inputSha256).toBe(createHash("sha256").update("photo-bytes").digest("hex"));
    expect(data).not.toHaveProperty("overlays");
    expect(data).toHaveProperty("createdAt");
  });

  it("persistAttempt=recovery is stored; absent or unknown values are not", async () => {
    await post({ scanId: SCAN_ID, persistAttempt: "recovery" });
    await post({ scanId: SCAN_ID });
    await post({ scanId: SCAN_ID, persistAttempt: "forged" });
    expect(create.mock.calls[0]![1]).toMatchObject({ persistAttempt: "recovery" });
    expect(create.mock.calls[1]![1]).not.toHaveProperty("persistAttempt");
    expect(create.mock.calls[2]![1]).not.toHaveProperty("persistAttempt");
  });

  it("same bytes twice → same doc id; ALREADY_EXISTS counts as persisted", async () => {
    await post({ scanId: SCAN_ID });
    create.mockRejectedValueOnce(Object.assign(new Error("exists"), { code: 6 }));
    const res = await post({ scanId: SCAN_ID });
    expect((await res.json()).persisted).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[0]![0]).toBe(create.mock.calls[1]![0]);
  });

  it("different bytes under the same scanId → different doc id", async () => {
    await post({ scanId: SCAN_ID }, "first-photo");
    await post({ scanId: SCAN_ID }, "retake-photo");
    expect(create.mock.calls[0]![0]).not.toBe(create.mock.calls[1]![0]);
  });

  it("retries once, then returns the result with persisted:false and 200", async () => {
    create.mockRejectedValue(Object.assign(new Error("users/verified-uid/... unavailable"), { code: 14 }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ scanId: SCAN_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: RESULT, persisted: false });
    expect(create).toHaveBeenCalledTimes(2);
    // Firestore messages carry the doc path (uid) — never logged.
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("verified-uid");
    errorSpy.mockRestore();
  });

  it("a hung write is cut off by the timeout → persisted:false", async () => {
    // Fake only setTimeout: the request's body parsing runs on real I/O.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    create.mockImplementation(() => {
      // Runs after the persist timer is armed (same tick); jump past it.
      queueMicrotask(() => void vi.advanceTimersByTimeAsync(3_000));
      return new Promise(() => {});
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ scanId: SCAN_ID });
    vi.useRealTimers();
    expect(await res.json()).toEqual({ ok: true, result: RESULT, persisted: false });
  });

  it("admin not configured → persisted:false, 200", async () => {
    adminDb.mockImplementation(() => {
      throw new AdminNotConfiguredError(["FIREBASE_PRIVATE_KEY"]);
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await post({ scanId: SCAN_ID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, result: RESULT, persisted: false });
  });
});
