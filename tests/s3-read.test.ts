import { beforeEach, describe, expect, it, vi } from "vitest";

// G03 / TD-25 (2): the read-only S3 pair behind GET /api/checks/photo.
// Security review M1: with s3:GetObject only (no ListBucket), S3 answers a
// HEAD on a missing key with 403, which must read as "no photo", not a failure.

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

const fail = (status: number, name: string) => Object.assign(new Error(name), { name, $metadata: { httpStatusCode: status } });

beforeEach(() => {
  send.mockReset();
  getSignedUrl.mockReset();
});

describe("originalExists", () => {
  it("true when HEAD succeeds", async () => {
    const s3 = await load();
    send.mockResolvedValue({});
    expect(await s3.originalExists("users/a/scans/x/original.jpg")).toBe(true);
  });

  it("missing reads as false: 404 NotFound, and 403 under a GetObject-only policy", async () => {
    const s3 = await load();
    for (const err of [fail(404, "NotFound"), fail(403, "Forbidden"), fail(403, "AccessDenied")]) {
      send.mockRejectedValueOnce(err);
      expect(await s3.originalExists("users/a/scans/x/original.jpg")).toBe(false);
    }
  });

  it("any other failure still throws", async () => {
    const s3 = await load();
    send.mockRejectedValueOnce(fail(500, "InternalError"));
    await expect(s3.originalExists("k")).rejects.toThrow("InternalError");
  });

  it("fails closed without the read pair: no fallback to the upload or erase keys", async () => {
    const s3 = await load({ S3_SKIN_IMAGES_READ_ACCESS_KEY_ID: undefined, S3_SKIN_IMAGES_ACCESS_KEY_ID: "upload", S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID: "erase" });
    await expect(s3.originalExists("k")).rejects.toThrow(/S3_SKIN_IMAGES_READ_ACCESS_KEY_ID/);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("presignOriginalRead", () => {
  it("signs a 60-second GET whose response is private and not storable", async () => {
    const s3 = await load();
    getSignedUrl.mockResolvedValue("https://signed");
    expect(await s3.presignOriginalRead("users/a/scans/x/original.jpg")).toBe("https://signed");
    const [, command, options] = getSignedUrl.mock.calls[0]!;
    expect(options).toEqual({ expiresIn: 60 });
    expect(command.input).toMatchObject({ Bucket: "bucket", Key: "users/a/scans/x/original.jpg", ResponseCacheControl: "private, no-store, max-age=0", ResponseContentType: "image/jpeg" });
  });
});
