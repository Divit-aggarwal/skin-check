import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

// Runs only inside the Firestore emulator (npm run test:local). R-6 A: the
// server writes routine events through the Admin SDK; clients may only read
// their own.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — routineEvents (lane:routine)", () => {
  let env: RulesTestEnvironment;
  const OWNER = "routine-owner";
  const OTHER = "routine-other";
  const EVENT_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
  const event = {
    type: "start",
    eventId: EVENT_ID,
    productId: "refreshing-cleanser",
    effectiveDate: "2026-10-01",
    timeZone: "Asia/Kolkata",
    schedule: { slot: "AM", days: [1, 3, 5] },
    schemaVersion: 1,
    catalogVersion: "catalog-0-synthetic",
    recordedAt: new Date(),
    source: "user",
  };

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-routine",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "routineEvents", EVENT_ID), event);
    });
  });

  afterAll(async () => env?.cleanup());

  const ref = (uid: string | null, owner = OWNER, id = EVENT_ID) => {
    const db = uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
    return doc(db, "users", owner, "routineEvents", id);
  };
  const list = (uid: string | null, owner = OWNER) => {
    const db = uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
    return getDocs(collection(db, "users", owner, "routineEvents"));
  };

  it("the owner can get and list their events", async () => {
    await assertSucceeds(getDoc(ref(OWNER)));
    await assertSucceeds(list(OWNER));
  });

  it("another user cannot get or list them", async () => {
    await assertFails(getDoc(ref(OTHER)));
    await assertFails(list(OTHER));
  });

  it("no auth cannot get or list them", async () => {
    await assertFails(getDoc(ref(null)));
    await assertFails(list(null));
  });

  it("a collection-group query across users is denied", async () => {
    await assertFails(getDocs(collectionGroup(env.authenticatedContext(OTHER).firestore(), "routineEvents")));
  });

  it("the owner cannot create, even with a valid body", async () => {
    await assertFails(setDoc(ref(OWNER, OWNER, "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed"), event));
  });

  it("another user cannot create in the owner's subtree", async () => {
    await assertFails(setDoc(ref(OTHER, OWNER, "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bee"), event));
  });

  it("the owner cannot update", async () => {
    await assertFails(updateDoc(ref(OWNER), { productId: "protecting-sunscreen" }));
    await assertFails(setDoc(ref(OWNER), { ...event, productId: "protecting-sunscreen" }));
  });

  it("the owner cannot delete", async () => {
    await assertFails(deleteDoc(ref(OWNER)));
  });
});
