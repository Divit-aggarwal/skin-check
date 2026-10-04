// Privacy lane end to end against the local stack (npm run test:local).
// Skipped unless scripts/local-stack.sh started the stack and set
// LOCAL_STACK_WEB. Uses the erase-only seed users from
// scripts/seed-lane-privacy.ts, never Asha or Ravi, so test-file order
// doesn't matter.
import { describe, expect, it } from "vitest";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const WEB = process.env.LOCAL_STACK_WEB;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = process.env.FIREBASE_PROJECT_ID;

const A = { uid: "seed-privacy-erase", phoneNumber: "+919999900101" };
// B's uid starts with A's: proves the trailing slash in userPrefix.
const B = { uid: "seed-privacy-erase-2", phoneNumber: "+919999900102" };

// Phone sign-in through the Auth emulator's REST API: a fresh auth_time, as
// the erase route requires.
async function emulatorPhoneSignIn(phoneNumber: string): Promise<{ idToken: string; localId: string }> {
  const idp = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
  const sent = await fetch(`${idp}/accounts:sendVerificationCode?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ phoneNumber, recaptchaToken: "emulator" }),
  }).then((r) => r.json() as Promise<{ sessionInfo: string }>);
  const codes = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/verificationCodes`).then(
    (r) => r.json() as Promise<{ verificationCodes: { sessionInfo: string; code: string }[] }>
  );
  const code = codes.verificationCodes.find((c) => c.sessionInfo === sent.sessionInfo)!.code;
  return fetch(`${idp}/accounts:signInWithPhoneNumber?key=demo-api-key`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionInfo: sent.sessionInfo, code }),
  }).then((r) => r.json() as Promise<{ idToken: string; localId: string }>);
}

describe.skipIf(!WEB)("privacy: erasure end to end", () => {
  it("erases A from S3Mock, Firestore and Auth, and leaves B untouched", async () => {
    const { initializeApp } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = initializeApp({ projectId: PROJECT! }, `privacy-e2e-${Date.now()}`);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const s3 = new S3Client({
      region: "ap-south-1",
      endpoint: process.env.S3_SKIN_IMAGES_ENDPOINT!,
      forcePathStyle: true,
      credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" },
    });
    const objects = async (uid: string) =>
      (await s3.send(new ListObjectsV2Command({ Bucket: "skin-originals-dev", Prefix: `users/${uid}/` }))).KeyCount ?? 0;
    const tree = async (uid: string) => {
      const ref = db.collection("users").doc(uid);
      const [doc, subs] = await Promise.all([ref.get(), ref.listCollections()]);
      return { exists: doc.exists, collections: subs.map((c) => c.id).sort() };
    };

    // Before: both seeded everywhere.
    expect(await objects(A.uid)).toBe(2);
    expect(await objects(B.uid)).toBe(2);
    const bBefore = await tree(B.uid);
    expect(bBefore).toEqual({ exists: true, collections: ["consentLedger", "routineEvents", "scanAnalyses", "skinChecks"] });
    expect((await db.collection("users").doc(A.uid).collection("routineEvents").get()).size).toBe(1);
    // Wave-2 wiring 7: A has one stored chat turn (D-15) before the erase.
    const chatTurns = () => db.collection("users").doc(A.uid).collection("chatTurns").get();
    expect((await chatTurns()).size).toBe(1);
    const under18 = (uid: string) =>
      db.collection("users").doc(uid).collection("consentLedger").where("purpose", "==", "age_18_plus").where("granted", "==", false).get();
    expect((await under18(A.uid)).size).toBe(1);

    const signedIn = await emulatorPhoneSignIn(A.phoneNumber);
    expect(signedIn.localId).toBe(A.uid);
    const bearer = { authorization: `Bearer ${signedIn.idToken}`, "content-type": "application/json" };

    const res = await fetch(`${WEB}/api/account/erase`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ confirm: "DELETE MY DATA" }),
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, steps: { revoke: "done", s3: "done", firestore: "done", auth: "done" } });

    // A is gone from every place.
    expect(await objects(A.uid)).toBe(0);
    expect(await tree(A.uid)).toEqual({ exists: false, collections: [] });
    await expect(auth.getUser(A.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect((await under18(A.uid)).size).toBe(0);
    expect((await chatTurns()).size).toBe(0);

    // A's old token no longer opens a server route.
    const presign = await fetch(`${WEB}/api/skin-scan/upload`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ scanId: "privacy-after-erase", imageRetentionConsent: true, imageRetentionConsentVersion: "skin image retention version 1" }),
    });
    expect(presign.status).toBe(401);

    // B is untouched.
    expect(await objects(B.uid)).toBe(2);
    expect(await tree(B.uid)).toEqual(bBefore);
    expect((await auth.getUser(B.uid)).uid).toBe(B.uid);

    // Decision 9(b): a receipt with no uid.
    const receipts = await db.collection("erasures").get();
    expect(receipts.size).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(receipts.docs.map((d) => d.data()))).not.toContain(A.uid);
  }, 120_000);
});
