import { beforeEach, describe, expect, it, vi } from "vitest";

// Firebase is the only thing stubbed; the path built and the trust decision are the loader's own.
const { adminDb, get } = vi.hoisted(() => ({ adminDb: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb }));

import { loadTrustedSkinState } from "@/lib/skin-state-loader";
import { syntheticAnalysis } from "./synthetic-scan";

const DOC_ID = "SYNTHSCAN01_aaaaaaaaaaaaaaaa";
const record = () => ({
  schemaVersion: 1, source: "server", scanId: "SYNTHSCAN01", inputSha256: "a".repeat(64), requestId: "synth-req-1",
  createdAt: new Date("2026-10-10T10:00:00Z"), ...syntheticAnalysis(),
});

beforeEach(() => {
  vi.clearAllMocks();
  // A path-recording stand-in for adminDb().collection().doc()...get().
  adminDb.mockImplementation(() => {
    const segs: string[] = [];
    const ref = {
      collection: (n: string) => (segs.push(n), ref),
      doc: (n: string) => (segs.push(n), ref),
      get: () => get(segs.join("/")),
    };
    return ref;
  });
});

describe("loadTrustedSkinState", () => {
  it("reads exactly users/{uid}/scanAnalyses/{docId} and maps it", async () => {
    get.mockResolvedValue({ exists: true, data: () => record() });
    const result = await loadTrustedSkinState("uid-1", DOC_ID);
    expect(get).toHaveBeenCalledWith(`users/uid-1/scanAnalyses/${DOC_ID}`);
    if (result.kind !== "skinstate") throw new Error(JSON.stringify(result));
    expect(result.state.identity).toEqual({ analysisRef: `users/uid-1/scanAnalyses/${DOC_ID}`, scanId: "SYNTHSCAN01" });
  });

  it("returns invalid when the doc is missing", async () => {
    get.mockResolvedValue({ exists: false, data: () => undefined });
    expect(await loadTrustedSkinState("uid-1", DOC_ID)).toEqual({ kind: "invalid", reasons: ["not found"] });
  });

  it.each([["uid-1", "x/y"], ["uid-1", ".."], ["a/b", DOC_ID], ["", DOC_ID]])("rejects uid %j / docId %j without reading", async (uid, docId) => {
    expect((await loadTrustedSkinState(uid, docId)).kind).toBe("invalid");
    expect(adminDb).not.toHaveBeenCalled();
  });
});
