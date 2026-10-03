import { beforeEach, describe, expect, it, vi } from "vitest";

// Firestore is the only thing stubbed: what's under test is how saveSkinCheck
// reads a rejected write, and what the flow does once a save lands.
const setDoc = vi.fn();
const getDoc = vi.fn();
vi.mock("firebase/firestore", () => ({
  doc: (...path: unknown[]) => path,
  setDoc: (...args: unknown[]) => setDoc(...args),
  getDoc: (...args: unknown[]) => getDoc(...args),
  serverTimestamp: () => "server-ts",
  collection: vi.fn(),
  getDocs: vi.fn(),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
}));
vi.mock("@/lib/firebase/client", () => ({ db: () => ({}) }));

import { saveSkinCheck } from "@/lib/firebase/skin-checks";
import { completeSave, finishDraftFor, scanIdForUpdate, withTimeout } from "@/lib/useSkinCheckFlow";
import type { SkinScanResult, SkinScanState } from "@/types/skin-scan";

const scan: SkinScanState = {
  status: "success",
  result: { scores: {}, regions: [], region_scores: {}, pipeline_version: "v" } as unknown as SkinScanResult,
  photo: new Blob(["jpeg"]),
  captureMethod: "canvas",
};
const save = () => withTimeout(saveSkinCheck("uid", "scan-a", { skin_photo: "done" }, scan), 15_000);
const denied = () => Object.assign(new Error("denied"), { code: "permission-denied" });
const snapshot = (exists: boolean) => ({ exists: () => exists });

beforeEach(() => {
  setDoc.mockReset();
  getDoc.mockReset();
});

describe("a refused write only counts as saved if the doc exists", () => {
  it("permission-denied with the doc already there resolves (a duplicate)", async () => {
    setDoc.mockRejectedValueOnce(denied());
    getDoc.mockResolvedValueOnce(snapshot(true));
    await expect(save()).resolves.toBeUndefined();
    expect(getDoc.mock.calls[0]![0]).toEqual([{}, "users", "uid", "skinChecks", "scan-a"]);
  });

  it("permission-denied with no doc rejects (a genuine rule refusal), so the draft is kept", async () => {
    const error = denied();
    setDoc.mockRejectedValueOnce(error);
    getDoc.mockResolvedValueOnce(snapshot(false));
    await expect(save()).rejects.toBe(error);
  });

  it("permission-denied where the read also fails rejects with the ORIGINAL error", async () => {
    const error = denied();
    setDoc.mockRejectedValueOnce(error);
    getDoc.mockRejectedValueOnce(Object.assign(new Error("read denied"), { code: "permission-denied" }));
    await expect(save()).rejects.toBe(error);
  });

  it("any other failure rejects without a read", async () => {
    setDoc.mockRejectedValueOnce(Object.assign(new Error("offline"), { code: "unavailable" }));
    await expect(save()).rejects.toThrow("offline");
    expect(getDoc).not.toHaveBeenCalled();
  });
});

describe("save that times out, lands late, then is retried", () => {
  it("first attempt times out; the retry's permission-denied on the existing doc resolves as saved", async () => {
    vi.useFakeTimers();
    try {
      setDoc.mockReturnValueOnce(new Promise(() => {})); // offline: pending past the cap
      const first = save();
      const check = expect(first).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(15_000);
      await check;

      setDoc.mockRejectedValueOnce(denied());
      getDoc.mockResolvedValueOnce(snapshot(true)); // the first write landed late
      await expect(save()).resolves.toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("save landing after a retake mid-save", () => {
  function flow(startId: string) {
    let current = startId;
    const finish = vi.fn(); // clearDraft + draftFinished
    const commitAnswer = vi.fn(); // final_phone + onCommit
    const onSaved = finishDraftFor(() => current, finish);
    return { onSaved, finish, commitAnswer, rotate: (id: string) => (current = id) };
  }

  it("a save for X landing after the flow rotated to Y leaves Y's draft and answers alone", () => {
    const f = flow("scan-x");
    f.rotate(scanIdForUpdate("scan-x", { status: "idle" })!); // Retake → Y
    completeSave(f.onSaved, "scan-x", f.commitAnswer);
    expect(f.finish).not.toHaveBeenCalled();
    expect(f.commitAnswer).not.toHaveBeenCalled();
  });

  it("a save for the current scan finishes the draft and commits", () => {
    const f = flow("scan-x");
    completeSave(f.onSaved, "scan-x", f.commitAnswer);
    expect(f.finish).toHaveBeenCalledOnce();
    expect(f.commitAnswer).toHaveBeenCalledOnce();
  });
});
