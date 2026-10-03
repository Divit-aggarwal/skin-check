import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Exercises the REAL verifyFirebaseIdToken (every route test mocks it whole),
// so the revocation flag and the emulator guard can't regress silently.
const verifyIdToken = vi.fn();
vi.mock("firebase-admin/app", () => ({ getApps: () => [], initializeApp: () => ({}), cert: () => ({}) }));
vi.mock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));
vi.mock("firebase-admin/firestore", () => ({ getFirestore: () => ({}) }));

async function loadAdmin() {
  vi.resetModules(); // admin.ts reads env at module scope
  return import("@/lib/firebase/admin");
}

beforeEach(() => {
  verifyIdToken.mockReset().mockResolvedValue({ uid: "u1" });
  vi.stubEnv("FIREBASE_PROJECT_ID", "demo-test");
  vi.stubEnv("FIREBASE_CLIENT_EMAIL", "x@demo-test.iam.gserviceaccount.com");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "not-a-real-key");
  vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("verifyFirebaseIdToken (real implementation)", () => {
  it("verifies with checkRevoked=true and returns the token's uid", async () => {
    const { verifyFirebaseIdToken } = await loadAdmin();
    await expect(verifyFirebaseIdToken("tok")).resolves.toBe("u1");
    expect(verifyIdToken).toHaveBeenCalledWith("tok", true);
  });

  it("propagates a revoked-token rejection (fail closed)", async () => {
    verifyIdToken.mockRejectedValue(Object.assign(new Error("revoked"), { code: "auth/id-token-revoked" }));
    const { verifyFirebaseIdToken } = await loadAdmin();
    await expect(verifyFirebaseIdToken("tok")).rejects.toMatchObject({ code: "auth/id-token-revoked" });
  });

  it("refuses to verify in production when the auth emulator is configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
    const { verifyFirebaseIdToken, AdminNotConfiguredError } = await loadAdmin();
    await expect(verifyFirebaseIdToken("tok")).rejects.toBeInstanceOf(AdminNotConfiguredError);
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("allows the emulator outside production (local dev and tests)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("FIREBASE_AUTH_EMULATOR_HOST", "127.0.0.1:9099");
    const { verifyFirebaseIdToken } = await loadAdmin();
    await expect(verifyFirebaseIdToken("tok")).resolves.toBe("u1");
  });
});
