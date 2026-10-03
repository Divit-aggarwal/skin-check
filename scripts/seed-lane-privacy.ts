// Privacy lane seed (docs/lanes/privacy-design.md §3.2). Run by
// scripts/local-stack.sh after seed-local.ts, on every start.
//
// - Consent-ledger entries for the base seed users (Asha, Ravi): 18+ and the
//   AI-share grant, so Echo works locally once the chat gates are on.
// - One under-18 user, to show the sticky block.
// - Two erase-only users. The second uid starts with the first, which proves
//   that erasing one never touches the other's S3 prefix.
//
// Same refusal as seed-local.ts: emulators and a "demo-" project only.
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION, AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { sha256 } from "@/app/api/account/_ledger";
import { scanImageKey } from "@/lib/s3-key";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
const S3_ENDPOINT = process.env.S3_SKIN_IMAGES_ENDPOINT ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-") || !/^http:\/\/127\.0\.0\.1:/.test(S3_ENDPOINT)) {
  console.error("seed-lane-privacy: refusing to run outside the emulators, a demo- project and a local S3Mock.");
  process.exit(1);
}

const PRIVACY_SEED = {
  eraseA: { uid: "seed-privacy-erase", phoneNumber: "+919999900101" },
  eraseB: { uid: "seed-privacy-erase-2", phoneNumber: "+919999900102" },
  minor: { uid: "seed-privacy-minor", phoneNumber: "+919999900103" },
};
const ATTESTED = ["seed-user-asha", "seed-user-ravi", PRIVACY_SEED.eraseA.uid, PRIVACY_SEED.eraseB.uid];

const app = initializeApp({ projectId: PROJECT }, "seed-privacy");
const auth = getAuth(app);
const db = getFirestore(app);
const s3 = new S3Client({
  region: process.env.S3_SKIN_IMAGES_REGION ?? "ap-south-1",
  endpoint: S3_ENDPOINT,
  forcePathStyle: true,
  credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" },
});
const BUCKET = process.env.S3_SKIN_IMAGES_BUCKET ?? "skin-originals-dev";

const entry = (purpose: string, granted: boolean, version: string, copy: string, source: string) => ({
  schemaVersion: 1,
  purpose,
  granted,
  version,
  copySha256: sha256(copy),
  scanId: null,
  source,
  recordedAt: Timestamp.now(),
});

async function main() {
  for (const user of Object.values(PRIVACY_SEED)) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    await auth.createUser(user);
    await db.collection("users").doc(user.uid).set({ phoneNumber: user.phoneNumber, lastSeenAt: Timestamp.now() });
  }

  for (const uid of ATTESTED) {
    const ledger = db.collection("users").doc(uid).collection("consentLedger");
    await ledger.add(entry("age_18_plus", true, AGE_ATTESTATION_VERSION, AGE_ATTESTATION_COPY, "attestation_route"));
    await ledger.add(entry("ai_share", true, AI_SHARE_CONSENT_VERSION, AI_SHARE_CONSENT_COPY, "consent_route"));
  }
  await db
    .collection("users")
    .doc(PRIVACY_SEED.minor.uid)
    .collection("consentLedger")
    .add(entry("age_18_plus", false, AGE_ATTESTATION_VERSION, AGE_ATTESTATION_COPY, "attestation_route"));

  // Something in every place erasure must clear, for both erase users.
  for (const { uid } of [PRIVACY_SEED.eraseA, PRIVACY_SEED.eraseB]) {
    const userRef = db.collection("users").doc(uid);
    for (const scanId of ["privacy-scan-1", "privacy-scan-2"]) {
      await userRef.collection("skinChecks").doc(scanId).set({
        schemaVersion: 1,
        answers: { name: "Erase", age: "25-34", phone_verify: "verified" },
        status: "completed",
        image: { stored: true, captureMethod: "native", storage: "s3", key: scanImageKey(uid, scanId) },
        createdAt: Timestamp.now(),
      });
      await userRef.collection("scanAnalyses").doc(`${scanId}_seed`).set({ scanId, source: "server", createdAt: Timestamp.now() });
      await s3.send(
        new PutObjectCommand({ Bucket: BUCKET, Key: scanImageKey(uid, scanId), Body: "seed", ContentType: "image/jpeg" })
      );
    }
  }
}

main().then(
  () => console.log(`seed-lane-privacy: ledger for ${ATTESTED.length} users, 1 under-18 user, 2 erase users (project ${PROJECT}).`),
  (err) => {
    console.error("seed-lane-privacy failed:", (err as Error)?.message);
    process.exit(1);
  }
);
