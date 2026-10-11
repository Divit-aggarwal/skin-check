import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

// Runs only inside the Firestore emulator (npm run test:local). TD-47: only
// the owner can read or write their city and permission choices, and a
// precise position cannot be stored.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — Home settings and push subscriptions (TD-47)", () => {
  let env: RulesTestEnvironment;
  const OWNER = "home-owner";
  const OTHER = "home-other";
  const city = { name: "Bengaluru", region: "Karnataka", country: "India", latE1: 130, lonE1: 776, source: "device" };

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-home",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
  });
  beforeEach(async () => env.clearFirestore());
  afterAll(async () => env?.cleanup());

  const db = (uid: string | null) => (uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore());
  const settings = (uid: string | null, owner = OWNER, name = "home") => doc(db(uid), "users", owner, "settings", name);

  it("the owner can write and read their choices and city", async () => {
    await assertSucceeds(setDoc(settings(OWNER), { location: "allowed", reminders: "not_now", city, askedAt: serverTimestamp() }));
    await assertSucceeds(getDoc(settings(OWNER)));
    await assertSucceeds(setDoc(settings(OWNER), { city: { ...city, name: "Mysuru", source: "typed" } }, { merge: true }));
    await assertSucceeds(setDoc(settings(OWNER), { city: null, location: "refused" }, { merge: true }));
  });

  it("nobody else can read or write them, signed in or not", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users", OWNER, "settings", "home"), { city }));
    await assertFails(getDoc(settings(OTHER)));
    await assertFails(getDoc(settings(null)));
    await assertFails(setDoc(settings(OTHER), { location: "allowed" }));
    await assertFails(setDoc(settings(null), { location: "allowed" }));
    await assertFails(deleteDoc(settings(OWNER)));
  });

  it("a precise position cannot be stored: the coordinates are whole tenths of a degree", async () => {
    await assertFails(setDoc(settings(OWNER), { city: { ...city, latE1: 129.7194 } }));
    await assertFails(setDoc(settings(OWNER), { city: { ...city, lat: 12.97194, lon: 77.59369 } }));
    await assertFails(setDoc(settings(OWNER), { city, position: { lat: 12.97194, lon: 77.59369 } }));
    await assertFails(setDoc(settings(OWNER), { city: { ...city, latE1: 901 } }));
    await assertFails(setDoc(settings(OWNER), { city: { ...city, lonE1: "776" } }));
  });

  it("only known values and keys; only the doc named home; the date is the server's", async () => {
    await assertFails(setDoc(settings(OWNER), { location: "maybe" }));
    await assertFails(setDoc(settings(OWNER), { reminders: true }));
    await assertFails(setDoc(settings(OWNER), { city: { ...city, source: "gps" } }));
    await assertFails(setDoc(settings(OWNER), { city: { ...city, name: "" } }));
    await assertFails(setDoc(settings(OWNER, OWNER, "other"), { location: "allowed" }));
    await assertFails(setDoc(settings(OWNER), { askedAt: new Date("2020-01-01") }));
  });

  it("an erased or under-18 account cannot write", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "erasedAccounts", OWNER), { sweepAfter: new Date() }));
    await assertFails(setDoc(settings(OWNER), { location: "allowed" }));
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "under18Accounts", OTHER), { at: new Date() }));
    await assertFails(setDoc(settings(OTHER, OTHER), { location: "allowed" }));
  });

  it("push subscriptions: no client can read or write one, not even the owner", async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), "users", OWNER, "pushSubscriptions", "s1"), { endpoint: "https://fcm.googleapis.com/x" }));
    await assertFails(getDoc(doc(db(OWNER), "users", OWNER, "pushSubscriptions", "s1")));
    await assertFails(setDoc(doc(db(OWNER), "users", OWNER, "pushSubscriptions", "s2"), { endpoint: "https://evil.example/x" }));
  });
});
