import { beforeEach, describe, expect, it, vi } from "vitest";

// eraseUserPrefix with the AWS SDK faked at the client: which credentials it
// signs with, that it pages until empty, and that it fails closed.
const { sends, configs, pages } = vi.hoisted(() => ({
  sends: [] as { name: string; input: Record<string, unknown> }[],
  configs: [] as Record<string, unknown>[],
  pages: [] as unknown[],
}));

vi.mock("@aws-sdk/client-s3", () => {
  class Command {
    constructor(public input: Record<string, unknown>) {}
  }
  return {
    PutObjectCommand: class PutObjectCommand extends Command {},
    ListObjectsV2Command: class ListObjectsV2Command extends Command {},
    DeleteObjectsCommand: class DeleteObjectsCommand extends Command {},
    S3Client: class {
      constructor(config: Record<string, unknown>) {
        configs.push(config);
      }
      async send(cmd: Command) {
        sends.push({ name: cmd.constructor.name, input: cmd.input });
        return pages.shift() ?? {};
      }
    },
  };
});

import { userPrefix } from "@/lib/s3-key";

async function loadS3(env: Record<string, string | undefined>) {
  vi.resetModules();
  vi.unstubAllEnvs();
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v as string);
  return import("@/lib/s3");
}

const CONFIGURED = {
  S3_SKIN_IMAGES_REGION: "ap-south-1",
  S3_SKIN_IMAGES_BUCKET: "bucket",
  S3_SKIN_IMAGES_ACCESS_KEY_ID: "upload-key",
  S3_SKIN_IMAGES_SECRET_ACCESS_KEY: "upload-secret",
  S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID: "erase-key",
  S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY: "erase-secret",
};

beforeEach(() => {
  sends.length = 0;
  configs.length = 0;
  pages.length = 0;
});

describe("userPrefix", () => {
  it("ends with a slash, so one uid never matches another that starts with it", () => {
    expect(userPrefix("abc")).toBe("users/abc/");
    expect("users/abcd/scans/x/original.jpg".startsWith(userPrefix("abc"))).toBe(false);
  });

  it("refuses a uid that could point into another user's tree", () => {
    for (const uid of ["victim/scans", "..", "", "a.b", "a b"]) expect(() => userPrefix(uid)).toThrow();
  });
});

describe("eraseUserPrefix", () => {
  it("signs with the erase pair, never the upload pair", async () => {
    const { eraseUserPrefix } = await loadS3(CONFIGURED);
    await eraseUserPrefix("u1");
    expect(configs).toHaveLength(1);
    expect(configs[0]!.credentials).toEqual({ accessKeyId: "erase-key", secretAccessKey: "erase-secret" });
  });

  it("lists users/<uid>/ and deletes page by page until empty", async () => {
    const { eraseUserPrefix } = await loadS3(CONFIGURED);
    pages.push(
      { Contents: [{ Key: "users/u1/scans/a/original.jpg" }, { Key: "users/u1/scans/b/original.jpg" }] },
      {},
      { Contents: [{ Key: "users/u1/scans/c/original.jpg" }] },
      {},
      { Contents: [] }
    );
    expect(await eraseUserPrefix("u1")).toBe(3);
    expect(sends.map((s) => s.name)).toEqual([
      "ListObjectsV2Command",
      "DeleteObjectsCommand",
      "ListObjectsV2Command",
      "DeleteObjectsCommand",
      "ListObjectsV2Command",
    ]);
    expect(sends[0]!.input).toMatchObject({ Bucket: "bucket", Prefix: "users/u1/" });
    expect(sends[1]!.input).toMatchObject({
      Delete: { Objects: [{ Key: "users/u1/scans/a/original.jpg" }, { Key: "users/u1/scans/b/original.jpg" }] },
    });
  });

  it("a per-object delete error throws, without the key (it carries the uid)", async () => {
    const { eraseUserPrefix } = await loadS3(CONFIGURED);
    pages.push({ Contents: [{ Key: "users/u1/x" }] }, { Errors: [{ Key: "users/u1/x", Code: "AccessDenied" }] });
    const err = await eraseUserPrefix("u1").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain("AccessDenied");
    expect((err as Error).message).not.toContain("u1");
  });

  it("fails closed when the erase pair is unset, even with the upload pair set; nothing is listed", async () => {
    const { eraseUserPrefix, S3NotConfiguredError } = await loadS3({
      ...CONFIGURED,
      S3_SKIN_IMAGES_ERASE_ACCESS_KEY_ID: "",
      S3_SKIN_IMAGES_ERASE_SECRET_ACCESS_KEY: "",
    });
    await expect(eraseUserPrefix("u1")).rejects.toBeInstanceOf(S3NotConfiguredError);
    expect(sends).toEqual([]);
  });
});
