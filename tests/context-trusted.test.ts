import { describe, expect, it, vi } from "vitest";

// lane:context made two additive fields readable in loadTrustedEchoContext.
// A bad value in either must be dropped, never turn a record today's Echo
// could read into "no analysis" (409).
const { store } = vi.hoisted(() => ({ store: { analysis: {} as Record<string, unknown> } }));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: () => ({
      doc: () => ({
        collection: (name: string) =>
          name === "scanAnalyses"
            ? { where: () => ({ get: async () => ({ docs: [{ data: () => store.analysis }] }) }) }
            : { doc: () => ({ get: async () => ({ exists: false, data: () => undefined }) }) },
      }),
    }),
  }),
}));

import { loadTrustedEchoContext } from "@/lib/echo-trusted-context";

const scores = { redness: 0.5, oiliness: 0.5, texture: 0.5, pores: 0, blemishes: 0.5, hydration: 0.5, pigment: 0.5 };

describe("trusted context additive fields", () => {
  it("reads pipeline_version and region_low_confidence", async () => {
    store.analysis = { scanId: "s", scores, pipeline_version: "scan-0.1.6", region_low_confidence: { cheeks: true } };
    expect(await loadTrustedEchoContext("u", "s")).toMatchObject({ pipelineVersion: "scan-0.1.6", regionLowConfidence: { cheeks: true } });
  });

  it.each([
    ["an over-long pipeline_version", { pipeline_version: "x".repeat(500) }],
    ["a non-string pipeline_version", { pipeline_version: 7 }],
    ["a malformed region_low_confidence", { region_low_confidence: { cheeks: "yes" } }],
  ])("%s is dropped and the record still loads", async (_name, extra) => {
    store.analysis = { scanId: "s", scores, ...extra };
    const ctx = await loadTrustedEchoContext("u", "s");
    expect(ctx).not.toBeNull();
    expect(ctx!.scores).toEqual(scores);
  });
});
