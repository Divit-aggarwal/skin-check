// The local Gemini stand-in (scripts/fake-gemini.mjs) on the running stack:
// today's Echo answers through it, and the recorded request carries no phone,
// uid or name. Skipped unless scripts/local-stack.sh started the stack.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emulatorPhoneSignIn } from "./e2e-auth";

const WEB = process.env.LOCAL_STACK_WEB;
const RAVI = { uid: "seed-user-ravi", phoneNumber: "+919999900002" };

describe.skipIf(!WEB)("fake Gemini on the local stack", () => {
  it("Echo calls it, and the recorded request has no phone, uid or name", async () => {
    // A seeded check with a server analysis and quiz answers (including the name "Ravi", which must never be sent).
    const scanId = "seed-ravi-1";

    const { idToken } = await emulatorPhoneSignIn(RAVI.phoneNumber);
    const res = await fetch(`${WEB}/api/skin-check/chat`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify({ scanId, region: "cheeks", message: "what does oiliness mean?", history: [] }),
    });
    expect(res.status).toBe(200);
    // On the context path the stand-in's plain sentence is not valid structured
    // output, so the validator gives the fixed fallback; on today's Echo it is the reply.
    expect(typeof (await res.json()).reply).toBe("string");

    const lines = readFileSync(".local-stack/fake-gemini/requests.jsonl", "utf8").trim().split("\n");
    const last = lines.at(-1)!;
    expect(last).toContain("what does oiliness mean?");
    for (const banned of [RAVI.phoneNumber, "9999900002", RAVI.uid, "Ravi"]) expect(last, banned).not.toContain(banned);
  }, 60_000);
});
