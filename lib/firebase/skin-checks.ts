import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import type { SkinCheckAnswers } from "@/types/skin-check";

/**
 * Associates a completed questionnaire with the authenticated Firebase user
 * by writing it under that user's own subtree. The uid is never taken from
 * anything the client asserts in a payload — it comes from the ID token
 * Firebase attaches to the request, and firestore.rules only permits a write
 * where `request.auth.uid == uid`, so a forged uid is rejected server-side.
 *
 * Questionnaire answers only. Photos and scan results stay in the in-memory
 * session (lib/skin-check-session-context.tsx); nothing here is on the path
 * to showing the user their results, which is why the caller treats a
 * failure as non-fatal.
 */
export async function saveSkinCheck(uid: string, answers: SkinCheckAnswers) {
  await addDoc(collection(db(), "users", uid, "skinChecks"), {
    answers,
    createdAt: serverTimestamp(),
  });
}
