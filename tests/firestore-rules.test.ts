import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Runs only inside the Firestore emulator:
//   npm run test:rules
// Skipped otherwise so `npm test` stays a plain unit run.
const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST;

describe.skipIf(!EMULATOR)("firestore.rules — skinChecks image metadata", () => {
  let env: RulesTestEnvironment;
  const OWNER = "owner-uid";
  const VICTIM = "victim-uid";
  const SCAN = "0f8fad5b-d9cb-469f-a165-70867728950e";

  const CONSENT_VERSION = "skin image retention version 1";
  const consented = {
    imageRetention: true,
    imageRetentionVersion: CONSENT_VERSION,
    imageRetentionConsentedAt: new Date(),
  };

  const base = {
    schemaVersion: 1,
    scanId: SCAN,
    answers: {},
    status: "completed",
    result: null,
    createdAt: serverTimestamp(),
  };

  beforeAll(async () => {
    const [host, port] = EMULATOR!.split(":");
    env = await initializeTestEnvironment({
      projectId: "demo-rules-check",
      firestore: { rules: readFileSync("firestore.rules", "utf8"), host: host!, port: Number(port) },
    });
  });

  afterAll(async () => env?.cleanup());

  const write = (uid: string, scanId: string, image: unknown, consent: unknown = consented) => {
    const db = env.authenticatedContext(uid).firestore();
    return setDoc(doc(db, "users", OWNER, "skinChecks", scanId), { ...base, scanId, image, consent });
  };

  const storedImage = (uid: string, scanId: string) => ({
    stored: true,
    captureMethod: "native",
    storage: "s3",
    key: `users/${uid}/scans/${scanId}/original.jpg`,
  });

  it("allows a record with no image (questionnaire only)", async () => {
    await assertSucceeds(write(OWNER, "scan-no-image-0001", null, { imageRetention: false }));
  });

  it("allows stored: false with no retention consent — analysis without storage", async () => {
    await assertSucceeds(
      write(OWNER, "scan-not-stored-01", { stored: false, captureMethod: "canvas" }, { imageRetention: false })
    );
  });

  it("allows stored: true with this user's own key and current consent", async () => {
    await assertSucceeds(write(OWNER, SCAN, storedImage(OWNER, SCAN)));
  });

  it("REJECTS a key claiming another user's S3 object", async () => {
    await assertFails(
      write(OWNER, "scan-cross-user-1", {
        stored: true,
        captureMethod: "native",
        storage: "s3",
        key: `users/${VICTIM}/scans/scan-cross-user-1/original.jpg`,
      })
    );
  });

  it("REJECTS a key for a different scan of this same user", async () => {
    await assertFails(
      write(OWNER, "scan-wrong-scan-1", {
        stored: true,
        captureMethod: "native",
        storage: "s3",
        key: `users/${OWNER}/scans/some-other-scan/original.jpg`,
      })
    );
  });

  it("REJECTS stored: true with no key at all", async () => {
    await assertFails(write(OWNER, "scan-no-key-0001", { stored: true, captureMethod: "native", storage: "s3" }));
  });

  it("still refuses writes into another user's subtree", async () => {
    const db = env.authenticatedContext(VICTIM).firestore();
    await assertFails(
      setDoc(doc(db, "users", OWNER, "skinChecks", "scan-other-user1"), {
        ...base, image: null, consent: { imageRetention: false },
      })
    );
  });

  it("still refuses updates to an existing record", async () => {
    await assertSucceeds(write(OWNER, "scan-append-only1", null, { imageRetention: false }));
    await assertFails(write(OWNER, "scan-append-only1", null, { imageRetention: false }));
  });

  it("REJECTS stored: true with NO consent block at all", async () => {
    await assertFails(write(OWNER, "scan-consent-none1", storedImage(OWNER, "scan-consent-none1"), null));
  });

  it("REJECTS stored: true with imageRetention: false", async () => {
    await assertFails(
      write(OWNER, "scan-consent-false", storedImage(OWNER, "scan-consent-false"), { imageRetention: false })
    );
  });

  it("REJECTS stored: true with a superseded consent version", async () => {
    await assertFails(
      write(OWNER, "scan-consent-oldv1", storedImage(OWNER, "scan-consent-oldv1"), {
        imageRetention: true,
        imageRetentionVersion: "skin image retention version 0",
        imageRetentionConsentedAt: new Date(),
      })
    );
  });

  it("REJECTS stored: true with consent but no version", async () => {
    await assertFails(
      write(OWNER, "scan-consent-nover", storedImage(OWNER, "scan-consent-nover"), { imageRetention: true })
    );
  });

  it("persists the consent metadata it accepted", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(write(OWNER, "scan-consent-read1", storedImage(OWNER, "scan-consent-read1")));
    const snap = await getDoc(doc(db, "users", OWNER, "skinChecks", "scan-consent-read1"));
    expect(snap.data()?.consent).toMatchObject({
      imageRetention: true,
      imageRetentionVersion: CONSENT_VERSION,
    });
    expect(snap.data()?.consent?.imageRetentionConsentedAt).toBeTruthy();
  });

  it("uses the same version string the application code uses", async () => {
    const { IMAGE_RETENTION_CONSENT_VERSION } = await import("@/lib/consent");
    expect(IMAGE_RETENTION_CONSENT_VERSION).toBe(CONSENT_VERSION);
  });

  it("guards the exact key format the app writes", async () => {
    const { scanImageKey } = await import("@/lib/s3-key");
    expect(scanImageKey(OWNER, SCAN)).toBe(`users/${OWNER}/scans/${SCAN}/original.jpg`);
  });

  // ── The READ path (lib/firebase/skin-checks.ts listSkinChecks) ───────────
  // Every test above covers writes. `listSkinChecks` added a read, and its
  // whole ownership guarantee is these rules — there is deliberately no
  // client-side uid filter to fall back on, so if `list` were ever loosened
  // nothing else in the codebase would catch it.
  it("lets a user list their OWN scans — the /account previous-scans query", async () => {
    await assertSucceeds(write(OWNER, "scan-read-own-001", null, { imageRetention: false }));
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDocs(collection(db, "users", OWNER, "skinChecks")));
  });

  it("REFUSES to list another user's scans", async () => {
    const db = env.authenticatedContext(VICTIM).firestore();
    await assertFails(getDocs(collection(db, "users", OWNER, "skinChecks")));
  });

  // The repeat-scan shortcut (lib/firebase/skin-checks.ts latestSkinCheckAnswers)
  // reads the newest scan with orderBy + limit. Same ownership guarantee as
  // the list above, checked for the exact query shape the app sends.
  it("lets a user read their OWN latest scan — the repeat-scan answers query", async () => {
    await assertSucceeds(write(OWNER, "scan-latest-own-01", null, { imageRetention: false }));
    const db = env.authenticatedContext(OWNER).firestore();
    const latest = query(collection(db, "users", OWNER, "skinChecks"), orderBy("createdAt", "desc"), limit(1));
    await assertSucceeds(getDocs(latest));
  });

  it("REFUSES another user's latest scan", async () => {
    const db = env.authenticatedContext(VICTIM).firestore();
    const latest = query(collection(db, "users", OWNER, "skinChecks"), orderBy("createdAt", "desc"), limit(1));
    await assertFails(getDocs(latest));
  });

  it("REFUSES to list scans when signed out", async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, "users", OWNER, "skinChecks")));
  });

  // ── C2: scanAnalyses is server-written only (Admin SDK bypasses rules) ───
  const ANALYSIS = "scan-analysis-01_0123456789abcdef";

  it("REFUSES a client create of the owner's own scanAnalyses doc", async () => {
    const db = env.authenticatedContext(OWNER).firestore();
    await assertFails(setDoc(doc(db, "users", OWNER, "scanAnalyses", ANALYSIS), { schemaVersion: 1, source: "server" }));
  });

  it("REFUSES a client write into another user's scanAnalyses", async () => {
    const db = env.authenticatedContext(VICTIM).firestore();
    await assertFails(setDoc(doc(db, "users", OWNER, "scanAnalyses", ANALYSIS), { schemaVersion: 1 }));
  });

  it("lets the owner read their own scanAnalyses", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", OWNER, "scanAnalyses", ANALYSIS), { schemaVersion: 1, source: "server" });
    });
    const db = env.authenticatedContext(OWNER).firestore();
    await assertSucceeds(getDoc(doc(db, "users", OWNER, "scanAnalyses", ANALYSIS)));
    await assertSucceeds(getDocs(collection(db, "users", OWNER, "scanAnalyses")));
  });

  it("REFUSES another user (or signed-out) reading scanAnalyses", async () => {
    await assertFails(getDocs(collection(env.authenticatedContext(VICTIM).firestore(), "users", OWNER, "scanAnalyses")));
    await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), "users", OWNER, "scanAnalyses")));
  });
});
