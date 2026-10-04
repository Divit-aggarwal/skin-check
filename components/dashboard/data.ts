import { collection, getDocsFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { Doc } from "./state";

// The signed-in user's own checks, analyses and consent entries. The ledger is
// read on its own (ConsentSection), so a failed ledger read never blanks the page
// (docs/lanes/dashboard-design.md §2). firestore.rules allows the owner to
// read all three and nobody else, so a wrong uid is refused by the server.

/** After this, the page shows its error state instead of waiting forever offline. */
export const LOAD_TIMEOUT_MS = 15_000;

export interface DashboardData {
  checks: Doc[];
  analyses: Doc[];
}

// From the server only: offline, plain getDocs resolves with an EMPTY result
// from the cache, which would read as "no checks" or "not asked yet".
async function read(uid: string, name: "skinChecks" | "scanAnalyses" | "consentLedger"): Promise<Doc[]> {
  const snap = await getDocsFromServer(collection(db(), "users", uid, name));
  return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
}

async function withTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("dashboard load timed out")), LOAD_TIMEOUT_MS);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export async function loadDashboard(uid: string): Promise<DashboardData> {
  const [checks, analyses] = await withTimeout(Promise.all([read(uid, "skinChecks"), read(uid, "scanAnalyses")]));
  return { checks, analyses };
}

export const loadLedger = (uid: string) => withTimeout(read(uid, "consentLedger"));
