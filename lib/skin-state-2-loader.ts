import { adminDb } from "@/lib/firebase/admin";
import { isSegment } from "@/lib/skin-state";
import { toSkinState2, type SkinState2Result } from "@/lib/skin-state-2";

// SERVER ONLY (imports lib/firebase/admin.ts, which throws in a browser).
// The skinstate-2 twin of lib/skin-state-loader.ts (frozen), for a whole
// series: the path is built here from the authenticated uid and read with the
// Admin SDK, so every state provably comes from the server-written
// users/{uid}/scanAnalyses collection (D-26). Each record is mapped with its
// own path, so toSkinState2's uid and path checks still apply per record.

// ponytail: reads the user's whole scanAnalyses collection; page it (first
// baseline scans + latest) if a series grows past a few hundred records.
export async function loadTrustedSkinState2Series(uid: string): Promise<SkinState2Result[]> {
  if (!isSegment(uid)) return [{ kind: "invalid", reasons: ["uid: not a valid path segment"] }];
  const snapshot = await adminDb().collection("users").doc(uid).collection("scanAnalyses").get();
  return snapshot.docs.map((doc) => toSkinState2(doc.data(), `users/${uid}/scanAnalyses/${doc.id}`, uid));
}
