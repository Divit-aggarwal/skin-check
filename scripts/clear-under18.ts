// H05 (decision 4): clear a mistaken under-18 record. The OWNER runs this,
// after confirming with the account holder that the under-18 answer was a
// mistake. It prints what it will change and changes nothing until the owner
// types CLEAR.
//
//   env -u FIRESTORE_EMULATOR_HOST -u FIREBASE_AUTH_EMULATOR_HOST \
//     npx vite-node --mode production --config vitest.config.ts scripts/clear-under18.ts -- \
//     --project <firebase project id> --phone +91XXXXXXXXXX --operator "<who runs this>" --reason "<why>"
//   (or --uid <uid> instead of --phone)
//
// It reads the Firebase Admin settings from the environment, like the app
// (FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY; with the
// emulator variables set, the emulators). vite-node also fills any variable
// the shell does not set from .env files (--mode production skips
// .env.development.local and its emulator hosts), so --project must name the
// project it ends up connected to, or it refuses. It never prints a key.
//
// What it changes (both together, or neither):
// - adds ONE entry to users/{uid}/consentLedger: source "support_clear", with
//   the operator and the reason. Nothing in the ledger is changed or deleted.
// - deletes under18Accounts/{uid} (the H24 marker the Firestore rules check).
// The user is then asked their age again (the clear is not an 18+ answer).
import { createInterface } from "node:readline";
import { adminAuth, adminDb, usesEmulators } from "@/lib/firebase/admin";
import { ageStatus, clearUnder18, type AgeStatus } from "@/app/api/account/_ledger";

export interface ClearPlan {
  uid: string;
  status: AgeStatus;
  markerExists: boolean;
  /** Every age entry, oldest first: what the owner checks before clearing. */
  entries: { recordedAt: string; granted: unknown; version: unknown; source: unknown }[];
}

const iso = (v: unknown) =>
  typeof (v as { toDate?: unknown })?.toDate === "function" ? (v as { toDate(): Date }).toDate().toISOString() : "pending";

export async function planClear(uid: string): Promise<ClearPlan> {
  const user = adminDb().collection("users").doc(uid);
  const [status, marker, ledger] = await Promise.all([
    ageStatus(uid),
    adminDb().collection("under18Accounts").doc(uid).get(),
    user.collection("consentLedger").where("purpose", "==", "age_18_plus").get(),
  ]);
  const entries = ledger.docs
    .map((d) => d.data())
    .map((d) => ({ recordedAt: iso(d.recordedAt), granted: d.granted, version: d.version, source: d.source }))
    .sort((a, b) => a.recordedAt.localeCompare(b.recordedAt));
  return { uid, status, markerExists: marker.exists, entries };
}

function arg(argv: readonly string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

const maskPhone = (phone: string) => `${"*".repeat(Math.max(0, phone.length - 4))}${phone.slice(-4)}`;

/** The whole run. `ask` returns what the owner typed; `log` prints. Returns the exit code. */
export async function main(argv: readonly string[], ask: (q: string) => Promise<string>, log: (line: string) => void = console.log): Promise<number> {
  const phone = arg(argv, "phone");
  const operator = arg(argv, "operator")?.trim();
  const reason = arg(argv, "reason")?.trim();
  const expectedProject = arg(argv, "project");
  let uid = arg(argv, "uid");
  if ((!phone && !uid) || !operator || !reason || !expectedProject) {
    log("usage: clear-under18.ts -- --project <id> (--phone +91... | --uid <uid>) --operator <who> --reason <why>");
    return 2;
  }
  if (operator.length > 100 || reason.length > 500) {
    log("operator must be at most 100 characters and reason at most 500.");
    return 2;
  }

  const project = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "(not set)";
  log(`Firebase project: ${project}${usesEmulators() ? " (EMULATORS)" : " (REAL PROJECT)"}`);
  if (project !== expectedProject) {
    log(`--project ${expectedProject} does not match the configured project. Nothing changed.`);
    return 2;
  }

  if (!uid) {
    try {
      uid = (await adminAuth().getUserByPhoneNumber(phone!)).uid;
    } catch {
      log(`No account found for ${maskPhone(phone!)}. Nothing changed.`);
      return 1;
    }
  }
  log(`Account: uid ${uid}${phone ? ` (phone ${maskPhone(phone)})` : ""}`);

  const plan = await planClear(uid);
  log(`Age status now: ${plan.status}. Under-18 marker (under18Accounts/${uid}): ${plan.markerExists ? "present" : "absent"}.`);
  log("Age entries in the consent ledger, oldest first:");
  for (const e of plan.entries) log(`  ${e.recordedAt}  granted=${String(e.granted)}  source=${String(e.source)}  version=${String(e.version)}`);
  if (plan.status !== "under18") {
    log("This account is not blocked as under 18. Nothing to clear. Nothing changed.");
    return 0;
  }

  log("");
  log("This will:");
  log(`  1. add one entry to users/${uid}/consentLedger: source support_clear, operator "${operator}", reason "${reason}" (nothing else in the ledger changes);`);
  log(`  2. delete under18Accounts/${uid}${plan.markerExists ? "" : " (already absent)"}.`);
  log("The user will be asked their age again. Tell them to close any open Skin Check tab and, on the");
  log("next check, to choose their real age: a tab or a saved answer that still says under 18 records it again.");
  const answer = (await ask("Type CLEAR to make this change, anything else to stop: ")).trim();
  if (answer !== "CLEAR") {
    log("Stopped. Nothing changed.");
    return 1;
  }

  await clearUnder18(uid, operator, reason);
  log(`Done. Age status now: ${await ageStatus(uid)}.`);
  return 0;
}

// Run as a command (vite-node), never when a test imports it. vite-node puts
// its own path in argv[1], so the script name cannot be used to tell.
if (!process.env.VITEST) {
  // One line from stdin; end of input reads as "", which stops.
  const ask = async (q: string) => {
    process.stdout.write(q);
    for await (const line of createInterface({ input: process.stdin })) return line;
    return "";
  };
  main(process.argv.slice(2), ask)
    .then((code) => process.exit(code))
    .catch((err: unknown) => {
      // Name and code only: Firebase messages can carry paths with the uid.
      console.error("clear-under18 failed:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
      process.exit(1);
    });
}
