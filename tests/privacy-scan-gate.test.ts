import { beforeEach, describe, expect, it, vi } from "vitest";

// H02a in the /api/skin-scan preamble: the gate runs after token verification
// and before formData() is read or the engine called. Gate logic itself is
// tested in privacy-ledger.test.ts (scanAgeGate).
const { verifyFirebaseIdToken, scanAgeGate, formDataSpy } = vi.hoisted(() => {
  process.env.SKIN_SCAN_API_URL = "http://cv.test";
  return { verifyFirebaseIdToken: vi.fn(), scanAgeGate: vi.fn(), formDataSpy: vi.fn() };
});

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return {
    bearerToken: actual.bearerToken,
    AdminNotConfiguredError: actual.AdminNotConfiguredError,
    verifyFirebaseIdToken,
    adminDb: () => {
      throw new Error("no persistence in this suite");
    },
  };
});
vi.mock("@/app/api/account/_ledger", () => ({ scanAgeGate }));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null, consumeDailyQuota: () => null };
});

import { POST } from "@/app/api/skin-scan/route";
import { NextRequest, NextResponse } from "next/server";

const SCORES = { redness: 1, oiliness: 1, texture: 1, pores: 0, blemishes: 1, hydration: 1, pigment: 1 };
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

function post() {
  const form = new FormData();
  form.append("image", new Blob(["photo"], { type: "image/jpeg" }), "scan.jpg");
  const req = new NextRequest("http://localhost/api/skin-scan", {
    method: "POST",
    headers: { authorization: "Bearer good" },
    body: form,
  });
  const original = req.formData.bind(req);
  req.formData = () => {
    formDataSpy();
    return original();
  };
  return POST(req);
}

let engine: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("SCAN_API_SECRET", "secret");
  engine = vi.fn(async () => new Response(JSON.stringify(RESULT), { status: 200 }));
  vi.stubGlobal("fetch", engine);
  verifyFirebaseIdToken.mockResolvedValue("uid-scan");
  scanAgeGate.mockResolvedValue(null);
});

describe("scan route age gate (preamble)", () => {
  it("asks the gate with the verified uid; going ahead runs the scan unchanged", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(scanAgeGate).toHaveBeenCalledWith("uid-scan", "skin-scan");
    expect(engine).toHaveBeenCalledTimes(1);
  });

  it("under 18: 403 UNDER_18 before formData() is read and before the engine is called", async () => {
    scanAgeGate.mockResolvedValue(NextResponse.json({ code: "UNDER_18" }, { status: 403 }));
    const res = await post();
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("UNDER_18");
    expect(formDataSpy).not.toHaveBeenCalled();
    expect(engine).not.toHaveBeenCalled();
  });

  it("the gate runs only after token verification", async () => {
    verifyFirebaseIdToken.mockRejectedValue(new Error("bad"));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect((await post()).status).toBe(401);
    expect(scanAgeGate).not.toHaveBeenCalled();
  });
});
