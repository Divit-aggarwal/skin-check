import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

// Runs only inside the Firestore emulator (npm run test:local). D-15: the
// server writes chat turns through the Admin SDK; clients may only read their own.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — chatTurns (lane:context)", () => {
  let env: RulesTestEnvironment;
  const OWNER = "context-owner";
  const OTHER = "context-other";
  const TURN = "turn-1";
  const turn = { scanId: "0f8fad5b-d9cb-469f-a165-70867728950e", region: "cheeks", role: "echo", text: "Redness is Moderate.", prefilter: null, redFlag: false };

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-context",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "chatTurns", TURN), turn);
    });
  });

  afterAll(async () => env?.cleanup());

  const db = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
  const ref = (uid: string | null, id = TURN) => doc(db(uid), "users", OWNER, "chatTurns", id);

  it("the owner can get and list their turns", async () => {
    await assertSucceeds(getDoc(ref(OWNER)));
    await assertSucceeds(getDocs(collection(db(OWNER), "users", OWNER, "chatTurns")));
  });

  it("another user or no auth cannot read them", async () => {
    await assertFails(getDoc(ref(OTHER)));
    await assertFails(getDocs(collection(db(OTHER), "users", OWNER, "chatTurns")));
    await assertFails(getDoc(ref(null)));
  });

  it("a collection-group query across users is denied", async () => {
    await assertFails(getDocs(collectionGroup(db(OTHER), "chatTurns")));
  });

  it("no client can forge, edit or delete a turn (history cannot be forged)", async () => {
    await assertFails(setDoc(ref(OWNER, "forged"), { ...turn, text: "Your redness is Low." }));
    await assertFails(setDoc(ref(OTHER, "forged-2"), turn));
    await assertFails(updateDoc(ref(OWNER), { text: "edited" }));
    await assertFails(deleteDoc(ref(OWNER)));
  });
});
