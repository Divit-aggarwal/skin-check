import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { uploadSides } from "@/components/skin-check/inputs/sideUploads";
import { threeAngleUi } from "@/lib/ui-flags";
import { GUIDED_COPY } from "@/components/skin-check/captureStates";
import { bannedWordsIn } from "@/lib/catalog/wording";

// C10/C11 (screen 07): the three-angle capture is behind its flag; the cheek photos are stored, never read.

const blob = (s: string) => new Blob([s], { type: "image/jpeg" });
const sides = { left: blob("l"), right: blob("r") };

describe("cheek photo uploads", () => {
  it("without the retention consent nothing is uploaded and both say not stored", async () => {
    const upload = vi.fn();
    expect(await uploadSides("u1", "s1", sides, false, upload)).toEqual({ left: { stored: false }, right: { stored: false } });
    expect(upload).not.toHaveBeenCalled();
  });
  it("with it, each side goes up with its angle and gets its own key", async () => {
    const upload = vi.fn().mockResolvedValue(undefined);
    expect(await uploadSides("u1", "s1", sides, true, upload)).toEqual({
      left: { stored: true, storage: "s3", key: "users/u1/scans/s1/left.jpg" },
      right: { stored: true, storage: "s3", key: "users/u1/scans/s1/right.jpg" },
    });
    expect(upload).toHaveBeenCalledWith("s1", sides.left, "left");
    expect(upload).toHaveBeenCalledWith("s1", sides.right, "right");
  });
  it("a failed side is not stored and never throws", async () => {
    const upload = vi.fn((_s: string, _b: Blob, angle: string) => (angle === "left" ? Promise.reject(new Error("x")) : Promise.resolve()));
    const out = await uploadSides("u1", "s1", sides, true, upload);
    expect(out.left).toEqual({ stored: false });
    expect(out.right.stored).toBe(true);
  });
});

describe("flag off: today's capture", () => {
  const capture = readFileSync("components/skin-check/inputs/PhotoCapture.tsx", "utf8");
  const api = readFileSync("lib/api.ts", "utf8");
  it("the flag is off unless set to exactly 'on'", () => {
    expect(threeAngleUi()).toBe(false);
  });
  it("the guided capture is reached only from the flag, and the engine gets only the front photo", () => {
    expect(capture).toMatch(/useState<"on" \| "off" \| GuidedFallback>\(\(\) => \(threeAngleUi\(\) \? "on" : "off"\)\)/);
    expect(capture.match(/<GuidedCapture /g)).toHaveLength(1);
    expect(capture).toMatch(/if \(guided === "on" && !hasCaptured\) return <GuidedCapture/);
    // runSkinScan gets the front blob only; the sides go through uploadSides.
    expect(capture).toMatch(/runSkinScan\(\{\s*scanId,\s*photo: blob,/);
    expect(capture).not.toMatch(/runSkinScan\([^)]*sides/);
  });
  it("the front upload request is unchanged: the angle field is sent only for a cheek photo", () => {
    expect(api).toMatch(/\.\.\.\(angle \? \{ angle \} : \{\}\)/);
    expect(api).toMatch(/uploadOriginalImage\(scanId, original\);/);
  });
  it("every guided sentence passes the word check", () => {
    const strings = (v: unknown): string[] => (typeof v === "string" ? [v] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : []);
    for (const s of strings(GUIDED_COPY)) expect(bannedWordsIn(s), s).toEqual([]);
  });
});
