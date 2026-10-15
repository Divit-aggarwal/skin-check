import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, collectionGroup, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";

// Runs only inside the Firestore emulator (npm run test:local). The mm:be3
// blocks of firestore.rules: C10 skinChecks.sideImages and E19 checkins.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules: mm:be3 (sideImages, checkins)", () => {
  let env: RulesTestEnvironment;
  const OWNER = "be3-owner";
  const OTHER = "be3-other";
  const consented = { imageRetention: true, imageRetentionVersion: "skin image retention version 2", imageRetentionConsentedAt: new Date() };
  const side = (angle: string, scanId: string, uid = OWNER) => ({ stored: true, storage: "s3", key: `users/${uid}/scans/${scanId}/${angle}.jpg` });
  const front = (scanId: string) => ({ stored: true, captureMethod: "native", storage: "s3", key: `users/${OWNER}/scans/${scanId}/original.jpg` });

  let n = 0;
  /** A fresh scanId per write (create-only), a valid front record, and the given extras. */
  const write = (extra: Record<string, unknown> | ((scanId: string) => Record<string, unknown>), uid = OWNER) => {
    const scanId = `be3-scan-${++n}-${Date.now()}`;
    const fields = typeof extra === "function" ? extra(scanId) : extra;
    const db = env.authenticatedContext(uid).firestore();
    return setDoc(doc(db, "users", OWNER, "skinChecks", scanId), {
      schemaVersion: 1,
      scanId,
      answers: {},
      status: "completed",
      result: null,
      image: front(scanId),
      consent: consented,
      createdAt: serverTimestamp(),
      ...fields,
    });
  };

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-be3",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "checkins", "2026-W42"), { checkinId: "2026-W42", answers: { overall: "no_change" } });
    });
  }, 30_000); // a cold emulator compiles the rules on the first write

  afterAll(async () => env?.cleanup());

  describe("skinChecks.sideImages", () => {
    it("absent (a front-only check) is allowed, as before", async () => {
      await assertSucceeds(write({}));
    });

    it("both sides kept, at this uid's own keys, with retention consent", async () => {
      await assertSucceeds(write((id) => ({ sideImages: { left: side("left", id), right: side("right", id) } })));
    });

    it("both or one side not kept is allowed, with or without consent", async () => {
      await assertSucceeds(write({ sideImages: { left: { stored: false }, right: { stored: false } } }));
      await assertSucceeds(write((id) => ({ sideImages: { left: side("left", id), right: { stored: false } } })));
      await assertSucceeds(
        write({ image: { stored: false, captureMethod: "native" }, consent: { imageRetention: false }, sideImages: { left: { stored: false }, right: { stored: false } } })
      );
    });

    it("REJECTS a kept side with no or a stale retention consent", async () => {
      const sides = (id: string) => ({ left: side("left", id), right: { stored: false } });
      await assertFails(write((id) => ({ image: { stored: false, captureMethod: "native" }, consent: { imageRetention: false }, sideImages: sides(id) })));
      await assertFails(
        write((id) => ({ image: { stored: false, captureMethod: "native" }, consent: { ...consented, imageRetentionVersion: "skin image retention version 0" }, sideImages: sides(id) }))
      );
    });

    it("REJECTS another user's key, the wrong side's key, the front's key, another check's key", async () => {
      await assertFails(write((id) => ({ sideImages: { left: side("left", id, OTHER), right: { stored: false } } })));
      await assertFails(write((id) => ({ sideImages: { left: side("right", id), right: { stored: false } } })));
      await assertFails(write((id) => ({ sideImages: { left: { ...side("left", id), key: `users/${OWNER}/scans/${id}/original.jpg` }, right: { stored: false } } })));
      await assertFails(write({ sideImages: { left: side("left", "some-other-scan"), right: { stored: false } } }));
    });

    it("REJECTS a bad shape: one side only, an extra side, extra keys, a string stored, no stored, another storage", async () => {
      await assertFails(write((id) => ({ sideImages: { left: side("left", id) } })));
      await assertFails(write((id) => ({ sideImages: { left: side("left", id), right: { stored: false }, back: { stored: false } } })));
      await assertFails(write((id) => ({ sideImages: { left: { ...side("left", id), url: "https://x" }, right: { stored: false } } })));
      await assertFails(write({ sideImages: { left: { stored: false, key: "x" }, right: { stored: false } } }));
      await assertFails(write((id) => ({ sideImages: { left: { ...side("left", id), stored: "true" }, right: { stored: false } } })));
      await assertFails(write({ sideImages: { left: {}, right: { stored: false } } }));
      await assertFails(write((id) => ({ sideImages: { left: { ...side("left", id), storage: "gcs" }, right: { stored: false } } })));
      await assertFails(write({ sideImages: "left,right" }));
    });

    it("valid sideImages never rescue a record that breaks a front rule (the check is AND-ed in)", async () => {
      const sides = (id: string) => ({ left: side("left", id), right: side("right", id) });
      await assertFails(write((id) => ({ createdAt: new Date(0), sideImages: sides(id) })));
      await assertFails(write((id) => ({ image: { ...front(id), key: `users/${OTHER}/scans/${id}/original.jpg` }, sideImages: sides(id) })));
      await assertFails(write((id) => ({ sideImages: sides(id) }), OTHER));
    });

    it("still create-only: a saved record's sideImages cannot be changed or deleted", async () => {
      const id = "be3-fixed-scan-0001";
      const db = env.authenticatedContext(OWNER).firestore();
      const ref = doc(db, "users", OWNER, "skinChecks", id);
      const record = { schemaVersion: 1, scanId: id, answers: {}, status: "completed", result: null, image: front(id), consent: consented, createdAt: serverTimestamp() };
      await assertSucceeds(setDoc(ref, { ...record, sideImages: { left: { stored: false }, right: { stored: false } } }));
      await assertFails(updateDoc(ref, { sideImages: { left: side("left", id), right: side("right", id) } }));
      await assertFails(deleteDoc(ref));
    });
  });

  describe("checkins", () => {
    const ref = (uid: string | null, id = "2026-W42") => {
      const db = uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
      return doc(db, "users", OWNER, "checkins", id);
    };
    const list = (uid: string | null) => {
      const db = uid ? env.authenticatedContext(uid).firestore() : env.unauthenticatedContext().firestore();
      return getDocs(collection(db, "users", OWNER, "checkins"));
    };

    it("the owner can get and list their check-ins", async () => {
      await assertSucceeds(getDoc(ref(OWNER)));
      await assertSucceeds(list(OWNER));
    });

    it("another user and no auth cannot get or list them; no collection-group read", async () => {
      await assertFails(getDoc(ref(OTHER)));
      await assertFails(list(OTHER));
      await assertFails(getDoc(ref(null)));
      await assertFails(list(null));
      await assertFails(getDocs(collectionGroup(env.authenticatedContext(OTHER).firestore(), "checkins")));
    });

    it("no client write: the owner cannot create, update or delete", async () => {
      await assertFails(setDoc(ref(OWNER, "2026-W43"), { checkinId: "2026-W43", answers: { overall: "no_change" } }));
      await assertFails(updateDoc(ref(OWNER), { answers: { overall: "much_better" } }));
      await assertFails(setDoc(ref(OWNER), { checkinId: "2026-W42", answers: { overall: "much_better" } }));
      await assertFails(deleteDoc(ref(OWNER)));
      await assertFails(setDoc(ref(OTHER, "2026-W44"), { checkinId: "2026-W44" }));
    });
  });
});
