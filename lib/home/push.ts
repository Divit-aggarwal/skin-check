import { createHash, createPrivateKey, sign } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { deriveDashboard, type Doc } from "@/components/dashboard/state";
import { currentRoutine, todayIn, weekdayOf, type RoutineEvent } from "@/lib/routine/events";
import { nextCheck } from "./schedule";

// SERVER ONLY. TD-47 reminders: standard web push (RFC 8030) signed with our
// own VAPID keys (RFC 8292), no outside vendor, no payload. With no payload
// nothing about the user travels through the push service, and no payload
// encryption (RFC 8291) is needed: the service worker (public/sw.js) shows one
// fixed line and opens Home, which says what is due.

/** Push services a browser may hand us; anything else is refused (no request to an address a client chose). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /\.notify\.windows\.com$/, /\.push\.apple\.com$/];

export function allowedEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  // Local stack only (scripts/fake-conditions.mjs records pushes): never in a production build.
  const local = process.env.NODE_ENV !== "production" ? process.env.PUSH_LOCAL_ENDPOINT_PREFIX : undefined;
  if (local && endpoint.startsWith(local)) return true;
  return url.protocol === "https:" && !url.port && PUSH_HOSTS.some((h) => h.test(url.hostname));
}

/** The doc id for an endpoint: its hash, so one browser has one doc. */
export const subscriptionId = (endpoint: string) => createHash("sha256").update(endpoint).digest("hex").slice(0, 40);

const b64url = (b: Buffer) => b.toString("base64url");

/** The VAPID Authorization header for one push service origin. */
export function vapidHeader(endpoint: string, now = Date.now()): string {
  const pub = Buffer.from(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "", "base64url");
  const priv = Buffer.from(process.env.VAPID_PRIVATE_KEY ?? "", "base64url");
  if (pub.length !== 65 || priv.length !== 32) throw new Error("VAPID keys are not set");
  const key = createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", x: b64url(pub.subarray(1, 33)), y: b64url(pub.subarray(33)), d: b64url(priv) } });
  const head = b64url(Buffer.from(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = { aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: process.env.VAPID_SUBJECT || "mailto:info@theprojectskin.com" };
  const body = b64url(Buffer.from(JSON.stringify(claims)));
  const sig = sign("sha256", Buffer.from(`${head}.${body}`), { key, dsaEncoding: "ieee-p1363" });
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${b64url(pub)}`;
}

/** "sent", or "gone" when the service says the subscription no longer exists. Throws on anything else. */
export async function sendPush(endpoint: string): Promise<"sent" | "gone"> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { Authorization: vapidHeader(endpoint), TTL: String(12 * 3600), Urgency: "normal", "Content-Length": "0" },
    signal: AbortSignal.timeout(10_000),
  });
  if (res.status === 404 || res.status === 410) return "gone";
  if (!res.ok) throw new Error(`push service ${res.status}`);
  return "sent";
}

/** What is due today for one user: a check (on its due day only) and/or routine steps. */
export function dueToday(uid: string, data: { checks: Doc[]; analyses: Doc[]; events: RoutineEvent[] }, timeZone: string, now: Date) {
  const last = deriveDashboard(uid, data.checks, data.analyses).history.find((h) => h.kind === "reading" || h.kind === "legacy")?.date ?? null;
  const today = todayIn(timeZone, now);
  const routine = currentRoutine(data.events, today).some((i) => i.schedule.days.includes(weekdayOf(today)));
  return { check: nextCheck(last, now, timeZone).kind === "today", routine };
}

/**
 * The daily cron: at most one notification per subscription per local day
 * (lastSentOn), only when something is due. Counts only; no uid is logged.
 */
export async function sendReminders(db: Firestore, now = new Date(), send = sendPush) {
  const subs = await db.collectionGroup("pushSubscriptions").get();
  let sent = 0;
  let removed = 0;
  let failed = 0;
  for (const sub of subs.docs) {
    const uid = sub.ref.parent.parent?.id;
    const { endpoint, timeZone, lastSentOn } = sub.data() as { endpoint: string; timeZone: string; lastSentOn?: string };
    if (!uid) continue;
    const today = todayIn(timeZone, now);
    if (lastSentOn === today) continue;
    try {
      const user = db.collection("users").doc(uid);
      // ponytail: three reads per subscriber per day; batch by user if subscribers reach the thousands.
      const [checks, analyses, events] = await Promise.all(["skinChecks", "scanAnalyses", "routineEvents"].map((c) => user.collection(c).get()));
      const due = dueToday(uid, {
        checks: checks!.docs.map((d) => ({ id: d.id, data: d.data() })),
        analyses: analyses!.docs.map((d) => ({ id: d.id, data: d.data() })),
        events: events!.docs.map((d) => d.data() as RoutineEvent),
      }, timeZone, now);
      if (!due.check && !due.routine) continue;
      if (!allowedEndpoint(endpoint)) {
        await sub.ref.delete();
        removed += 1;
        continue;
      }
      if ((await send(endpoint)) === "gone") {
        await sub.ref.delete();
        removed += 1;
      } else {
        await sub.ref.update({ lastSentOn: today });
        sent += 1;
      }
    } catch (err) {
      console.error("reminders: one subscription failed:", (err as Error)?.name ?? "unknown");
      failed += 1;
    }
  }
  return { sent, removed, failed };
}
