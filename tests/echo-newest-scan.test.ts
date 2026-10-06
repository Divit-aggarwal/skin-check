import { describe, expect, it, vi } from "vitest";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

// F13 (owner TD-20, option a): the server's pick is the dashboard's echoScanId.
const h = vi.hoisted(() => ({ docs: [] as { id: string; data: Record<string, unknown> }[], path: "" }));
vi.mock("@/lib/firebase/admin", () => ({
  adminDb: () => ({
    collection: (a: string) => ({ doc: (uid: string) => ({ collection: (b: string) => ({ get: async () => {
      h.path = `${a}/${uid}/${b}`;
      return { docs: h.docs.map((d) => ({ id: d.id, data: () => d.data })) };
    } }) }) }),
  }),
}));

import { checkEchoScan } from "@/lib/echo-newest-scan";
import { deriveDashboard } from "@/components/dashboard/state";

const UID = "SYNTH_UID";
const A = "0f8fad5b-d9cb-469f-a165-70867728950a";
const B = "0f8fad5b-d9cb-469f-a165-70867728950b";
function analysis(scanId: string, day: number, extra: Record<string, unknown> = {}) {
  const sha = scanId.replace(/-/g, "").padEnd(64, "0").slice(0, 64);
  const result = { ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec", ...extra };
  const data = buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId, inputSha256: sha, requestId: "r", captureMethod: "native" });
  return { id: scanAnalysisDocId(scanId, sha), data: { ...data, createdAt: new Date(Date.UTC(2026, 9, day)) } };
}

describe("checkEchoScan (F13)", () => {
  it("only the newest measured check; reads this uid's own records", async () => {
    h.docs = [analysis(A, 1), analysis(B, 2)];
    expect(await checkEchoScan(UID, B)).toBe("ok");
    expect(await checkEchoScan(UID, A)).toBe("not_newest");
    expect(h.path).toBe(`users/${UID}/scanAnalyses`);
    // The same scan the dashboard offers.
    expect(deriveDashboard(UID, [], h.docs).echoScanId).toBe(B);
  });

  it("a newest reading with unreadable scores: neither check is answered, and neither is told 'not newest'", async () => {
    h.docs = [analysis(A, 1), analysis(B, 2, { scores: { redness: 5 } })];
    expect(await checkEchoScan(UID, A)).toBe("no_reading");
    expect(await checkEchoScan(UID, B)).toBe("no_reading");
  });

  it("the check just made, with no server record yet, next to an older reading: no_reading (retryable), not 'not newest'", async () => {
    h.docs = [analysis(A, 1)];
    expect(await checkEchoScan(UID, B)).toBe("no_reading");
  });

  it("no records: no reading", async () => {
    h.docs = [];
    expect(await checkEchoScan(UID, A)).toBe("no_reading");
  });
});
