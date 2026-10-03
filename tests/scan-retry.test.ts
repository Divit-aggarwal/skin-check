import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

// Capture lane requests to the dashboard (capture-report §4): a refused photo
// is retaken, never retried; a retry carries the capture quality result.
vi.mock("@/lib/firebase/client", () => ({ auth: () => ({ currentUser: null }) }));

import { ApiError } from "@/lib/api";
import { RETAKE_COPY } from "@/lib/capture-quality/retake";
import type { CaptureQuality } from "@/lib/capture-quality/types";
import { canRetrySamePhoto, retrySkinScan } from "@/lib/scan-retry";
import type { SkinScanResult, SkinScanState } from "@/types/skin-scan";

type ErrorScan = Extract<SkinScanState, { status: "error" }>;

const quality = { schemaVersion: 1, verdict: "pass", retakeReasons: [] } as unknown as CaptureQuality;
const photo = new Blob(["p"]);
const failed = (extra: Partial<ErrorScan> = {}): ErrorScan => ({
  status: "error",
  message: "Analysis failed.",
  photo,
  captureMethod: "native",
  quality,
  ...extra,
});
const result = { scores: {} } as unknown as SkinScanResult;

describe("refused photo: retake, not retry", () => {
  it("a scan the engine refused cannot be retried with the same photo", () => {
    expect(canRetrySamePhoto(failed({ retakeReason: "no_face_found" }))).toBe(false);
    expect(canRetrySamePhoto(failed())).toBe(true);
  });

  it("the dashboard offers Retake photo (onRetake) instead of the retry when refused", () => {
    const src = readFileSync("components/skin-check/SkinCheckDashboard.tsx", "utf8");
    const flow = readFileSync("components/skin-check/SkinCheckFlow.tsx", "utf8");
    expect(src).toMatch(/canRetrySamePhoto\(scan\) \?[\s\S]*onClick=\{handleRetry\}[\s\S]*: \([\s\S]*onClick=\{onRetake\}[\s\S]*Retake photo/);
    // The record for this scanId is already saved (create-only): a retake is a new scan.
    expect(flow).toContain("onRetake={startNewScan}");
  });
});

describe("retrySkinScan", () => {
  it("passes captureQuality and keeps quality on success", async () => {
    const run = vi.fn(async () => ({ result, originalStored: false }));
    const next = await retrySkinScan(failed(), "scan-1", run);
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ scanId: "scan-1", photo, captureQuality: quality }));
    expect(next).toMatchObject({ status: "success", result, quality });
  });

  it("keeps quality on a failed retry", async () => {
    const run = vi.fn(async () => {
      throw new Error("engine down");
    });
    const next = await retrySkinScan(failed(), "scan-1", run);
    expect(next).toMatchObject({ status: "error", message: "Analysis failed.", quality });
    expect(next).not.toHaveProperty("retakeReason", expect.anything());
  });

  it("a retry the engine refuses turns into a retake", async () => {
    const run = vi.fn(async () => {
      throw new ApiError(400, "Failed to analyze photo.", "NO_FACE_DETECTED");
    });
    const next = (await retrySkinScan(failed(), "scan-1", run)) as ErrorScan;
    expect(next.retakeReason).toBe("no_face_found");
    expect(next.message).toBe(RETAKE_COPY.no_face_found);
    expect(canRetrySamePhoto(next)).toBe(false);
  });
});
