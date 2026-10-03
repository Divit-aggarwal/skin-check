import { beforeEach, describe, expect, it, vi } from "vitest";

// O-5: a failed scan's ApiError carries the route's error code; status and message unchanged.
const { currentUser } = vi.hoisted(() => ({ currentUser: { value: { uid: "user-a" } as unknown } }));
vi.mock("@/lib/firebase/client", () => ({ auth: () => ({ currentUser: currentUser.value }) }));
vi.mock("firebase/auth", () => ({ getIdToken: async () => "fresh-id-token" }));

import { ApiError, isAuthError, isUploadError, runSkinScan } from "@/lib/api";
import { isRetakeError } from "@/lib/capture-quality/retake";

const scan = () => runSkinScan({ scanId: "0f8fad5b-d9cb-469f-a165-70867728950e", photo: new Blob(["x"]), captureMethod: "native" }).catch((e) => e);
const stub = (status: number, body: string) => vi.stubGlobal("fetch", vi.fn(async () => new Response(body, { status })));

beforeEach(() => {
  vi.unstubAllGlobals();
  currentUser.value = { uid: "user-a" };
});

describe("scan error code pass-through", () => {
  it("a 400 with a code throws an ApiError with that code and the same message as before", async () => {
    stub(400, JSON.stringify({ error: "We couldn't detect a face…", code: "NO_FACE_DETECTED" }));
    const err = await scan();
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 400, message: "Failed to analyze photo.", code: "NO_FACE_DETECTED" });
    expect(isRetakeError(err)).toBe(true);
  });

  it("a non-JSON error body throws exactly as before", async () => {
    stub(502, "<html>bad gateway</html>");
    const err = await scan();
    expect(err).toMatchObject({ status: 502, message: "Failed to analyze photo.", code: undefined });
  });

  it("a 401 still gives auth/required", async () => {
    stub(401, JSON.stringify({ error: "Authentication required.", code: "AUTH_REQUIRED" }));
    expect(isAuthError(await scan())).toBe(true);
  });

  it.each(["NO_FACE_DETECTED", "IMAGE_UNPARSEABLE", "IMAGE_TOO_SMALL", "IMAGE_DIMENSIONS_TOO_LARGE", "IMAGE_TOO_LARGE",
    "SCAN_TIMEOUT", "SCAN_CAPACITY_EXCEEDED", "SCAN_SERVICE_ERROR", "SCAN_SERVICE_UNREACHABLE", "SCAN_MISCONFIGURED",
    "SCAN_AUTH_MISCONFIGURED", "AUTH_MISCONFIGURED", "auth/required", "upload/failed"])(
    "isAuthError and isUploadError stay false for server code %s",
    async (code) => {
      stub(code === "IMAGE_TOO_LARGE" ? 413 : 400, JSON.stringify({ code }));
      const err = await scan();
      expect(isAuthError(err)).toBe(false);
      expect(isUploadError(err)).toBe(false);
    }
  );
});
