// Longitudinal lane seed: one synthetic series of scanAnalyses for the local
// emulator under seed-user-longitudinal. A leading 0.1.5 record with no
// engine build, four 0.1.6 records on build A, then one on build B (an
// engine boundary). No real faces; all values synthetic. Run by
// scripts/local-stack.sh after the base seed; read by
// tests/longitudinal-series.e2e.test.ts.
//
// Refuses to run unless both emulators are set and the project is a "demo-"
// project, so it can never write to real Firebase.
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { toSkinState2 } from "@/lib/skin-state-2";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-lane-longitudinal: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}

const LONGITUDINAL_SEED_UID = "seed-user-longitudinal";
const A = "sha-8dc37dc501ea974825427c665acd7019120c20ec";
const B = "sha-seedbuildb000000000000000000000000000000";
const v016 = (build: string) => ({ ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: build });

const SERIES: { scanId: string; daysAgo: number; result: Record<string, unknown> }[] = [
  { scanId: "seed-long-0", daysAgo: 40, result: { ...syntheticAnalysis(), ...syntheticNative() } }, // 0.1.5, no build
  { scanId: "seed-long-1", daysAgo: 30, result: v016(A) },
  { scanId: "seed-long-2", daysAgo: 25, result: v016(A) },
  { scanId: "seed-long-3", daysAgo: 20, result: v016(A) },
  { scanId: "seed-long-4", daysAgo: 10, result: v016(A) },
  { scanId: "seed-long-5", daysAgo: 5, result: v016(B) },
];

async function main() {
  const db = getFirestore(initializeApp({ projectId: PROJECT }, "seed-lane-longitudinal"));
  for (const s of SERIES) {
    const inputSha256 = createHash("sha256").update(s.scanId).digest("hex");
    const record = buildScanAnalysisRecord(s.result as unknown as SkinScanResult, {
      scanId: s.scanId, inputSha256, requestId: `seed-${s.scanId}`, captureMethod: "native",
    });
    const docId = scanAnalysisDocId(s.scanId, inputSha256);
    const data = { ...record, createdAt: Timestamp.fromMillis(Date.now() - s.daysAgo * 86_400_000) };
    const state = toSkinState2(data, `users/${LONGITUDINAL_SEED_UID}/scanAnalyses/${docId}`, LONGITUDINAL_SEED_UID);
    if (state.kind !== "skinstate") throw new Error(`${s.scanId} is not a SkinState: ${JSON.stringify(state)}`);
    await db.collection("users").doc(LONGITUDINAL_SEED_UID).collection("scanAnalyses").doc(docId).set(data);
  }
  console.log(`seed-lane-longitudinal: ${SERIES.length} scanAnalyses for ${LONGITUDINAL_SEED_UID}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
