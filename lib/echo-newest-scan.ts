import { adminDb } from "@/lib/firebase/admin";
import { echoScanIdFrom } from "@/components/dashboard/state";

// SERVER ONLY. F13 (owner TD-20, option a): Echo answers only about the
// user's newest measured check, the one the dashboard and the results screen
// open it about, so two threads side by side can never set checks from
// different engine builds against each other. Same pick as the dashboard
// (echoScanIdFrom), over this verified uid's own records.
// ponytail: reads every scanAnalyses record of the user per chat message;
// keep a newest-scan pointer if a user's history grows large.
export async function isNewestEchoScan(uid: string, scanId: string): Promise<boolean> {
  const snap = await adminDb().collection("users").doc(uid).collection("scanAnalyses").get();
  return echoScanIdFrom(uid, snap.docs.map((d) => ({ id: d.id, data: d.data() }))) === scanId;
}
