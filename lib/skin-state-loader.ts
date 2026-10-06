import { adminDb } from "@/lib/firebase/admin";
import { isSegment, toSkinState, type SkinStateResult } from "@/lib/skin-state";

// SERVER ONLY (imports lib/firebase/admin.ts, which throws in a browser).
// toSkinState trusts the path it is given; this is the one place that path is
// built from the authenticated uid and read with the Admin SDK, so the bytes
// provably come from the server-written users/{uid}/scanAnalyses collection.

export async function loadTrustedSkinState(uid: string, docId: string): Promise<SkinStateResult> {
  if (!isSegment(uid) || !isSegment(docId)) return { kind: "invalid", reasons: ["uid/docId: not a valid path segment"] };
  const ref = `users/${uid}/scanAnalyses/${docId}`;
  const snapshot = await adminDb().collection("users").doc(uid).collection("scanAnalyses").doc(docId).get();
  if (!snapshot.exists) return { kind: "invalid", reasons: ["not found"] };
  return toSkinState(snapshot.data(), ref, uid);
}
