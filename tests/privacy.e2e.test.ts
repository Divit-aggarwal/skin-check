// Privacy lane end to end against the local stack (npm run test:local).
// Skipped unless scripts/local-stack.sh started the stack and set
// LOCAL_STACK_WEB. Uses the erase-only seed users from
// scripts/seed-lane-privacy.ts, never Asha or Ravi, so test-file order
// doesn't matter.
import { describe, expect, it } from "vitest";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";
import { emulatorPhoneSignIn } from "./e2e-auth";

const WEB = process.env.LOCAL_STACK_WEB;
const PROJECT = process.env.FIREBASE_PROJECT_ID;

const A = { uid: "seed-privacy-erase", phoneNumber: "+919999900101" };
// B's uid starts with A's: proves the trailing slash in userPrefix.
const B = { uid: "seed-privacy-erase-2", phoneNumber: "+919999900102" };

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
    // TD-33 (2): typed product names, on a check and on a later-answers record,
    // before the erase. Written with the Admin SDK (A's seed has an under-18
    // answer); tests/firestore-rules-questionnaire.test.ts covers the client path.
    const CANARY = "ZZERASECANARYZZ Tretinoin";
    const userRef = db.collection("users").doc(A.uid);
    await userRef.collection("skinChecks").doc("erase-names-check").set({ answers: { current_products: ["prescription", "other_products"] }, questionnaire: "answered", productNames: { prescription: CANARY, other: CANARY } });
    await userRef.collection("skinChecks").doc("erase-names-skipped").set({ answers: { gender: "female" }, questionnaire: "skipped" });
    await userRef.collection("laterAnswers").doc("erase-names-skipped").set({ scanId: "erase-names-skipped", answers: { current_products: ["prescription"] }, productNames: { prescription: CANARY } });
    const namesLeft = async () =>
      (await Promise.all([db.collectionGroup("skinChecks").get(), db.collectionGroup("laterAnswers").get()]))
        .flatMap((q) => q.docs)
        .filter((d) => JSON.stringify(d.data()).includes(CANARY)).length;
    expect(await namesLeft()).toBe(2); // the check and the later-answers record
    // TD-47: A's city and permission choices and a push subscription, before the erase.
    await userRef.collection("settings").doc("home").set({ location: "allowed", reminders: "allowed", city: { name: "ZZCITYZZ", region: "", country: "India", latE1: 130, lonE1: 776, source: "device" } });
    await userRef.collection("pushSubscriptions").doc("erase-sub").set({ endpoint: "https://fcm.googleapis.com/fcm/send/zzerase", timeZone: "Asia/Kolkata" });
    const homeLeft = async () =>
      (await Promise.all([db.collectionGroup("settings").get(), db.collectionGroup("pushSubscriptions").get()])).flatMap((q) => q.docs).filter((d) => d.ref.path.startsWith(`users/${A.uid}/`)).length;
    expect(await homeLeft()).toBe(2);
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
    expect(await res.json()).toEqual({ ok: true, steps: { mark: "done", revoke: "done", s3: "done", firestore: "done", auth: "done" } });

    // A is gone from every place.
    expect(await objects(A.uid)).toBe(0);
    expect(await tree(A.uid)).toEqual({ exists: false, collections: [] });
    await expect(auth.getUser(A.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
    expect((await under18(A.uid)).size).toBe(0);
    expect((await chatTurns()).size).toBe(0);
    // TD-33 (2): no product name is left anywhere in the database.
    expect((await userRef.collection("laterAnswers").get()).size).toBe(0);
    expect(await namesLeft()).toBe(0);
    // TD-47: the city, both choices and the push subscription are gone.
    expect(await homeLeft()).toBe(0);

    // A's old token no longer opens a server route.
    const presign = await fetch(`${WEB}/api/skin-scan/upload`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ scanId: "privacy-after-erase", contentLength: 1000, imageRetentionConsent: true, imageRetentionConsentVersion: "skin image retention version 2" }),
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

// H04 + H21 (TD-19): after an erase, a late photo upload with a link issued
// before the delete, a late server write and a client write with the old
// token leave nothing behind once the sweep has run.
describe.skipIf(!WEB)("privacy: nothing written after an erase stays", () => {
  const C = { uid: "seed-privacy-late", phoneNumber: "+919999900104" };
  const FS = process.env.FIRESTORE_EMULATOR_HOST;
  // A client create with a server timestamp, as the app writes it (rules require createdAt == request.time).
  const clientWrite = (idToken: string, docId: string) =>
    fetch(`http://${FS}/v1/projects/${PROJECT}/databases/(default)/documents:commit`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        writes: [
          {
            update: { name: `projects/${PROJECT}/databases/(default)/documents/users/${C.uid}/skinChecks/${docId}`, fields: { scanId: { stringValue: docId }, status: { stringValue: "questionnaire_only" } } },
            updateTransforms: [{ fieldPath: "createdAt", setToServerValue: "REQUEST_TIME" }],
            currentDocument: { exists: false },
          },
        ],
      }),
    });

  it("a late upload, a late server write and a client write with the old token are all gone after the sweep", async () => {
    const { initializeApp } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = initializeApp({ projectId: PROJECT! }, `privacy-late-${Date.now()}`);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const s3 = new S3Client({
      region: "ap-south-1",
      endpoint: process.env.S3_SKIN_IMAGES_ENDPOINT!,
      forcePathStyle: true,
      credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" },
    });
    const objects = async () =>
      (await s3.send(new ListObjectsV2Command({ Bucket: "skin-originals-dev", Prefix: `users/${C.uid}/` }))).KeyCount ?? 0;
    const tree = async () => {
      const ref = db.collection("users").doc(C.uid);
      const [doc, subs] = await Promise.all([ref.get(), ref.listCollections()]);
      return { exists: doc.exists, collections: subs.map((c) => c.id).sort() };
    };
    const marker = () => db.collection("erasedAccounts").doc(C.uid).get();

    const { idToken } = await emulatorPhoneSignIn(C.phoneNumber);
    const bearer = { authorization: `Bearer ${idToken}`, "content-type": "application/json" };

    // Control: before the erase, this token can write.
    expect((await clientWrite(idToken, "late-before-0001")).status).toBe(200);

    // An upload link issued BEFORE the delete.
    const photo = Buffer.from("late photo bytes");
    const presign = await fetch(`${WEB}/api/skin-scan/upload`, {
      method: "POST",
      headers: bearer,
      body: JSON.stringify({ scanId: "late-scan-000001", contentLength: photo.length, imageRetentionConsent: true, imageRetentionConsentVersion: "skin image retention version 2" }),
    });
    expect(presign.status).toBe(200);
    const { uploadUrl, contentType } = (await presign.json()) as { uploadUrl: string; contentType: string };

    const erased = await fetch(`${WEB}/api/account/erase`, { method: "POST", headers: bearer, body: JSON.stringify({ confirm: "DELETE MY DATA" }) });
    expect(erased.status).toBe(200);
    expect(await objects()).toBe(0);
    expect(await tree()).toEqual({ exists: false, collections: [] });
    expect((await marker()).exists).toBe(true);

    // Late arrivals. Each is shown to land (or be refused) before the sweep.
    expect((await fetch(uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: photo })).status).toBe(200);
    expect(await objects()).toBe(1);
    // A scan request that passed verification before the revoke and writes when it finishes.
    await db.collection("users").doc(C.uid).collection("scanAnalyses").doc("inflight_seed").set({ scanId: "late-scan-000001", source: "server" });
    expect((await tree()).collections).toEqual(["scanAnalyses"]);
    // The old ID token: Firestore does not check revocation, the marker refuses it.
    expect((await clientWrite(idToken, "late-after-00001")).status).toBe(403);

    // Not swept before the delay; then the sweep (the stack's delay is 2 s).
    const sweep = () => fetch(`${WEB}/api/account/erase/sweep`, { headers: { authorization: "Bearer local-dev-cron-secret" } });
    expect((await fetch(`${WEB}/api/account/erase/sweep`, { headers: { authorization: "Bearer wrong" } })).status).toBe(401);
    await new Promise((r) => setTimeout(r, 2_500));
    const swept = await sweep();
    expect(swept.status).toBe(200);
    expect(await swept.json()).toMatchObject({ ok: true, failed: 0 });

    expect(await objects()).toBe(0);
    expect(await tree()).toEqual({ exists: false, collections: [] });
    expect((await marker()).exists).toBe(false);
    await expect(auth.getUser(C.uid)).rejects.toMatchObject({ code: "auth/user-not-found" });
  }, 120_000);
});
