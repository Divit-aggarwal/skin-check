// The local-stack switches (tracker B01) must stay off in production builds:
// emulator connections, the S3 endpoint override, Admin without credentials,
// and the dev Gemini key.
import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("firebase/auth");
  vi.doUnmock("firebase/firestore");
});

describe("S3 endpoint override", () => {
  const presign = async (nodeEnv: string) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("S3_SKIN_IMAGES_ENDPOINT", "http://127.0.0.1:3108");
    vi.stubEnv("S3_SKIN_IMAGES_REGION", "ap-south-1");
    vi.stubEnv("S3_SKIN_IMAGES_BUCKET", "skin-originals-dev");
    vi.stubEnv("S3_SKIN_IMAGES_ACCESS_KEY_ID", "test");
    vi.stubEnv("S3_SKIN_IMAGES_SECRET_ACCESS_KEY", "test");
    const { presignOriginalUpload } = await import("@/lib/s3");
    return new URL(await presignOriginalUpload("users/u/scans/s/original.jpg", 1000));
  };
  it("is used outside production", async () => {
    expect((await presign("development")).host).toBe("127.0.0.1:3108");
  });
  it("is ignored in production", async () => {
    expect((await presign("production")).hostname).toMatch(/amazonaws\.com$/);
  });
});

describe("Admin emulator mode", () => {
  it.each([
    ["development", true],
    ["test", true],
    ["production", false],
  ])("NODE_ENV=%s -> %s", async (nodeEnv, expected) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:3101");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "127.0.0.1:3102");
    const { usesEmulators } = await import("@/lib/firebase/admin");
    expect(usesEmulators()).toBe(expected);
  });
  it("needs both emulators", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:3101");
    vi.stubEnv("FIRESTORE_EMULATOR_HOST", "");
    const { usesEmulators } = await import("@/lib/firebase/admin");
    expect(usesEmulators()).toBe(false);
  });
});

describe("client emulator connection", () => {
  it.each([
    ["development", 1],
    ["production", 0],
  ])("NODE_ENV=%s connects %i time(s)", async (nodeEnv, calls) => {
    const connectAuthEmulator = vi.fn();
    const connectFirestoreEmulator = vi.fn();
    vi.doMock("firebase/auth", () => ({ getAuth: () => ({}), connectAuthEmulator }));
    vi.doMock("firebase/firestore", () => ({ getFirestore: () => ({}), connectFirestoreEmulator }));
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "demo-api-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", `demo-switch-${nodeEnv}`);
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:3101");
    vi.stubEnv("NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST", "127.0.0.1:3102");
    const { deleteApp, getApps } = await import("firebase/app");
    await Promise.all(getApps().map((a) => deleteApp(a)));
    const { auth } = await import("@/lib/firebase/client");
    auth();
    expect(connectAuthEmulator).toHaveBeenCalledTimes(calls);
    expect(connectFirestoreEmulator).toHaveBeenCalledTimes(calls);
  });
});

describe("Gemini key", () => {
  it.each([
    ["development", "dev-key"],
    ["production", "prod-key"],
    ["test", "prod-key"],
  ])("NODE_ENV=%s uses %s", async (nodeEnv, expected) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("GEMINI_API_KEY", "prod-key");
    vi.stubEnv("GEMINI_DEV_API_KEY", "dev-key");
    const { geminiApiKey } = await import("@/lib/gemini-key");
    expect(geminiApiKey()).toBe(expected);
  });
  it("development never falls back to GEMINI_API_KEY", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("GEMINI_API_KEY", "prod-key");
    vi.stubEnv("GEMINI_DEV_API_KEY", "");
    const { geminiApiKey } = await import("@/lib/gemini-key");
    expect(geminiApiKey()).toBeUndefined();
  });
});
