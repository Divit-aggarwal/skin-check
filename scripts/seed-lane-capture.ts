// Capture lane seed (C02): synthetic scanAnalyses pairs for the local
// emulator, so the local stack has records that differ by pipeline version,
// by statsPath and by an absent region. No real faces; all values synthetic.
// Run by scripts/local-stack.sh after the base seed. Writes only under
// seed-user-ravi (seed-user-asha's counts are asserted by the base e2e test).
//
// Refuses to run unless both emulators are set and the project is a "demo-"
// project, so it can never write to real Firebase.
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { compareStates } from "@/lib/comparability";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { toSkinState, type SkinState } from "@/lib/skin-state";
import type { SkinScanResult } from "@/types/skin-scan";
import { regionRaw, syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-lane-capture: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}

const UID = "seed-user-ravi";
const BUILD = "sha-8dc37dc501ea974825427c665acd7019120c20ec";
const v016 = () => ({ ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: BUILD });
const withAbsentNose = () => {
  const r = v016() as unknown as Record<string, Record<string, unknown>>;
  return { ...r, region_raw_corrected: { ...r.region_raw_corrected, nose: regionRaw(0) } };
};

/** scanId → analysis fields and capture method. Pairs: (a,b) pipeline, (c,d) statsPath, (e,f) absent region. */
const CAPTURE_SEED: { scanId: string; daysAgo: number; captureMethod: "native" | "canvas"; result: Record<string, unknown> }[] = [
  { scanId: "seed-capture-a", daysAgo: 30, captureMethod: "native", result: { ...syntheticAnalysis(), ...syntheticNative() } }, // 0.1.5
  { scanId: "seed-capture-b", daysAgo: 28, captureMethod: "native", result: v016() },
  { scanId: "seed-capture-c", daysAgo: 20, captureMethod: "canvas", result: { ...syntheticAnalysis(), pipeline_version: "scan-0.1.6-provisional", engine_build: BUILD } }, // corrected only
  { scanId: "seed-capture-d", daysAgo: 18, captureMethod: "canvas", result: v016() },
  { scanId: "seed-capture-e", daysAgo: 12, captureMethod: "native", result: v016() },
  { scanId: "seed-capture-f", daysAgo: 10, captureMethod: "native", result: withAbsentNose() },
];

async function main() {
  const db = getFirestore(initializeApp({ projectId: PROJECT }, "seed-lane-capture"));
  const states: SkinState[] = [];
  for (const s of CAPTURE_SEED) {
    const inputSha256 = createHash("sha256").update(s.scanId).digest("hex");
    const record = buildScanAnalysisRecord(s.result as unknown as SkinScanResult, {
      scanId: s.scanId, inputSha256, requestId: `seed-${s.scanId}`, captureMethod: s.captureMethod,
    });
    const docId = scanAnalysisDocId(s.scanId, inputSha256);
    const data = { ...record, createdAt: Timestamp.fromMillis(Date.now() - s.daysAgo * 86_400_000) };
    // Every seeded record must be a valid skinstate-1 source, or the seed is wrong.
    const state = toSkinState(data, `users/${UID}/scanAnalyses/${docId}`, UID);
    if (state.kind !== "skinstate") throw new Error(`${s.scanId} is not a SkinState: ${JSON.stringify(state)}`);
    states.push(state.state);
    await db.collection("users").doc(UID).collection("scanAnalyses").doc(docId).set(data);
  }
  // Every pair is not comparable today (empty COMPARABLE table, engine build unmapped).
  for (let i = 0; i < states.length; i += 2) {
    const v = compareStates(states[i]!, states[i + 1]!, "colour.native.lStarMean", "nose");
    if (v.verdict !== "not_comparable") throw new Error(`pair ${i / 2} unexpectedly comparable`);
  }
}

main().then(
  () => console.log(`seed-lane-capture: ${CAPTURE_SEED.length} scanAnalyses for ${UID} (project ${PROJECT}).`),
  (err) => {
    console.error("seed-lane-capture failed:", (err as Error)?.message);
    process.exit(1);
  }
);
