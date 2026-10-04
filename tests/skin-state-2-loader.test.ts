import { beforeEach, describe, expect, it, vi } from "vitest";

// Firebase is the only thing stubbed; the path built and the mapping are the loader's own.
const { adminDb, get } = vi.hoisted(() => ({ adminDb: vi.fn(), get: vi.fn() }));
vi.mock("@/lib/firebase/admin", () => ({ adminDb }));

import { loadTrustedSkinState2Series } from "@/lib/skin-state-2-loader";
import { syntheticAnalysis } from "./synthetic-scan";

// The doc id is {scanId}_{first 16 of inputSha256}; toSkinState checks it.
const record = (scanId: string, build: string | undefined, sha = scanId === "SCANA" ? "a" : "b") => ({
  schemaVersion: 1, source: "server", scanId, inputSha256: sha.repeat(64), requestId: `req-${scanId}`,
  createdAt: new Date("2026-10-10T10:00:00Z"), ...syntheticAnalysis(), ...(build ? { engine_build: build } : {}),
});

beforeEach(() => {
  vi.clearAllMocks();
  // A path-recording stand-in for adminDb().collection().doc().collection().get().
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

describe("loadTrustedSkinState2Series", () => {
  it("reads exactly users/{uid}/scanAnalyses and maps every record with its own path, as skinstate-2", async () => {
    get.mockResolvedValue({
      docs: [
        { id: "SCANA_aaaaaaaaaaaaaaaa", data: () => record("SCANA", "build-1") },
        { id: "SCANB_bbbbbbbbbbbbbbbb", data: () => record("SCANB", undefined) },
      ],
    });
    const series = await loadTrustedSkinState2Series("uid-1");
    expect(get).toHaveBeenCalledWith("users/uid-1/scanAnalyses");
    expect(series.map((r) => r.kind)).toEqual(["skinstate", "skinstate"]);
    const [a, b] = series.map((r) => (r.kind === "skinstate" ? r.state : null));
    expect(a?.contractVersion).toBe("skinstate-2");
    expect(a?.identity.analysisRef).toBe("users/uid-1/scanAnalyses/SCANA_aaaaaaaaaaaaaaaa");
    expect(a?.engine.build).toBe("build-1");
    expect(b?.identity.analysisRef).toBe("users/uid-1/scanAnalyses/SCANB_bbbbbbbbbbbbbbbb");
    expect(b?.engine.build).toBeNull();
  });

  it("a broken record stays in the series as invalid (the engine then says bad raw data), never dropped", async () => {
    get.mockResolvedValue({ docs: [{ id: "SCANA_aaaaaaaaaaaaaaaa", data: () => ({ source: "client" }) }] });
    expect((await loadTrustedSkinState2Series("uid-1")).map((r) => r.kind)).toEqual(["invalid"]);
  });

  it.each(["a/b", "", "..", "uid-1/scanAnalyses"])("rejects uid %j without reading", async (uid) => {
    expect(await loadTrustedSkinState2Series(uid)).toEqual([{ kind: "invalid", reasons: ["uid: not a valid path segment"] }]);
    expect(adminDb).not.toHaveBeenCalled();
  });
});
