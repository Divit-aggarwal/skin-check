import { beforeEach, describe, expect, it, vi } from "vitest";

// Gate 02 client half: Echo chat carries the user's ID token, and a 401 from
// the route surfaces as the same auth/required error as a signed-out user.
const { currentUser } = vi.hoisted(() => ({ currentUser: { value: { uid: "user-a" } as unknown } }));
vi.mock("@/lib/firebase/client", () => ({ auth: () => ({ currentUser: currentUser.value }) }));
vi.mock("firebase/auth", () => ({ getIdToken: async () => "fresh-id-token" }));

import { getSkinCheckChatReply, isAuthError } from "@/lib/api";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  vi.unstubAllGlobals();
  currentUser.value = { uid: "user-a" };
});

describe("Echo chat client auth", () => {
  it("sends the Bearer token", async () => {
    const fetchMock = stubFetch(200, { ok: true, reply: "hi", historyToken: "tok" });
    expect(await getSkinCheckChatReply(SCAN_ID, "cheeks", [], null, "hi")).toEqual({ reply: "hi", historyToken: "tok" });
    const headers = fetchMock.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer fresh-id-token");
    // Gate 02: identity + thread only — no measurements or answers leave the client.
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body as string)).toEqual({
      scanId: SCAN_ID,
      region: "cheeks",
      history: [],
      historyToken: null,
      message: "hi",
    });
  });

  it("maps a 401 to auth/required", async () => {
    stubFetch(401, { error: "Authentication required.", code: "AUTH_REQUIRED" });
    const err = await getSkinCheckChatReply(SCAN_ID, "cheeks", [], null, "hi").catch((e) => e);
    expect(isAuthError(err)).toBe(true);
    expect(err.status).toBe(401);
  });

  it.each(["CHAT_ANALYSIS_UNAVAILABLE", "CHAT_HISTORY_INVALID"])("surfaces %s as the ApiError code", async (code) => {
    stubFetch(code === "CHAT_HISTORY_INVALID" ? 400 : 409, { error: "x", code });
    const err = await getSkinCheckChatReply(SCAN_ID, "cheeks", [], null, "hi").catch((e) => e);
    expect(err.code).toBe(code);
    expect(isAuthError(err)).toBe(false);
  });

  it("no signed-in user → auth/required, no request", async () => {
    currentUser.value = null;
    const fetchMock = stubFetch(200, { ok: true, reply: "hi", historyToken: "tok" });
    const err = await getSkinCheckChatReply(SCAN_ID, "cheeks", [], null, "hi").catch((e) => e);
    expect(isAuthError(err)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
