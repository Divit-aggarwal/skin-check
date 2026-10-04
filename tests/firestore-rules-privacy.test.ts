import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

// Runs only inside the Firestore emulator (npm run test:local). Skipped
// otherwise so `npm test` stays a plain unit run.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — privacy: consent ledger", () => {
  let env: RulesTestEnvironment;
  const OWNER = "privacy-owner";
  const OTHER = "privacy-other";
  const ENTRY = "entry-1";
  const entry = { schemaVersion: 1, purpose: "age_18_plus", granted: true, version: "v", copySha256: "0".repeat(64), scanId: null, source: "attestation_route" };

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-privacy",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
    // The server's write, simulated with rules off.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "consentLedger", ENTRY), entry);
    });
  });

  afterAll(async () => env?.cleanup());

  const db = (uid: string) => env.authenticatedContext(uid).firestore();
  const entryRef = (uid: string, owner = OWNER) => doc(db(uid), "users", owner, "consentLedger", ENTRY);

  it("the owner can get and list their own entries", async () => {
    await assertSucceeds(getDoc(entryRef(OWNER)));
    await assertSucceeds(getDocs(collection(db(OWNER), "users", OWNER, "consentLedger")));
  });

  it("another user cannot get or list them", async () => {
    await assertFails(getDoc(entryRef(OTHER)));
    await assertFails(getDocs(collection(db(OTHER), "users", OWNER, "consentLedger")));
  });

  it("signed out cannot read", async () => {
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "consentLedger", ENTRY)));
  });

  it("no client create, update or delete, on their own path or another user's", async () => {
    await assertFails(setDoc(doc(db(OWNER), "users", OWNER, "consentLedger", "new"), entry));
    await assertFails(updateDoc(entryRef(OWNER), { granted: false }));
    await assertFails(deleteDoc(entryRef(OWNER)));
    await assertFails(setDoc(doc(db(OTHER), "users", OWNER, "consentLedger", "new"), entry));
    await assertFails(deleteDoc(entryRef(OTHER)));
  });

  it("a skinChecks create still succeeds with no ledger entry (D-03)", async () => {
    await assertSucceeds(
      setDoc(doc(db(OTHER), "users", OTHER, "skinChecks", "0f8fad5b-d9cb-469f-a165-70867728950e"), {
        schemaVersion: 1,
        answers: {},
        status: "completed",
        // The server's time, as the app writes it (rules require it since red team I02).
        createdAt: serverTimestamp(),
      })
    );
  });
});
