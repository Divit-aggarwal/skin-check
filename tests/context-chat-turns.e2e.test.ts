// Emulator round trip (npm run test:local), lane:context. Skipped unless the
// local stack set FIRESTORE_EMULATOR_HOST. The Admin SDK writes and reads
// chat turns in the Firestore emulator; no Gemini call is made.
import { describe, expect, it } from "vitest";
import { CHAT_TURN_TTL_DAYS, loadChatHistory, recordChatTurns } from "@/lib/context/chat-turns";
import { adminDb } from "@/lib/firebase/admin";

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("chatTurns round trip (D-15)", () => {
  it("stores package version, prompt version, model and validator result for every answer; history skips pre-filter turns", async () => {
    const uid = `context-e2e-${crypto.randomUUID()}`;
    const scanId = crypto.randomUUID();
    const now = Date.now();
    const validator = { passed: false, failures: ["cause"], regenerated: true, fallback: true };
    await recordChatTurns(uid, scanId, "cheeks", "why is it red?", "Redness reads Moderate.", {
      packageVersion: "ctx-1", packageSha256: "a".repeat(64), promptVersion: "ctx-prompt-1", modelId: "model-x",
      validator, prefilter: null, redFlag: false, latencyMs: 12,
    }, now);
    await recordChatTurns(uid, scanId, "cheeks", "my mole is bleeding", "referral", {
      packageVersion: null, packageSha256: null, promptVersion: null, modelId: null, validator: null, prefilter: "red_flag", redFlag: true, latencyMs: 1,
    }, now + 10);
    await recordChatTurns(uid, scanId, "nose", "nose?", "Nose answer.", {
      packageVersion: "ctx-1", packageSha256: "b".repeat(64), promptVersion: "ctx-prompt-1", modelId: "model-x",
      validator: { passed: true, failures: [], regenerated: false, fallback: false }, prefilter: null, redFlag: false, latencyMs: 5,
    }, now + 20);

    const docs = (await adminDb().collection("users").doc(uid).collection("chatTurns").get()).docs.map((d) => d.data());
    expect(docs).toHaveLength(6);
    const echo = docs.find((d) => d.role === "echo" && d.text === "Redness reads Moderate.")!;
    expect(echo).toMatchObject({ packageVersion: "ctx-1", promptVersion: "ctx-prompt-1", modelId: "model-x", validator, scanId, region: "cheeks" });
    const ttlDays = (echo.expireAt.toMillis() - now) / 86_400_000;
    expect(ttlDays).toBe(CHAT_TURN_TTL_DAYS);
    expect(docs.filter((d) => d.redFlag).every((d) => d.prefilter === "red_flag")).toBe(true);

    expect(await loadChatHistory(uid, scanId, "cheeks")).toEqual([
      { role: "user", text: "why is it red?" },
      { role: "echo", text: "Redness reads Moderate." },
    ]);
  }, 60_000);
});
