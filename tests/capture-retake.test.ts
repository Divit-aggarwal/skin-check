import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { isRetakeError, RETAKE_COPY, RETAKE_REASONS, retakeReasonFromServerCode } from "@/lib/capture-quality/retake";

// Same lexicon as tests/comparability-wording.test.ts.
const BANNED_WORDS = /\b(improve\w*|worse|better|reduc\w*|increas\w*|decreas\w*|because|caused|due to|effect\w*|works)\b/i;

describe("retake reasons", () => {
  it("every reason has copy, and no copy has a digit or a comparative/causal word", () => {
    for (const reason of RETAKE_REASONS) {
      const copy = RETAKE_COPY[reason];
      expect(copy, reason).toBeTruthy();
      expect(copy).not.toMatch(new RegExp("\\p{Nd}", "u"));
      expect(copy).not.toMatch(BANNED_WORDS);
      expect(copy).not.toContain("%");
    }
    expect(Object.keys(RETAKE_COPY).sort()).toEqual([...RETAKE_REASONS].sort());
  });

  it.each([
    ["NO_FACE_DETECTED", "no_face_found"],
    ["IMAGE_UNPARSEABLE", "unreadable_image"],
    ["IMAGE_TOO_SMALL", "engine_too_small"],
    ["IMAGE_DIMENSIONS_TOO_LARGE", "engine_too_large"],
    ["IMAGE_TOO_LARGE", "engine_too_large"],
  ])("maps server code %s to %s", (code, reason) => {
    expect(retakeReasonFromServerCode(code)).toBe(reason);
  });

  it.each(["UNKNOWN_CODE", "SCAN_TIMEOUT", "SCAN_CAPACITY_EXCEEDED", "SCAN_SERVICE_ERROR", "auth/required", "upload/failed", "toString", "__proto__", "", undefined, null])(
    "does not ask for a retake on %s",
    (code) => {
      expect(retakeReasonFromServerCode(code)).toBeNull();
    }
  );

  it("isRetakeError only for an ApiError carrying a photo-problem code", () => {
    expect(isRetakeError(new Error("x"))).toBe(false);
    expect(isRetakeError(new ApiError(400, "Failed to analyze photo."))).toBe(false);
    expect(isRetakeError(new ApiError(504, "x", "SCAN_TIMEOUT"))).toBe(false);
    expect(isRetakeError(new ApiError(400, "x", "NO_FACE_DETECTED"))).toBe(true);
  });
});
