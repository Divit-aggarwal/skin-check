import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

// H04 (TD-19): while erasedAccounts/{uid} exists, an ID token issued before
// the erase cannot write anything for that uid. Emulator only (test:local).
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — erased accounts", () => {
  let env: RulesTestEnvironment;
  const ERASED = "erased-uid";
  const OTHER = "other-uid";
  const check = (scanId: string) => ({ schemaVersion: 1, scanId, answers: {}, status: "completed", result: null, createdAt: new Date(), image: null, consent: { imageRetention: false } });

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-erased",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", ERASED), { phoneNumber: "+91" });
      await setDoc(doc(ctx.firestore(), "erasedAccounts", ERASED), { sweepAfter: new Date(), markedAt: new Date() });
    });
  });
  afterAll(async () => env?.cleanup());

  it("the erased user's old token cannot create a check, create or update the profile", async () => {
    const db = env.authenticatedContext(ERASED).firestore();
    await assertFails(setDoc(doc(db, "users", ERASED, "skinChecks", "late-check-0001"), check("late-check-0001")));
    await assertFails(setDoc(doc(db, "users", ERASED), { phoneNumber: "+91", lastSeenAt: new Date() }, { merge: true }));
  });

  it("control: another user (no marker) can still write their own", async () => {
    const db = env.authenticatedContext(OTHER).firestore();
    await assertSucceeds(setDoc(doc(db, "users", OTHER), { phoneNumber: "+91" }));
    await assertSucceeds(setDoc(doc(db, "users", OTHER, "skinChecks", "ok-check-00001"), check("ok-check-00001")));
  });

  it("no client can read or write the marker, its own or another's", async () => {
    for (const uid of [ERASED, OTHER]) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, "erasedAccounts", ERASED)));
      await assertFails(setDoc(doc(db, "erasedAccounts", uid), { sweepAfter: new Date(0) }));
    }
  });
});
