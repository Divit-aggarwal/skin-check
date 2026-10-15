// Lane C (G37) seed for screen 16 and the shots of 06, 14, 15 and 16.
// Run on its own (npx vite-node --config vitest.config.ts scripts/seed-mm-c.ts)
// or from tests/browser/mm-c.spec.ts and tests/design/c.match.ts (kit request
// C-mm-3: the stack runs seed-lane-*.ts only). Same refusal as seed-local.ts:
// emulators and a "demo-" project only. Every value is synthetic; the kept
// photo is the synthetic test pattern (tests/browser/fixtures/kept-photo.jpg).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION } from "@/lib/consent";
import { sha256 } from "@/app/api/account/_ledger";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import { scanImageKey } from "@/lib/s3-key";
import { CATALOG_VERSION } from "@/lib/catalog/catalogue";
import type { SkinScanResult } from "@/types/skin-scan";
import { syntheticAnalysis, syntheticNative } from "../tests/synthetic-scan";

/** Started the serum 28 days ago (cleanser 40, sunscreen 20); checks 35 (before the serum), 21, 10 and 2 days ago, all with a kept photo. */
export const MMC_SINCE = { uid: "seed-mmc-since", phoneNumber: "+919999904501" } as const;
/** Checks, but nothing in the routine: screen 16's empty state. */
export const MMC_EMPTY = { uid: "seed-mmc-empty", phoneNumber: "+919999904502" } as const;

const day = (n: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(Date.now() - n * 86_400_000));

function refuseOutsideEmulators(): { project: string; endpoint: string } {
  const project = process.env.FIREBASE_PROJECT_ID ?? "";
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !project.startsWith("demo-")) throw new Error("seed-mm-c: refusing to run outside the emulators with a demo- project.");
  const endpoint = process.env.S3_SKIN_IMAGES_ENDPOINT;
  if (!endpoint || !/^http:\/\/127\.0\.0\.1:/.test(endpoint)) throw new Error("seed-mm-c: kept photos go to the local S3 stand-in only.");
  return { project, endpoint };
}

export async function seedMmC(): Promise<void> {
  const { project, endpoint } = refuseOutsideEmulators();
  const app = getApps().find((a) => a.name === "seed-mm-c") ?? initializeApp({ projectId: project }, "seed-mm-c");
  const auth = getAuth(app);
  const db = getFirestore(app);
  const s3 = new S3Client({ region: "ap-south-1", endpoint, forcePathStyle: true, credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" } });

  for (const [user, checkDays, routine] of [
    [MMC_SINCE, [35, 21, 10, 2], [["refreshing-cleanser", 40, "AM_PM"], ["niacinamide-serum", 28, "PM"], ["protecting-sunscreen", 20, "AM"]]],
    [MMC_EMPTY, [5], []],
  ] as const) {
    await auth.deleteUser(user.uid).catch(() => undefined);
    await auth.createUser({ uid: user.uid, phoneNumber: user.phoneNumber });
    const userRef = db.collection("users").doc(user.uid);
    await db.recursiveDelete(userRef); // a rerun starts clean
    await userRef.set({ phoneNumber: user.phoneNumber, lastSeenAt: Timestamp.now() });
    await userRef.collection("consentLedger").doc("seed-age").set({
      schemaVersion: 1, purpose: "age_18_plus", granted: true, version: AGE_ATTESTATION_VERSION, copySha256: sha256(AGE_ATTESTATION_COPY), scanId: null, source: "attestation_route", recordedAt: Timestamp.now(),
    });

    let n = 0;
    for (const [productId, daysAgo, slot] of routine) {
      const eventId = `00000000-0000-4000-8000-0000000045${String(++n).padStart(2, "0")}`;
      await userRef.collection("routineEvents").doc(eventId).set({
        eventId, type: "start", productId, effectiveDate: day(daysAgo), timeZone: "Asia/Kolkata", schedule: { slot, days: [0, 1, 2, 3, 4, 5, 6] },
        schemaVersion: 1, catalogVersion: CATALOG_VERSION, recordedAt: Timestamp.now(), source: "user",
      });
    }

    for (let i = 0; i < checkDays.length; i++) {
      const scanId = `${user.uid}-${i + 1}`;
      const createdAt = Timestamp.fromMillis(Date.now() - checkDays[i]! * 86_400_000);
      // Varied per check so the levels differ between checks; still synthetic.
      const result = {
        ...(syntheticAnalysis() as Record<string, unknown>),
        ...syntheticNative(),
        scores: { redness: 0.2 + 0.25 * (i % 3), oiliness: 0.5, texture: 0.3 + 0.2 * (i % 2), pores: 0, blemishes: 0.7 - 0.2 * (i % 3), hydration: 0.6, pigment: 0.45 },
        pipeline_version: "scan-0.1.6-provisional",
        engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec",
      } as unknown as SkinScanResult;
      await userRef.collection("skinChecks").doc(scanId).set({
        schemaVersion: 1, scanId, answers: { age: "25-34", gender: "other" }, status: "completed",
        image: { stored: true, captureMethod: "native" }, consent: { imageRetention: true }, result: null, createdAt,
      });
      await s3.send(new PutObjectCommand({ Bucket: process.env.S3_SKIN_IMAGES_BUCKET ?? "skin-originals-dev", Key: scanImageKey(user.uid, scanId), Body: readFileSync("tests/browser/fixtures/kept-photo.jpg"), ContentType: "image/jpeg" }));
      const inputSha256 = createHash("sha256").update(scanId).digest("hex");
      const record = buildScanAnalysisRecord(result, { scanId, inputSha256, requestId: `seed-${scanId}`, captureMethod: "native" });
      await userRef.collection("scanAnalyses").doc(scanAnalysisDocId(scanId, inputSha256)).set({ ...record, createdAt });
    }
  }
}

if (process.argv[1]?.endsWith("seed-mm-c.ts")) {
  seedMmC().then(
    () => console.log("seed-mm-c: 2 users."),
    (err) => {
      console.error("seed-mm-c failed:", (err as Error)?.message);
      process.exit(1);
    }
  );
}
