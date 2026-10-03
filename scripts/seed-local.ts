// Seeds the local emulators (tracker B01): two test users, three saved scans
// each, spread over the last weeks. Run by scripts/local-stack.sh on every
// start, because emulator data lives in memory.
//
// Refuses to run unless both emulators are set and the project is a "demo-"
// project, so it can never write to real Firebase.
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-local: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}

const SEED_USERS = [
  { uid: "seed-user-asha", phoneNumber: "+15555550101", displayName: "Asha (seed)" },
  { uid: "seed-user-ravi", phoneNumber: "+15555550102", displayName: "Ravi (seed)" },
];
const DAYS_AGO = [21, 9, 2];

const app = initializeApp({ projectId: PROJECT }, "seed");
const auth = getAuth(app);
const db = getFirestore(app);

async function main() {
  for (const user of SEED_USERS) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    await auth.createUser(user);
    const userRef = db.collection("users").doc(user.uid);
    await userRef.set({ phoneNumber: user.phoneNumber, lastSeenAt: Timestamp.now() });

    for (let i = 0; i < DAYS_AGO.length; i++) {
      const days = DAYS_AGO[i]!;
      const scanId = `seed-${user.uid.slice(10)}-${i + 1}`;
      const createdAt = Timestamp.fromMillis(Date.now() - days * 86_400_000);
      const base = syntheticAnalysis() as Record<string, unknown> & { scores: Record<string, number> };
      const scores = Object.fromEntries(Object.entries(base.scores).map(([k, v]) => [k, Math.round((v + 0.05 * i) * 100) / 100]));
      const result = {
        ...base,
        ...syntheticNative(),
        scores,
        pipeline_version: "scan-0.1.6-provisional",
        engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec",
      } as unknown as SkinScanResult;

      await userRef.collection("skinChecks").doc(scanId).set({
        schemaVersion: 1,
        answers: { name: user.displayName.split(" ")[0]!, age: "25-34", gender: "other", primary_concerns: ["redness", "texture"], skin_type: "combination" },
        status: "completed",
        image: { stored: false, captureMethod: "native" },
        consent: { imageRetention: false },
        result: {
          scores: result.scores,
          regions: result.regions,
          region_scores: result.region_scores,
          score_types: result.score_types,
          region_low_confidence: result.region_low_confidence,
          pipeline_version: result.pipeline_version,
        },
        createdAt,
      });

      const inputSha256 = createHash("sha256").update(scanId).digest("hex");
      const record = buildScanAnalysisRecord(result, { scanId, inputSha256, requestId: `seed-${scanId}`, captureMethod: "native" });
      await userRef.collection("scanAnalyses").doc(scanAnalysisDocId(scanId, inputSha256)).set({ ...record, createdAt });
    }
  }
}

main().then(
  () => console.log(`seed-local: ${SEED_USERS.length} users, ${DAYS_AGO.length} scans each (project ${PROJECT}).`),
  (err) => {
    console.error("seed-local failed:", (err as Error)?.message);
    process.exit(1);
  }
);
