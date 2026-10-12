// Dashboard lane seed (docs/lanes/dashboard-design.md §6). Run by
// scripts/local-stack.sh after seed-local.ts, on every start.
//
// One new user per dashboard state and per browser test that changes data.
// The base seed users (Asha, Ravi) are not touched: their counts are pinned by
// tests/local-stack.e2e.test.ts.
//
// Same refusal as seed-local.ts: emulators and a "demo-" project only.
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION, AI_SHARE_CONSENT_COPY, AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { sha256 } from "@/app/api/account/_ledger";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { SECTIONS } from "@/lib/skin-check-steps";
import { syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";
import { DASHBOARD_SEED } from "../tests/browser/seed-users";
import { readFileSync } from "node:fs";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { scanImageKey } from "@/lib/s3-key";
import { CATALOG_VERSION } from "@/lib/catalog/catalogue";

// A kept photo goes to the local S3 stand-in only (scripts/local-stack.sh
// exports its endpoint). The image is a synthetic test pattern, no person.
async function putKeptPhoto(key: string) {
  const endpoint = process.env.S3_SKIN_IMAGES_ENDPOINT;
  if (!endpoint || !/^http:\/\/127\.0\.0\.1:/.test(endpoint)) throw new Error("seed-lane-dashboard: kept photos go to the local S3 stand-in only.");
  const s3 = new S3Client({ region: "ap-south-1", endpoint, forcePathStyle: true, credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" } });
  await s3.send(new PutObjectCommand({ Bucket: process.env.S3_SKIN_IMAGES_BUCKET ?? "skin-originals-dev", Key: key, Body: readFileSync("tests/browser/fixtures/kept-photo.jpg"), ContentType: "image/jpeg" }));
}

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-lane-dashboard: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}

const BUILD = "sha-8dc37dc501ea974825427c665acd7019120c20ec";
const ANSWERS = { name: "Seed", age: "25-34", gender: "other", primary_concerns: ["redness", "texture"], skin_type: "combination" };

/** A complete questionnaire (female, so both re-confirmed steps apply), as tests/reusable-answers.test.ts builds it. */
function fullAnswers(): SkinCheckAnswers {
  const answers: SkinCheckAnswers = { age: "25-34", gender: "female" };
  for (const section of SECTIONS) {
    for (const step of section.steps) {
      if (step.id in answers) continue;
      if (step.type === "phone") answers[step.id] = "+919999900811";
      else if (step.type === "photo-capture") answers[step.id] = "done";
      else if (step.type === "text") answers[step.id] = "Meera";
      else if (step.type === "scale-1-5") answers[step.id] = "3";
      else if (step.type === "multi-select-cards" || step.type === "body-map") answers[step.id] = [step.options[0]!.value];
      else answers[step.id] = step.options[0]!.value;
    }
  }
  return answers;
}

const ledgerEntry = (purpose: string, granted: boolean, version: string, copy: string, source: string) => ({
  schemaVersion: 1, purpose, granted, version, copySha256: sha256(copy), scanId: null, source, recordedAt: Timestamp.now(),
});

async function main() {
  const app = initializeApp({ projectId: PROJECT }, "seed-dashboard");
  const auth = getAuth(app);
  const db = getFirestore(app);

  for (const user of Object.values(DASHBOARD_SEED)) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    await auth.createUser({ uid: user.uid, phoneNumber: user.phoneNumber });
    const userRef = db.collection("users").doc(user.uid);
    await userRef.set({ phoneNumber: user.phoneNumber, lastSeenAt: Timestamp.now() });
    const ledger = userRef.collection("consentLedger");
    // Fixed ids with set(): a restart resets these entries instead of adding more.
    await ledger.doc("seed-age").set(ledgerEntry("age_18_plus", true, AGE_ATTESTATION_VERSION, AGE_ATTESTATION_COPY, "attestation_route"));
    if (user.aiShare) await ledger.doc("seed-ai-share").set(ledgerEntry("ai_share", true, AI_SHARE_CONSENT_VERSION, AI_SHARE_CONSENT_COPY, "consent_route"));

    // TD-47: Home settings and a two-product routine (morning cleanser, evening moisturiser, every day).
    if (user.home?.asked || user.home?.city) {
      await userRef.collection("settings").doc("home").set({
        ...(user.home.asked ? { askedAt: Timestamp.now(), location: user.home.city ? "allowed" : "not_now", reminders: "not_now" } : {}),
        city: user.home.city ? { ...user.home.city, source: "typed" } : null,
      });
    }
    if (user.home?.routineLoggedDaysAgo) {
      const day = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - n * 86_400_000));
      const event = (id: string, e: Record<string, unknown>) =>
        userRef.collection("routineEvents").doc(id).set({ eventId: id, timeZone: "Asia/Kolkata", schemaVersion: 1, catalogVersion: CATALOG_VERSION, recordedAt: Timestamp.now(), source: "user", ...e });
      const all = [0, 1, 2, 3, 4, 5, 6];
      await event("00000000-0000-4000-8000-000000000001", { type: "start", productId: "refreshing-cleanser", effectiveDate: day(30), schedule: { slot: "AM", days: all } });
      await event("00000000-0000-4000-8000-000000000002", { type: "start", productId: "calming-moisturiser", effectiveDate: day(30), schedule: { slot: "PM", days: all } });
      let k = 0;
      for (const n of user.home.routineLoggedDaysAgo)
        await event(`00000000-0000-4000-8000-0000000001${String(k++).padStart(2, "0")}`, { type: "usage", productId: "refreshing-cleanser", slot: "AM", status: "used", effectiveDate: day(n) });
    }

    for (let i = 0; i < user.checks.length; i++) {
      const c = user.checks[i]!;
      const scanId = `${user.uid}-${i + 1}`;
      const createdAt = Timestamp.fromMillis(Date.now() - c.days * 86_400_000);
      const base = syntheticAnalysis() as Record<string, unknown>;
      const result = {
        ...base,
        ...syntheticNative(),
        // Varied per check so bands differ between checks; still synthetic.
        scores: { redness: 0.3 + 0.1 * (i % 3), oiliness: 0.5, texture: 0.4, pores: 0, blemishes: 0.2, hydration: 0.6, pigment: 0.5 },
        // Readings by face area, as the engine returns them (G03 Home and opened check). Synthetic.
        region_scores: Object.fromEntries(
          (["forehead", "cheeks", "nose", "chin"] as const).map((r, k) => [
            r,
            { redness: 0.25 + 0.15 * ((i + k) % 3), oiliness: 0.5, texture: 0.35 + 0.1 * k, pores: 0, blemishes: 0.2 + 0.1 * (k % 2), hydration: 0.6, pigment: 0.5 },
          ])
        ),
        region_low_confidence: { forehead: c.lowForehead === true, nose: false, chin: false, cheeks: false },
        pipeline_version: "scan-0.1.6-provisional",
        engine_build: c.build ?? BUILD,
      } as unknown as SkinScanResult;
      const legacy = { scores: c.badScores ? { redness: "unreadable" } : result.scores, regions: result.regions, region_scores: result.region_scores, pipeline_version: "scan-0.1.4-provisional" };

      await userRef.collection("skinChecks").doc(scanId).set({
        schemaVersion: 1,
        scanId,
        answers: user.fullAnswers ? fullAnswers() : ANSWERS,
        status: c.kind === "failed" ? "analysis_failed" : c.kind === "questions" ? "questionnaire_only" : "completed",
        image: c.kind === "questions" ? null : { stored: c.kept === true, captureMethod: "native" },
        consent: { imageRetention: false },
        result: c.kind === "measured" || c.kind === "legacy" ? legacy : null,
        createdAt,
      });
      if (c.kept) await putKeptPhoto(scanImageKey(user.uid, scanId));
      if (c.kind !== "measured") continue;

      const inputSha256 = createHash("sha256").update(scanId).digest("hex");
      const captureQuality = c.verdict
        ? { schemaVersion: 1, producer: "capture-quality-web", producerVersion: "cq-1", assertedBy: "client", verdict: c.verdict }
        : undefined;
      const record = buildScanAnalysisRecord(result, { scanId, inputSha256, requestId: `seed-${scanId}`, captureMethod: "native" });
      // captureQuality is set directly: the seed shows the stored verdict only.
      await userRef.collection("scanAnalyses").doc(scanAnalysisDocId(scanId, inputSha256)).set({ ...record, ...(captureQuality ? { captureQuality } : {}), createdAt });
    }
  }
}

main().then(
  () => console.log(`seed-lane-dashboard: ${Object.keys(DASHBOARD_SEED).length} users (project ${PROJECT}).`),
  (err) => {
    console.error("seed-lane-dashboard failed:", (err as Error)?.message);
    process.exit(1);
  }
);
