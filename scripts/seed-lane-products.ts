// TD-34 browser test seed (tests/browser/echo-products.spec.ts). Run by
// scripts/local-stack.sh after seed-local.ts, on every start. Same refusal as
// seed-local.ts: emulators and a "demo-" project only. Every value is synthetic.
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION, AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { sha256 } from "@/app/api/account/_ledger";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";
import { allPUsers } from "../tests/browser/seed-products";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-lane-products: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}

const ledgerEntry = (purpose: string, version: string, copy: string, source: string) => ({
  schemaVersion: 1, purpose, granted: true, version, copySha256: sha256(copy), scanId: null, source, recordedAt: Timestamp.now(),
});

async function main() {
  const app = initializeApp({ projectId: PROJECT }, "seed-products");
  const auth = getAuth(app);
  const db = getFirestore(app);
  for (const user of allPUsers()) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    await auth.createUser({ uid: user.uid, phoneNumber: user.phoneNumber });
    const userRef = db.collection("users").doc(user.uid);
    // A restart starts clean: no stored opening or chat turns from an earlier run.
    await db.recursiveDelete(userRef);
    await userRef.set({ phoneNumber: user.phoneNumber, lastSeenAt: Timestamp.now() });
    const ledger = userRef.collection("consentLedger");
    await ledger.doc("seed-age").set(ledgerEntry("age_18_plus", AGE_ATTESTATION_VERSION, AGE_ATTESTATION_COPY, "attestation_route"));
    if (user.aiShare) await ledger.doc("seed-ai-share").set(ledgerEntry("ai_share", AI_SHARE_CONSENT_VERSION, AI_SHARE_CONSENT_COPY, "consent_route"));

    const scanId = `${user.uid}-1`;
    const createdAt = Timestamp.fromMillis(Date.now() - 86_400_000);
    const result = {
      ...(syntheticAnalysis() as Record<string, unknown>),
      ...syntheticNative(),
      scores: { redness: 0.6, oiliness: 0.7, texture: 0.4, pores: 0, blemishes: 0.2, hydration: 0.6, pigment: 0.3 },
      region_scores: Object.fromEntries((["forehead", "cheeks", "nose", "chin"] as const).map((r) => [r, { redness: 0.5, oiliness: 0.7, texture: 0.4, pores: 0, blemishes: 0.2, hydration: 0.6, pigment: 0.3 }])),
      region_low_confidence: { forehead: false, nose: false, chin: false, cheeks: false },
      pipeline_version: "scan-0.1.6-provisional",
      engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec",
    } as unknown as SkinScanResult;
    await userRef.collection("skinChecks").doc(scanId).set({
      schemaVersion: 1,
      scanId,
      answers: user.answers,
      questionnaire: "answered",
      status: "completed",
      image: { stored: false, captureMethod: "native" },
      consent: { imageRetention: false },
      result: { scores: result.scores, regions: result.regions, region_scores: result.region_scores, pipeline_version: "scan-0.1.4-provisional" },
      createdAt,
    });
    const inputSha256 = createHash("sha256").update(scanId).digest("hex");
    const record = buildScanAnalysisRecord(result, { scanId, inputSha256, requestId: `seed-${scanId}`, captureMethod: "native" });
    await userRef.collection("scanAnalyses").doc(scanAnalysisDocId(scanId, inputSha256)).set({ ...record, createdAt });
  }
}

main().then(
  () => console.log(`seed-lane-products: ${allPUsers().length} users (project ${PROJECT}).`),
  (err) => {
    console.error("seed-lane-products failed:", (err as Error)?.message);
    process.exit(1);
  }
);
