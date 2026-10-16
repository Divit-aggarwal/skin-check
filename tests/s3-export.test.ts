import { beforeEach, describe, expect, it, vi } from "vitest";

// H37: the export's photo links use the read-only pair, last EXPORT_LINK_SECONDS,
// and come back from S3 private, not storable, as a download.

const { send, getSignedUrl } = vi.hoisted(() => ({ send: vi.fn(), getSignedUrl: vi.fn() }));
vi.mock("@aws-sdk/client-s3", async () => {
  const actual = await vi.importActual<typeof import("@aws-sdk/client-s3")>("@aws-sdk/client-s3");
  return { ...actual, S3Client: class { send = send; } };
});
vi.mock("@aws-sdk/s3-request-presigner", () => ({ getSignedUrl }));

const READ_ENV = {
  S3_SKIN_IMAGES_REGION: "ap-south-1",
  S3_SKIN_IMAGES_BUCKET: "bucket",
  S3_SKIN_IMAGES_READ_ACCESS_KEY_ID: "read-id",
  S3_SKIN_IMAGES_READ_SECRET_ACCESS_KEY: "read-secret",
};

async function load(env: Record<string, string | undefined> = READ_ENV) {
  vi.resetModules();
  for (const [k, v] of Object.entries({ ...READ_ENV, ...env })) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("@/lib/s3");
}

beforeEach(() => getSignedUrl.mockReset());

describe("presignExportRead", () => {
  it("signs a one-hour GET, private, not storable, sent as a download", async () => {
    const s3 = await load();
    getSignedUrl.mockResolvedValue("https://signed");
    expect(await s3.presignExportRead("users/a/scans/x/left.jpg")).toBe("https://signed");
    const [, command, options] = getSignedUrl.mock.calls[0]!;
    expect(options).toEqual({ expiresIn: 3600 });
    expect(command.input).toMatchObject({
      Bucket: "bucket",
      Key: "users/a/scans/x/left.jpg",
      ResponseCacheControl: "private, no-store, max-age=0",
      ResponseContentType: "image/jpeg",
      ResponseContentDisposition: "attachment",
    });
  });

  it("fails closed without the read pair: no fallback to the upload or erase keys", async () => {
    const s3 = await load({ S3_SKIN_IMAGES_READ_SECRET_ACCESS_KEY: undefined, S3_SKIN_IMAGES_ACCESS_KEY_ID: "upload", S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID: "erase" });
    expect(() => s3.presignExportRead("k")).toThrow(/S3_SKIN_IMAGES_READ_SECRET_ACCESS_KEY/);
    expect(getSignedUrl).not.toHaveBeenCalled();
  });
});
