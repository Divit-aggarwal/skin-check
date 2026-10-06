import { describe, expect, it, vi } from "vitest";

// Second security review (H20): the presigned PUT is signed for one exact
// size and the content type, so a URL cannot write a larger (or other) object.
// Fake config and credentials; nothing is sent (getSignedUrl is local).
describe("presignOriginalUpload signing", () => {
  it("signs content-length and content-type, with the size given", async () => {
    vi.stubEnv("S3_SKIN_IMAGES_REGION", "ap-south-1");
    vi.stubEnv("S3_SKIN_IMAGES_BUCKET", "test-bucket");
    vi.stubEnv("S3_SKIN_IMAGES_ACCESS_KEY_ID", "AKIDEXAMPLE");
    vi.stubEnv("S3_SKIN_IMAGES_SECRET_ACCESS_KEY", "test-secret");
    vi.stubEnv("S3_SKIN_IMAGES_ENDPOINT", "");
    vi.resetModules();
    const { presignOriginalUpload } = await import("@/lib/s3");
    const url = new URL(await presignOriginalUpload("users/u/scans/s/original.jpg", 1234));
    expect(url.searchParams.get("X-Amz-SignedHeaders")!.split(";").sort()).toEqual(["content-length", "content-type", "host"]);
    expect(url.searchParams.get("X-Amz-Expires")).toBe("300");
    expect(url.pathname).toContain("users/u/scans/s/original.jpg");
    // Red team (I02, area A): no checksum of an empty body in the URL. Real S3
    // rejects a non-empty PUT whose body does not match it (S3Mock does not check).
    expect(Array.from(url.searchParams.keys()).filter((k) => /checksum/i.test(k))).toEqual([]);
    vi.unstubAllEnvs();
  });
});
