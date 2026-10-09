import { describe, expect, it } from "vitest";
import { geminiErrorDetail } from "@/lib/gemini";

// F18: production logged only "ApiError", so a key, quota or permission error could
// not be told apart. The status and Google's reason code are logged; nothing else.
describe("geminiErrorDetail (F18)", () => {
  it("an ApiError: its status and Google's reason code", () => {
    const err = Object.assign(new Error('{"error":{"code":400,"message":"API key not valid. Please pass a valid API key.","status":"INVALID_ARGUMENT","details":[{"reason":"API_KEY_INVALID"}]}}'), { name: "ApiError", status: 400 });
    expect(geminiErrorDetail(err)).toEqual(["status=400", "reason=API_KEY_INVALID"]);
  });

  it("never the message text: a reason-like string in user text with lower case is not picked up", () => {
    const err = Object.assign(new Error('{"error":{"message":"my phone is 9999999999","details":[{"reason":"my secret"}]}}'), { status: 500 });
    expect(geminiErrorDetail(err)).toEqual(["status=500"]);
  });

  it("any other error: nothing extra", () => {
    expect(geminiErrorDetail(new TypeError("x"))).toEqual([]);
    expect(geminiErrorDetail(undefined)).toEqual([]);
  });
});
