import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// C2 recovery: a successful scan whose server-side analysis write failed
// (persisted:false) gets exactly one background re-request — same bytes, same
// scanId, no overlays — that never touches the user's result.
vi.mock("@/lib/firebase/client", () => ({ auth: () => ({ currentUser: { uid: "verified-uid" } }) }));
vi.mock("firebase/auth", () => ({ getIdToken: async () => "fresh-id-token" }));

import { runSkinScan } from "@/lib/api";

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

// Each call to fetch takes the next responder; the last one repeats.
function stubScan(...responders: Array<() => Response | Promise<Response>>) {
  const bodies: FormData[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(init.body as FormData);
      return responders[Math.min(bodies.length, responders.length) - 1]!();
    })
  );
  return bodies;
}
const ok = (extra: Record<string, unknown>) => () =>
  new Response(JSON.stringify({ ok: true, result: RESULT, ...extra }), { status: 200 });

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("runSkinScan persist retry", () => {
  it("persisted:false → resolves first, then exactly one re-request with same scanId/bytes and no overlay", async () => {
    const bodies = stubScan(ok({ persisted: false }), ok({ persisted: true }));
    const { result, persisted } = await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native", overlays: ["redness", "pores"] });

    // User-facing result is already in hand; the re-request hasn't fired.
    expect(result.pipeline_version).toBe(RESULT.pipeline_version);
    expect(persisted).toBe(false);
    expect(bodies).toHaveLength(1);
    expect(bodies[0]!.get("overlay")).toBe("redness,pores");
    expect(bodies[0]!.has("persistAttempt")).toBe(false);
    expect(bodies[0]!.get("captureMethod")).toBe("native");

    await vi.runAllTimersAsync();
    expect(bodies).toHaveLength(2);
    expect(bodies[1]!.get("scanId")).toBe(SCAN_ID);
    expect(bodies[1]!.has("overlay")).toBe(false);
    expect(bodies[1]!.get("persistAttempt")).toBe("recovery");
    // The recovery record is a second CV run of the same capture: same method.
    expect(bodies[1]!.get("captureMethod")).toBe("native");
    expect(bodies[1]!.get("image")).toBeInstanceOf(Blob);
    expect(await (bodies[1]!.get("image") as Blob).text()).toBe("downscaled-bytes");

    // Never a second retry, even if more time passes.
    await vi.runAllTimersAsync();
    expect(bodies).toHaveLength(2);
  });

  // undefined → key absent from the JSON body (older route / no scanId).
  it.each([[true], [undefined]])("persisted:%s → no re-request", async (flag) => {
    const bodies = stubScan(ok({ persisted: flag }));
    const { persisted } = await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native" });
    await vi.runAllTimersAsync();
    expect(bodies).toHaveLength(1);
    expect(persisted).toBe(flag);
  });

  it("swallows a failed re-request (and does not retry again)", async () => {
    const bodies = stubScan(ok({ persisted: false }), () => {
      throw new TypeError("network down");
    });
    await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native" });
    await vi.runAllTimersAsync();
    expect(bodies).toHaveLength(2);
    expect(console.warn).toHaveBeenCalledWith("skin-scan: analysis record persist retry failed.");
  });

  it("swallows a non-ok re-request response", async () => {
    const bodies = stubScan(ok({ persisted: false }), () => new Response("{}", { status: 429 }));
    await runSkinScan({ scanId: SCAN_ID, photo, captureMethod: "native" });
    await vi.runAllTimersAsync();
    expect(bodies).toHaveLength(2);
    expect(console.warn).toHaveBeenCalledWith("skin-scan: analysis record persist retry failed.");
  });
});
