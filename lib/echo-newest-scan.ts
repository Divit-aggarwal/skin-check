import { adminDb } from "@/lib/firebase/admin";
import { echoScanIdFrom, measuredScanIds } from "@/components/dashboard/state";

// SERVER ONLY. F13 (owner TD-20, option a): Echo answers only about the
// user's newest measured check, the one the dashboard and the results screen
// open it about, so two threads side by side can never set checks from
// different engine builds against each other. Same pick as the dashboard
// (echoScanIdFrom), over this verified uid's own records.
//
// - "ok": this is that check.
// - "not_newest": this check has its own reading and a newer one exists.
// - "no_reading": this check has no usable reading (yet): the check just made
//   whose server record has not landed, or an unreadable one. The route gives
//   the same retryable answer as before F13; nothing reaches Gemini.
// ponytail: reads every scanAnalyses record of the user per chat message;
// keep a newest-scan pointer if a user's history grows large.
export type EchoScanCheck = "ok" | "not_newest" | "no_reading";

export async function checkEchoScan(uid: string, scanId: string): Promise<EchoScanCheck> {
  const snap = await adminDb().collection("users").doc(uid).collection("scanAnalyses").get();
  const analyses = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  const newest = echoScanIdFrom(uid, analyses);
  if (newest === scanId) return "ok";
  return newest !== null && measuredScanIds(uid, analyses).has(scanId) ? "not_newest" : "no_reading";
}
