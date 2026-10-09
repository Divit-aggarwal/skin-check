import { readFileSync } from "node:fs";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { PRODUCT_NAME_MAX } from "@/lib/skin-check-validation";

// TD-33: the optional questionnaire's records and the two product-name boxes,
// against the real firestore.rules in the emulator (npm run test:local runs
// every tests/firestore-rules*.test.ts there). Skipped outside the emulator.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — optional questionnaire and product names (TD-33)", () => {
  let env: RulesTestEnvironment;
  const OWNER = "owner-q";
  const OTHER = "other-q";
  let n = 0;
  const scanId = () => `0f8fad5b-d9cb-469f-a165-${String(++n).padStart(12, "0")}`;

  const BASICS = { name: "Tester", age: "25-34", gender: "female" };
  const check = (id: string, extra: Record<string, unknown> = {}) => ({
    schemaVersion: 1,
    scanId: id,
    answers: { ...BASICS, current_products: ["prescription", "other_products"] },
    questionnaire: "answered",
    questionnaireVersion: 2,
    status: "completed",
    image: null,
    consent: { imageRetention: false },
    result: null,
    createdAt: serverTimestamp(),
    ...extra,
  });
  const db = (uid: string) => env.authenticatedContext(uid).firestore();
  const writeCheck = (uid: string, id: string, extra: Record<string, unknown> = {}) => setDoc(doc(db(uid), "users", OWNER, "skinChecks", id), check(id, extra));
  const later = (id: string, extra: Record<string, unknown> = {}) => ({
    scanId: id,
    answers: { skin_type: "oily", current_products: ["prescription"] },
    questionnaireVersion: 2,
    createdAt: serverTimestamp(),
    ...extra,
  });
  const writeLater = (uid: string, id: string, extra: Record<string, unknown> = {}) => setDoc(doc(db(uid), "users", OWNER, "laterAnswers", id), later(id, extra));
  /** A skipped check of OWNER, written with the rules on (the real path). */
  async function skippedCheck(): Promise<string> {
    const id = scanId();
    await assertSucceeds(writeCheck(OWNER, id, { answers: BASICS, questionnaire: "skipped" }));
    return id;
  }

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-questionnaire",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
  });
  beforeEach(async () => env.clearFirestore());
  afterAll(async () => env?.cleanup());

  describe("skinChecks.productNames", () => {
    it("accepts both names with both options picked, and a record with none (old bundles too)", async () => {
      await assertSucceeds(writeCheck(OWNER, scanId(), { productNames: { prescription: "Tretinoin 0.025%", other: "A serum" } }));
      await assertSucceeds(writeCheck(OWNER, scanId()));
      // A record from before TD-33: no questionnaire fields at all.
      const id = scanId();
      await assertSucceeds(setDoc(doc(db(OWNER), "users", OWNER, "skinChecks", id), { schemaVersion: 1, scanId: id, answers: { skin_type: "oily" }, status: "completed", image: null, consent: { imageRetention: false }, result: null, createdAt: serverTimestamp() }));
    });

    it("refuses a name whose option is not picked", async () => {
      const answers = { ...BASICS, current_products: ["cleanser_moisturizer"] };
      await assertFails(writeCheck(OWNER, scanId(), { answers, productNames: { prescription: "x" } }));
      await assertFails(writeCheck(OWNER, scanId(), { answers: { ...BASICS, current_products: ["prescription"] }, productNames: { other: "x" } }));
      await assertFails(writeCheck(OWNER, scanId(), { answers: BASICS, productNames: { prescription: "x" } }));
      await assertFails(writeCheck(OWNER, scanId(), { answers: { ...BASICS, current_products: "prescription" }, productNames: { prescription: "x" } }));
    });

    it("accepts exactly the box's limit, in English, Hindi (Devanagari) and emoji; refuses one over", async () => {
      await assertSucceeds(writeCheck(OWNER, scanId(), { productNames: { prescription: "a".repeat(PRODUCT_NAME_MAX) } }));
      await assertFails(writeCheck(OWNER, scanId(), { productNames: { prescription: "a".repeat(PRODUCT_NAME_MAX + 1) } }));
      // The box counts UTF-16 units (textarea maxLength); 200 Devanagari letters are 200 units.
      await assertSucceeds(writeCheck(OWNER, scanId(), { productNames: { other: "क".repeat(PRODUCT_NAME_MAX) } }));
      // 100 emoji are 200 units in the box; the rules must not refuse what the box allows.
      await assertSucceeds(writeCheck(OWNER, scanId(), { productNames: { other: "😀".repeat(PRODUCT_NAME_MAX / 2) } }));
    });

    it("refuses an empty name, a non-string, an extra key and a non-map", async () => {
      await assertFails(writeCheck(OWNER, scanId(), { productNames: { prescription: "" } }));
      await assertFails(writeCheck(OWNER, scanId(), { productNames: { prescription: 42 } }));
      await assertFails(writeCheck(OWNER, scanId(), { productNames: { prescription: ["x"] } }));
      await assertFails(writeCheck(OWNER, scanId(), { productNames: { prescription: "x", notes: "y" } }));
      await assertFails(writeCheck(OWNER, scanId(), { productNames: "Tretinoin" }));
    });

    it("only the account's owner: another user cannot write a check (with names) into this account", async () => {
      await assertFails(writeCheck(OTHER, scanId(), { productNames: { prescription: "x" } }));
    });

    it("only the owner can read a check with names", async () => {
      const id = scanId();
      await assertSucceeds(writeCheck(OWNER, id, { productNames: { prescription: "x" } }));
      await assertSucceeds(getDoc(doc(db(OWNER), "users", OWNER, "skinChecks", id)));
      await assertFails(getDoc(doc(db(OTHER), "users", OWNER, "skinChecks", id)));
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "users", OWNER, "skinChecks", id)));
    });

    it("questionnaire is 'answered' or 'skipped' only; the check stays create-only", async () => {
      await assertFails(writeCheck(OWNER, scanId(), { questionnaire: "later" }));
      const id = await skippedCheck();
      await assertFails(updateDoc(doc(db(OWNER), "users", OWNER, "skinChecks", id), { answers: { ...BASICS, skin_type: "oily" } }));
    });
  });

  describe("laterAnswers", () => {
    it("the owner answers a skipped check once; no update, no delete", async () => {
      const id = await skippedCheck();
      await assertSucceeds(writeLater(OWNER, id, { productNames: { prescription: "Adapalene" } }));
      await assertSucceeds(getDoc(doc(db(OWNER), "users", OWNER, "laterAnswers", id)));
      await assertFails(writeLater(OWNER, id));
      await assertFails(updateDoc(doc(db(OWNER), "users", OWNER, "laterAnswers", id), { answers: {} }));
      await assertFails(deleteDoc(doc(db(OWNER), "users", OWNER, "laterAnswers", id)));
    });

    it("refused for an answered check, a missing check, or a check of another id", async () => {
      const answered = scanId();
      await assertSucceeds(writeCheck(OWNER, answered));
      await assertFails(writeLater(OWNER, answered));
      await assertFails(writeLater(OWNER, scanId()));
      const id = await skippedCheck();
      await assertFails(setDoc(doc(db(OWNER), "users", OWNER, "laterAnswers", id), later(scanId())));
    });

    it("another user can neither write nor read it", async () => {
      const id = await skippedCheck();
      await assertFails(writeLater(OTHER, id));
      await assertSucceeds(writeLater(OWNER, id));
      await assertFails(getDoc(doc(db(OTHER), "users", OWNER, "laterAnswers", id)));
    });

    it("holds only its own fields, with the server's time", async () => {
      const id = await skippedCheck();
      await assertFails(writeLater(OWNER, id, { image: { stored: true } }));
      await assertFails(writeLater(OWNER, id, { createdAt: new Date(2020, 0, 1) }));
      await assertFails(writeLater(OWNER, id, { answers: "skin_type=oily" }));
    });

    it("the same name rules as on the check", async () => {
      const id = await skippedCheck();
      await assertFails(writeLater(OWNER, id, { productNames: { other: "x" } })); // other_products not picked
      await assertFails(writeLater(OWNER, id, { productNames: { prescription: "a".repeat(PRODUCT_NAME_MAX + 1) } }));
      await assertSucceeds(writeLater(OWNER, id, { productNames: { prescription: "क".repeat(PRODUCT_NAME_MAX) } }));
    });

    it("refused after an erase and for an under-18 account", async () => {
      const id = await skippedCheck();
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), "erasedAccounts", OWNER), { sweepAfter: new Date() });
      });
      await assertFails(writeLater(OWNER, id));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await deleteDoc(doc(ctx.firestore(), "erasedAccounts", OWNER));
        await setDoc(doc(ctx.firestore(), "under18Accounts", OWNER), { at: new Date() });
      });
      await assertFails(writeLater(OWNER, id));
    });
  });
});
