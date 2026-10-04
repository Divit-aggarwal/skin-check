import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

// Red team (2026-10-04, tracker I02, area A F5, F7, F8): client writes the
// rules accepted live. Emulator only (test:local).
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — red-team client writes", () => {
  let env: RulesTestEnvironment;
  const UID = "rt-owner";
  const PHONE = "+919999910999";
  const db = () => env.authenticatedContext(UID, { phone_number: PHONE }).firestore();
  const check = (id: string, extra: Record<string, unknown> = {}) =>
    setDoc(doc(db(), "users", UID, "skinChecks", id), { schemaVersion: 1, scanId: id, answers: {}, status: "questionnaire_only", result: null, createdAt: serverTimestamp(), image: null, ...extra });

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-redteam",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
  });
  afterAll(async () => env?.cleanup());

  it("F5: a check dated by the client (2030) is refused; control: the server's time is accepted", async () => {
    await assertFails(check("rt-date-forged-01", { createdAt: new Date("2030-01-01") }));
    await assertSucceeds(check("rt-date-ok-000001"));
  });

  it("F5: a check whose scanId field names another check is refused", async () => {
    await assertFails(check("rt-mismatch-00001", { scanId: "someoneElse" }));
  });

  it("F7: image.stored as the string \"true\" is refused; control: a boolean false is accepted", async () => {
    await assertFails(check("rt-stored-str-001", { image: { stored: "true", key: "users/other/scans/x/original.jpg" }, consent: { imageRetention: false } }));
    await assertSucceeds(check("rt-stored-false01", { image: { stored: false }, consent: { imageRetention: false } }));
  });

  it("F8: the profile holds only phoneNumber and lastSeenAt, and the phone is the token's own", async () => {
    const me = doc(db(), "users", UID);
    await assertFails(setDoc(me, { phoneNumber: PHONE, lastSeenAt: serverTimestamp(), role: "admin" }));
    await assertFails(setDoc(me, { phoneNumber: "+910000000000", lastSeenAt: serverTimestamp() }));
    await assertSucceeds(setDoc(me, { phoneNumber: PHONE, lastSeenAt: serverTimestamp() }, { merge: true }));
  });
});
