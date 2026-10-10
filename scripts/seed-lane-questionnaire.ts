// TD-33 seed (docs/design/optional-questionnaire.md): users for the optional
// questionnaire, product-name and capture browser tests. Run by
// scripts/local-stack.sh after the base seed. Emulators and a "demo-" project
// only; every value is synthetic.
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION, AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { sha256 } from "@/app/api/account/_ledger";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";
import { allQUsers, SEEDED_NAMES } from "../tests/browser/seed-questionnaire";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-lane-questionnaire: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}

const BASICS = { name: "Seed", age: "25-34", gender: "female" };
const ANSWERED = { ...BASICS, primary_concerns: ["redness"], skin_type: "combination", current_products: ["prescription", "other_products"] };
const ledgerEntry = (purpose: string, version: string, copy: string, source: string) => ({
  schemaVersion: 1, purpose, granted: true, version, copySha256: sha256(copy), scanId: null, source, recordedAt: Timestamp.now(),
});

async function main() {
  const app = initializeApp({ projectId: PROJECT }, "seed-questionnaire");
  const auth = getAuth(app);
  const db = getFirestore(app);
  for (const user of allQUsers()) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    await db.recursiveDelete(db.collection("users").doc(user.uid));
    await auth.createUser({ uid: user.uid, phoneNumber: user.phoneNumber });
    const userRef = db.collection("users").doc(user.uid);
    await userRef.set({ phoneNumber: user.phoneNumber, lastSeenAt: Timestamp.now() });
    await userRef.collection("consentLedger").doc("seed-age").set(ledgerEntry("age_18_plus", AGE_ATTESTATION_VERSION, AGE_ATTESTATION_COPY, "attestation_route"));
    await userRef.collection("consentLedger").doc("seed-ai-share").set(ledgerEntry("ai_share", AI_SHARE_CONSENT_VERSION, AI_SHARE_CONSENT_COPY, "consent_route"));
    if (!user.check) continue;

    const scanId = `${user.uid}-1`;
    const createdAt = Timestamp.fromMillis(Date.now() - 86_400_000);
    await userRef.collection("skinChecks").doc(scanId).set({
      schemaVersion: 1,
      scanId,
      answers: user.check === "skipped" ? BASICS : ANSWERED,
      questionnaire: user.check === "skipped" ? "skipped" : "answered",
      questionnaireVersion: 2,
      ...(user.check === "named" ? { productNames: SEEDED_NAMES } : {}),
      status: "completed",
      image: { stored: false, captureMethod: "native" },
      consent: { imageRetention: false },
      result: null,
      createdAt,
    });
    const result = { ...syntheticAnalysis(), ...syntheticNative(), pipeline_version: "scan-0.1.6-provisional", engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec" } as unknown as SkinScanResult;
    const inputSha256 = createHash("sha256").update(scanId).digest("hex");
    const record = buildScanAnalysisRecord(result, { scanId, inputSha256, requestId: `seed-${scanId}`, captureMethod: "native" });
    await userRef.collection("scanAnalyses").doc(scanAnalysisDocId(scanId, inputSha256)).set({ ...record, createdAt });
  }
}

main().then(
  () => console.log(`seed-lane-questionnaire: ${allQUsers().length} users (project ${PROJECT}).`),
  (err) => {
    console.error("seed-lane-questionnaire failed:", (err as Error)?.message);
    process.exit(1);
  }
);
