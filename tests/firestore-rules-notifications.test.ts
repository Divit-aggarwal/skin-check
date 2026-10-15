import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Runs only inside the Firestore emulator (npm run test:local). G31: the
// owner may read settings/notifications; nobody writes it from a client.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — notification switches (G31, mm:be1)", () => {
  let env: RulesTestEnvironment;
  const OWNER = "notif-owner";
  const OTHER = "notif-other";
  const prefs = { schemaVersion: 1, types: { routine_morning: true } };

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-notifications",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
  });
  beforeEach(async () => {
    await env.clearFirestore();
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users", OWNER, "settings", "notifications"), prefs));
  });
  afterAll(async () => env?.cleanup());

  const db = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
  const ref = (uid: string | null) => doc(db(uid), "users", OWNER, "settings", "notifications");

  it("the owner can read it", async () => {
    await assertSucceeds(getDoc(ref(OWNER)));
  });

  it("nobody else can read it, signed in or not", async () => {
    await assertFails(getDoc(ref(OTHER)));
    await assertFails(getDoc(ref(null)));
  });

  it("no client can create, change or delete it, not even the owner", async () => {
    await assertFails(updateDoc(ref(OWNER), { "types.marketing": true }));
    await assertFails(setDoc(ref(OWNER), prefs));
    await assertFails(deleteDoc(ref(OWNER)));
    await assertFails(setDoc(doc(db(OTHER), "users", OTHER, "settings", "notifications"), prefs));
    await assertFails(setDoc(ref(OTHER), prefs));
  });
});
