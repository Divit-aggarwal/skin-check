import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

// H24 (owner TD-20, option a): while under18Accounts/{uid} exists, a modified
// client cannot store a skinCheck for that uid. Emulator only (test:local).
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — under-18 accounts (H24)", () => {
  let env: RulesTestEnvironment;
  const MINOR = "minor-uid";
  const ADULT = "adult-uid";
  const check = (scanId: string) => ({ schemaVersion: 1, scanId, answers: {}, status: "completed", result: null, createdAt: serverTimestamp(), image: null, consent: { imageRetention: false } });

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-under18",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "under18Accounts", MINOR), { markedAt: new Date() });
    });
  });
  afterAll(async () => env?.cleanup());

  it("a recorded under-18 account cannot create a check", async () => {
    const db = env.authenticatedContext(MINOR, { phone_number: "+91" }).firestore();
    await assertFails(setDoc(doc(db, "users", MINOR, "skinChecks", "minor-check-01"), check("minor-check-01")));
  });

  it("the profile write sign-in makes still works (the server refuses scan, upload and chat)", async () => {
    const db = env.authenticatedContext(MINOR, { phone_number: "+91" }).firestore();
    await assertSucceeds(setDoc(doc(db, "users", MINOR), { phoneNumber: "+91", lastSeenAt: serverTimestamp() }));
  });

  it("control: an account with no marker can create a check", async () => {
    const db = env.authenticatedContext(ADULT, { phone_number: "+91" }).firestore();
    await assertSucceeds(setDoc(doc(db, "users", ADULT, "skinChecks", "adult-check-01"), check("adult-check-01")));
  });

  it("no client can read, create or remove the marker", async () => {
    for (const uid of [MINOR, ADULT]) {
      const db = env.authenticatedContext(uid).firestore();
      await assertFails(getDoc(doc(db, "under18Accounts", MINOR)));
      await assertFails(setDoc(doc(db, "under18Accounts", uid), { markedAt: new Date(0) }));
    }
  });
});
