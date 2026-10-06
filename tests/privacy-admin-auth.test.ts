import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// R2 (owner decision 12): the add-only adminAuth() and verifyFirebaseIdTokenClaims()
// in lib/firebase/admin.ts, against the real implementation with the SDK faked.
const verifyIdToken = vi.fn();
const authInstance = { verifyIdToken };
const getAuth = vi.fn(() => authInstance);
vi.mock("firebase-admin/app", () => ({ getApps: () => [], initializeApp: (_: unknown, name: string) => ({ name }), cert: () => ({}) }));
vi.mock("firebase-admin/auth", () => ({ getAuth }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => ({}) }));

async function loadAdmin() {
  vi.resetModules();
  return import("@/lib/firebase/admin");
}

const DECODED = { uid: "u1", auth_time: 1_700_000_000, phone_number: "+919999900001" };

beforeEach(() => {
  verifyIdToken.mockReset().mockResolvedValue(DECODED);
  getAuth.mockClear();
  vi.stubEnv("FIREBASE_PROJECT_ID", "demo-test");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "x@demo-test.iam.gserviceaccount.com");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "not-a-real-key");
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("verifyFirebaseIdTokenClaims", () => {
  it("returns the decoded token, including uid and auth_time, verified with checkRevoked=true", async () => {
    const { verifyFirebaseIdTokenClaims } = await loadAdmin();
    await expect(verifyFirebaseIdTokenClaims("tok")).resolves.toEqual(DECODED);
    expect(verifyIdToken).toHaveBeenCalledWith("tok", true);
  });

  it("propagates a revoked-token rejection", async () => {
    verifyIdToken.mockRejectedValue(Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" }));
    const { verifyFirebaseIdTokenClaims } = await loadAdmin();
    await expect(verifyFirebaseIdTokenClaims("tok")).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  });

  it("refuses in production with the auth emulator configured, before any verification", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
    const { verifyFirebaseIdTokenClaims, AdminNotConfiguredError } = await loadAdmin();
    await expect(verifyFirebaseIdTokenClaims("tok")).rejects.toBeInstanceOf(AdminNotConfiguredError);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("fails closed with no credential outside the emulators", async () => {
    vi.stubEnv("FIREBASE_PRIVATE_KEY", "");
    const { verifyFirebaseIdTokenClaims, AdminNotConfiguredError } = await loadAdmin();
    await expect(verifyFirebaseIdTokenClaims("tok")).rejects.toBeInstanceOf(AdminNotConfiguredError);
  });
});

describe("adminAuth", () => {
  it("returns the Auth instance of the named admin app", async () => {
    const { adminAuth } = await loadAdmin();
    expect(adminAuth()).toBe(authInstance);
    expect(getAuth).toHaveBeenCalledWith({ name: "admin" });
  });
});
