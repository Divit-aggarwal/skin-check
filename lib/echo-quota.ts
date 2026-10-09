import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { ECHO_DAILY_LIMIT_COPY, ECHO_DAILY_QUESTIONS_PER_USER } from "@/lib/echo-limits";

export { ECHO_DAILY_QUESTIONS_PER_USER };

// Owner decision TD-29 (5), 2026-10-09: Echo's limit is per user per day.
// It replaces the shared free-tier budget (GEMINI_ROUTE_LIMITS perDay and
// globalPerDay, tracker F14). The per-IP burst limit still runs first.

/**
 * The day resets at midnight India time. IST is UTC+5:30 all year (no
 * daylight saving), so a fixed offset is exact.
 */
export const ECHO_QUOTA_DAY_OFFSET_MINUTES = 330;

/** The quota day ("YYYY-MM-DD", India time) that `now` falls in. */
export function quotaDay(now: Date): string {
  return new Date(now.getTime() + ECHO_QUOTA_DAY_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

/** Seconds from `now` to the next India-time midnight. */
export function secondsToNextQuotaDay(now: Date): number {
  const shifted = now.getTime() + ECHO_QUOTA_DAY_OFFSET_MINUTES * 60_000;
  const nextMidnight = (Math.floor(shifted / 86_400_000) + 1) * 86_400_000;
  return Math.max(1, Math.ceil((nextMidnight - shifted) / 1000));
}

/**
 * One document per user, users/{uid}/echoUsage/daily = { day, count }. Under
 * users/{uid}, so account erase (recursiveDelete) removes it; no rule matches
 * it, so no client can read or write it (deny by default). Written only here,
 * through the Admin SDK.
 */
const usageDoc = (uid: string) => adminDb().collection("users").doc(uid).collection("echoUsage").doc("daily");

/**
 * Counts one question for `uid` and returns null, or returns the refusal.
 * Durable and shared by every server instance (one transaction per call), so
 * the limit holds across instances and cold starts. Fails closed: a store it
 * cannot read or write refuses with 503, never lets the question through.
 */
export async function consumeEchoQuestion(uid: string, now: Date = new Date()): Promise<NextResponse | null> {
  const day = quotaDay(now);
  let allowed: boolean;
  try {
    allowed = await adminDb().runTransaction(async (tx) => {
      const ref = usageDoc(uid);
      const snap = await tx.get(ref);
      const data = snap.data() as { day?: unknown; count?: unknown } | undefined;
      const used = data?.day === day && typeof data.count === "number" ? data.count : 0;
      if (used >= ECHO_DAILY_QUESTIONS_PER_USER) return false;
      tx.set(ref, { day, count: used + 1 });
      return true;
    });
  } catch (err) {
    // Name and code only: Firestore messages embed the doc path (the uid).
    console.error("echo quota unavailable:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
    return NextResponse.json(
      { error: "Echo can't check your settings right now. Please try again.", code: "ECHO_LIMIT_UNAVAILABLE" },
      { status: 503 }
    );
  }
  if (allowed) return null;
  return NextResponse.json(
    {
      error: ECHO_DAILY_LIMIT_COPY,
      code: "ECHO_DAILY_LIMIT",
    },
    { status: 429, headers: { "Retry-After": String(secondsToNextQuotaDay(now)) } }
  );
}
