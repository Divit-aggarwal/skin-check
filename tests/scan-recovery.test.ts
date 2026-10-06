import { describe, expect, it, vi } from "vitest";
import { canSaveScan, photoLostRestore, PHOTO_INDEX, scanIdForUpdate, withTimeout } from "@/lib/useSkinCheckFlow";
import { SECTIONS } from "@/lib/skin-check-steps";
import type { SkinScanResult, SkinScanState } from "@/types/skin-scan";

const photo = new Blob(["jpeg"]);
const result = {} as SkinScanResult;
const states: Record<SkinScanState["status"], SkinScanState> = {
  idle: { status: "idle" },
  loading: { status: "loading" },
  success: { status: "success", result, photo, captureMethod: "canvas" },
  error: { status: "error", message: "failed", photo, captureMethod: "canvas" },
};

describe("save gate", () => {
  it.each([
    ["idle", false],
    ["loading", false],
    ["success", true],
    ["error", true],
  ] as const)("%s scan with a photo → %s", (status, expected) => {
    expect(canSaveScan(states[status], { skin_photo: "done" })).toBe(expected);
  });

  it.each(["idle", "loading", "success", "error"] as const)("%s scan without a photo → false", (status) => {
    expect(canSaveScan(states[status], {})).toBe(false);
  });
});

describe("restore after the photo was lost (refresh mid-analysis)", () => {
  const resultsIndex = SECTIONS.length - 1;

  it("lands on the photo step with the answers intact but the photo dropped, under a new scanId", () => {
    const restored = photoLostRestore(resultsIndex, { age: "25-34", skin_photo: "done" });
    expect(SECTIONS[restored.sectionIndex]!.id).toBe("skin-photo");
    expect(restored.answers).toEqual({ age: "25-34" });
    expect(restored.scanId).toEqual(expect.any(String));
    expect(photoLostRestore(resultsIndex, {}).scanId).not.toBe(restored.scanId);
  });

  it("never moves someone forward who was still before the photo step", () => {
    expect(photoLostRestore(PHOTO_INDEX - 1, {}).sectionIndex).toBe(PHOTO_INDEX - 1);
  });
});

describe("scanId across retries and retakes", () => {
  it("a retake (scan back to idle) mints a new scanId before the next upload", () => {
    const next = scanIdForUpdate("scan-a", states.idle);
    expect(next).not.toBeNull();
    expect(next).not.toBe("scan-a");
  });

  it.each(["loading", "success", "error"] as const)("a %s update (retry of the same photo) keeps the scanId", (status) => {
    expect(scanIdForUpdate("scan-a", states[status], "scan-a")).toBe("scan-a");
    expect(scanIdForUpdate("scan-a", states[status])).toBe("scan-a");
  });

  it("a late response from a superseded attempt is dropped", () => {
    expect(scanIdForUpdate("scan-b", states.success, "scan-a")).toBeNull();
    expect(scanIdForUpdate("scan-b", states.error, "scan-a")).toBeNull();
  });
});

describe("save timeout", () => {
  it("rejects a save that never settles, and passes through one that does", async () => {
    vi.useFakeTimers();
    try {
      const hung = withTimeout(new Promise(() => {}), 15_000);
      const check = expect(hung).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(15_000);
      await check;
      await expect(withTimeout(Promise.resolve("saved"), 15_000)).resolves.toBe("saved");
    } finally {
      vi.useRealTimers();
    }
  });
});
