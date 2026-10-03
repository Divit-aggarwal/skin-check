// Routine events for the two seed users (lane:routine). Run by
// scripts/local-stack.sh after scripts/seed-local.ts, on every start.
//
// Refuses to run unless both emulators are set and the project is a "demo-"
// project, so it can never write to real Firebase.
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { CATALOG_VERSION } from "@/lib/catalog/catalogue";
import {
  OTHER_PRODUCT_ID,
  ROUTINE_EVENT_SCHEMA_VERSION,
  RoutineEventInputSchema,
  addDays,
  todayIn,
} from "@/lib/routine/events";

const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "";
if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST || !PROJECT.startsWith("demo-")) {
  console.error("seed-lane-routine: refusing to run outside the emulators with a demo- project.");
  process.exit(1);
}

const app = getApps().find((a) => a.name === "seed-routine") ?? initializeApp({ projectId: PROJECT }, "seed-routine");
const db = getFirestore(app);
const today = todayIn("Asia/Kolkata");
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];

let n = 0;
const id = () => `5eed0000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
const d = (daysAgo: number) => addDays(today, -daysAgo);

const SEED: Record<string, Record<string, unknown>[]> = {
  "seed-user-asha": [
    { type: "start", productId: "sample-cleanser", effectiveDate: d(14), schedule: { slot: "AM_PM", days: EVERY_DAY } },
    { type: "start", productId: "sample-sunscreen", effectiveDate: d(10), schedule: { slot: "AM", days: [1, 2, 3, 4, 5] } },
    { type: "usage", productId: "sample-cleanser", effectiveDate: d(2), slot: "AM", status: "used" },
    { type: "usage", productId: "sample-cleanser", effectiveDate: d(2), slot: "PM", status: "skipped" },
    { type: "usage", productId: "sample-cleanser", effectiveDate: d(1), slot: "AM", status: "used" },
  ],
  "seed-user-ravi": [
    { type: "start", productId: "sample-moisturiser", effectiveDate: d(7), schedule: { slot: "PM", days: EVERY_DAY } },
    { type: "substitute", productId: "sample-moisturiser", toProductId: OTHER_PRODUCT_ID, effectiveDate: d(3), schedule: { slot: "PM", days: EVERY_DAY } },
    { type: "usage", productId: OTHER_PRODUCT_ID, effectiveDate: d(1), slot: "PM", status: "used" },
  ],
};

async function main() {
  for (const [uid, events] of Object.entries(SEED)) {
    for (let i = 0; i < events.length; i++) {
      const e = events[i]!;
      const input = RoutineEventInputSchema.parse({ ...e, eventId: id(), timeZone: "Asia/Kolkata" });
      // create(), never set(): events are never rewritten, even if emulator data survived a restart.
      await db.collection("users").doc(uid).collection("routineEvents").doc(input.eventId).create({
        ...input,
        schemaVersion: ROUTINE_EVENT_SCHEMA_VERSION,
        catalogVersion: CATALOG_VERSION,
        recordedAt: Timestamp.fromMillis(Date.now() - (events.length - i) * 60_000),
        source: "user",
      }).catch((err: { code?: unknown }) => {
        if (err?.code !== 6) throw err; // 6 = ALREADY_EXISTS: already seeded
      });
    }
    console.log(`seed-lane-routine: ${events.length} routine events for ${uid}`);
  }
}

main().catch((err) => {
  console.error("seed-lane-routine failed:", err);
  process.exit(1);
});
