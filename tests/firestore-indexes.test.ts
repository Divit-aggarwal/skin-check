import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHAT_TURN_TTL_DAYS } from "@/lib/context/chat-turns";

// H17 (D-15): stored chat turns carry expireAt; this file is what deploys the
// expiry (TTL) policy on it (runbook job A, A3). No composite index is needed:
// every query in the app is equality-only or one range on one field.
describe("firestore.indexes.json", () => {
  const spec = JSON.parse(readFileSync("firestore.indexes.json", "utf8"));

  it("holds the chatTurns.expireAt TTL policy, with the field not indexed (never queried)", () => {
    expect(spec.fieldOverrides).toEqual([{ collectionGroup: "chatTurns", fieldPath: "expireAt", ttl: true, indexes: [] }]);
    expect(CHAT_TURN_TTL_DAYS).toBe(90);
  });

  it("declares no composite index", () => {
    expect(spec.indexes).toEqual([]);
  });
});
