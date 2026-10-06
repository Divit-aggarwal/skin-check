import { beforeEach, describe, expect, it, vi } from "vitest";

// C2 client half: the main analysis path names its scan so the server can
// persist the full analysis; a bare getSkinScanResult call does not.
vi.mock("@/lib/firebase/client", () => ({ auth: () => ({ currentUser: { uid: "verified-uid" } }) }));
vi.mock("firebase/auth", () => ({ getIdToken: async () => "fresh-id-token" }));

import { getSkinScanResult, runSkinScan } from "@/lib/api";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
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
const photo = new Blob(["downscaled-bytes"], { type: "image/jpeg" });

function stubScan() {
  const bodies: FormData[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(init.body as FormData);
      return new Response(JSON.stringify({ ok: true, result: RESULT, persisted: true }), { status: 200 });
    })
  );
  return bodies;
}

beforeEach(() => vi.unstubAllGlobals());

describe("scanId on the analysis request", () => {
  it("runSkinScan sends its scanId", async () => {
    const bodies = stubScan();
    await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native" });
    expect(bodies[0]!.get("scanId")).toBe(SCAN_ID);
  });

  it("getSkinScanResult without a scanId sends none (route writes nothing)", async () => {
    const bodies = stubScan();
    await getSkinScanResult(photo);
    expect(bodies[0]!.has("scanId")).toBe(false);
  });
});
