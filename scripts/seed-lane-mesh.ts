// TD-37 seed (docs/design/face-mesh.md): users for the face mesh and
// two-readings browser tests. Run by scripts/local-stack.sh after the base
// seed. Emulators, a "demo-" project and the local S3 stand-in only.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION, AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { sha256 } from "@/app/api/account/_ledger";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { scanImageKey } from "@/lib/s3-key";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";
import { allMeshUsers, FACE_DARK, FACE_LIGHT, MESH_ANSWERS } from "../tests/browser/seed-mesh";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-lane-mesh: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}
async function putKeptPhoto(key: string, face: "dark" | "light") {
  const FACE = face === "light" ? FACE_LIGHT : FACE_DARK;
  const endpoint = process.env.S3_SKIN_IMAGES_ENDPOINT;
  if (!endpoint || !/^http:\/\/127\.0\.0\.1:/.test(endpoint)) throw new Error("seed-lane-mesh: kept photos go to the local S3 stand-in only.");
  if (!existsSync(FACE)) throw new Error(`seed-lane-mesh: no test face at ${FACE}`);
  const s3 = new S3Client({ region: "ap-south-1", endpoint, forcePathStyle: true, credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" } });
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_SKIN_IMAGES_BUCKET ?? "skin-originals-dev", Key: key, Body: readFileSync(FACE), ContentType: face === "light" ? "image/jpeg" : "image/png" }));
}

const ledgerEntry = (purpose: string, version: string, copy: string, source: string) => ({
  schemaVersion: 1, purpose, granted: true, version, copySha256: sha256(copy), scanId: null, source, recordedAt: Timestamp.now(),
});

async function main() {
  const app = initializeApp({ projectId: PROJECT }, "seed-mesh");
  const auth = getAuth(app);
  const db = getFirestore(app);
  for (const user of allMeshUsers()) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    await db.recursiveDelete(db.collection("users").doc(user.uid));
    await auth.createUser({ uid: user.uid, phoneNumber: user.phoneNumber });
    const userRef = db.collection("users").doc(user.uid);
    await userRef.set({ phoneNumber: user.phoneNumber, lastSeenAt: Timestamp.now() });
    await userRef.collection("consentLedger").doc("seed-age").set(ledgerEntry("age_18_plus", AGE_ATTESTATION_VERSION, AGE_ATTESTATION_COPY, "attestation_route"));
    await userRef.collection("consentLedger").doc("seed-ai-share").set(ledgerEntry("ai_share", AI_SHARE_CONSENT_VERSION, AI_SHARE_CONSENT_COPY, "consent_route"));

    const scanId = `${user.uid}-1`;
    const createdAt = Timestamp.fromMillis(Date.now() - 86_400_000);
    const skipped = user.check === "skipped";
    await userRef.collection("skinChecks").doc(scanId).set({
      schemaVersion: 1,
      scanId,
      answers: skipped ? { name: "Seed", age: "25-34", gender: "male" } : MESH_ANSWERS,
      questionnaire: skipped ? "skipped" : "answered",
      questionnaireVersion: 2,
      status: "completed",
      image: { stored: user.kept, captureMethod: "native" },
      consent: { imageRetention: user.kept },
      result: null,
      createdAt,
    });
    if (user.kept) await putKeptPhoto(scanImageKey(user.uid, scanId), user.face ?? "dark");
    // The three hidden scores are high on purpose: a leak would show as Elevated.
    const result = {
      ...syntheticAnalysis(),
      ...syntheticNative(),
      scores: { redness: 0.5, oiliness: 0.3, texture: 0.9, pores: 0, blemishes: 0.9, hydration: 0.5, pigment: 0.9 },
      region_scores: Object.fromEntries(["forehead", "cheeks", "nose", "chin"].map((r) => [r, { redness: 0.5, oiliness: 0.3, texture: 0.9, pores: 0, blemishes: 0.9, hydration: 0.5, pigment: 0.9 }])),
      pipeline_version: "scan-0.1.6-provisional",
      engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec",
    } as unknown as SkinScanResult;
    const inputSha256 = createHash("sha256").update(scanId).digest("hex");
    const record = buildScanAnalysisRecord(result, { scanId, inputSha256, requestId: `seed-${scanId}`, captureMethod: "native" });
    await userRef.collection("scanAnalyses").doc(scanAnalysisDocId(scanId, inputSha256)).set({ ...record, createdAt });
  }
}

main().then(
  () => console.log(`seed-lane-mesh: ${allMeshUsers().length} users (project ${PROJECT}).`),
  (err) => {
    console.error("seed-lane-mesh failed:", (err as Error)?.message);
    process.exit(1);
  }
);
