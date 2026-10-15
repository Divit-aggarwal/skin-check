// Lane mm/a seed (docs/lanes/mm-a.md): users for screens 09-12 with 0, 1 and
// 4 checks. Named seed-lane-* so scripts/local-stack.sh runs it after the base
// seed (its glob is scripts/seed-lane-*.ts). Modelled on seed-lane-dashboard.ts
// and seed-lane-mesh.ts. Emulators, a "demo-" project and the local S3
// stand-in only. Scores are synthetic; the kept photo is the engine's test face.
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
import { CATALOG_VERSION } from "@/lib/catalog/catalogue";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";
import { FACE_DARK, MESH_ANSWERS } from "../tests/browser/seed-mesh";
import { MMA_SEED } from "../tests/browser/seed-mm-a";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-mm-a: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}

async function putKeptPhoto(key: string) {
  const endpoint = process.env.S3_SKIN_IMAGES_ENDPOINT;
  if (!endpoint || !/^http:\/\/127\.0\.0\.1:/.test(endpoint)) throw new Error("seed-mm-a: kept photos go to the local S3 stand-in only.");
  if (!existsSync(FACE_DARK)) throw new Error(`seed-mm-a: no test face at ${FACE_DARK}`);
  const s3 = new S3Client({ region: "ap-south-1", endpoint, forcePathStyle: true, credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" } });
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_SKIN_IMAGES_BUCKET ?? "skin-originals-dev", Key: key, Body: readFileSync(FACE_DARK), ContentType: "image/png" }));
}

const ledgerEntry = (purpose: string, version: string, copy: string, source: string) => ({
  schemaVersion: 1, purpose, granted: true, version, copySha256: sha256(copy), scanId: null, source, recordedAt: Timestamp.now(),
});

// Synthetic concern scores per check, so the level words differ between checks.
const SCORES = [
  { redness: 0.5, oiliness: 0.3, texture: 0.15, pores: 0, blemishes: 0.5, hydration: 0.6, pigment: 0.3 },
  { redness: 0.3, oiliness: 0.3, texture: 0.3, pores: 0, blemishes: 0.3, hydration: 0.6, pigment: 0.3 },
  { redness: 0.3, oiliness: 0.5, texture: 0.15, pores: 0, blemishes: 0.3, hydration: 0.6, pigment: 0.15 },
  { redness: 0.15, oiliness: 0.3, texture: 0.3, pores: 0, blemishes: 0.15, hydration: 0.6, pigment: 0.3 },
];

async function main() {
  const app = initializeApp({ projectId: PROJECT }, "seed-mm-a");
  const auth = getAuth(app);
  const db = getFirestore(app);
  for (const user of Object.values(MMA_SEED)) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    await db.recursiveDelete(db.collection("users").doc(user.uid));
    await auth.createUser({ uid: user.uid, phoneNumber: user.phoneNumber });
    const userRef = db.collection("users").doc(user.uid);
    await userRef.set({ phoneNumber: user.phoneNumber, lastSeenAt: Timestamp.now() });
    await userRef.collection("consentLedger").doc("seed-age").set(ledgerEntry("age_18_plus", AGE_ATTESTATION_VERSION, AGE_ATTESTATION_COPY, "attestation_route"));
    await userRef.collection("consentLedger").doc("seed-ai-share").set(ledgerEntry("ai_share", AI_SHARE_CONSENT_VERSION, AI_SHARE_CONSENT_COPY, "consent_route"));

    if (user.routine) {
      const day = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - n * 86_400_000));
      const event = (id: string, e: Record<string, unknown>) =>
        userRef.collection("routineEvents").doc(id).set({ eventId: id, timeZone: "Asia/Kolkata", schemaVersion: 1, catalogVersion: CATALOG_VERSION, recordedAt: Timestamp.now(), source: "user", ...e });
      const all = [0, 1, 2, 3, 4, 5, 6];
      await event("00000000-0000-4000-8000-000000004301", { type: "start", productId: "refreshing-cleanser", effectiveDate: day(30), schedule: { slot: "AM", days: all } });
      await event("00000000-0000-4000-8000-000000004302", { type: "start", productId: "calming-moisturiser", effectiveDate: day(30), schedule: { slot: "PM", days: all } });
      let k = 0;
      for (const n of [1, 2, 3, 5, 6])
        await event(`00000000-0000-4000-8000-0000000043${String(10 + k++)}`, { type: "usage", productId: "refreshing-cleanser", slot: "AM", status: "used", effectiveDate: day(n) });
    }

    for (let i = 0; i < user.checksDaysAgo.length; i++) {
      const scanId = `${user.uid}-${i + 1}`;
      const createdAt = Timestamp.fromMillis(Date.now() - user.checksDaysAgo[i]! * 86_400_000);
      const scores = SCORES[(SCORES.length - user.checksDaysAgo.length + i) % SCORES.length]!;
      await userRef.collection("skinChecks").doc(scanId).set({
        schemaVersion: 1,
        scanId,
        answers: MESH_ANSWERS,
        questionnaire: "answered",
        questionnaireVersion: 2,
        status: "completed",
        image: { stored: true, captureMethod: "native" },
        consent: { imageRetention: true },
        result: null,
        createdAt,
      });
      await putKeptPhoto(scanImageKey(user.uid, scanId));
      const result = {
        ...syntheticAnalysis(),
        ...syntheticNative(),
        scores,
        region_scores: Object.fromEntries(["forehead", "cheeks", "nose", "chin"].map((r) => [r, scores])),
        pipeline_version: "scan-0.1.6-provisional",
        engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec",
      } as unknown as SkinScanResult;
      const inputSha256 = createHash("sha256").update(scanId).digest("hex");
      const record = buildScanAnalysisRecord(result, { scanId, inputSha256, requestId: `seed-${scanId}`, captureMethod: "native" });
      await userRef.collection("scanAnalyses").doc(scanAnalysisDocId(scanId, inputSha256)).set({
        ...record,
        captureQuality: { schemaVersion: 1, producer: "capture-quality-web", producerVersion: "cq-1", assertedBy: "client", verdict: "pass" },
        createdAt,
      });
    }
  }
}

main().then(
  () => console.log(`seed-mm-a: ${Object.keys(MMA_SEED).length} users (project ${PROJECT}).`),
  (err) => {
    console.error("seed-mm-a failed:", (err as Error)?.message);
    process.exit(1);
  }
);
