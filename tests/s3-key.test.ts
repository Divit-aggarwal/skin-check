import { describe, expect, it } from "vitest";
import { isValidScanId, ORIGINAL_CONTENT_TYPE, scanImageKey } from "@/lib/s3-key";

describe("isValidScanId", () => {
  it("accepts both shapes newScanId() produces", () => {
    expect(isValidScanId("0f8fad5b-d9cb-469f-a165-70867728950e")).toBe(true);
    expect(isValidScanId("scan-m1a2b3c4-8x9y0z1w")).toBe(true);
  });

  it("rejects path traversal and anything else that isn't one plain segment", () => {
    for (const bad of [
      "../other-user",
      "../../foo",
      "users/foo",
      "scans/bar",
      "a/../b",
      "scan id",           // whitespace
      "scan.id",           // dot
      "%2e%2e%2fother",    // percent-encoded traversal
      "",
      "short",             // under 8 chars
      "x".repeat(65),      // over 64 chars
    ]) {
      expect(isValidScanId(bad), bad).toBe(false);
    }
  });

  it("rejects non-strings", () => {
    for (const bad of [null, undefined, 42, {}, ["scan-abcdefgh"]]) {
      expect(isValidScanId(bad)).toBe(false);
    }
  });
});

describe("scanImageKey", () => {
  it("is exactly users/{uid}/scans/{scanId}/original.jpg", () => {
    expect(scanImageKey("abc123", "scan_987")).toBe("users/abc123/scans/scan_987/original.jpg");
  });

  it("is deterministic — the same scan always maps to the same object", () => {
    expect(scanImageKey("u", "s")).toBe(scanImageKey("u", "s"));
  });

  it("stores JPEG", () => {
    expect(ORIGINAL_CONTENT_TYPE).toBe("image/jpeg");
  });
});
