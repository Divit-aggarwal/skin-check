import { createHash, createPrivateKey, sign } from "node:crypto";
import type { Firestore } from "firebase-admin/firestore";
import { deriveDashboard, type Doc } from "@/components/dashboard/state";
import { currentRoutine, isTimeZone, todayIn, weekdayOf, type RoutineEvent } from "@/lib/routine/events";
import type { NotificationPrefs } from "@/lib/feature-contracts/notifications";
import { nextCheck } from "./schedule";

// SERVER ONLY. TD-47 reminders: standard web push (RFC 8030) signed with our
// own VAPID keys (RFC 8292), no outside vendor, no payload. With no payload
// nothing about the user travels through the push service, and no payload
// encryption (RFC 8291) is needed: the service worker (public/sw.js) shows one
// fixed line and opens Home, which says what is due.

/** Push services a browser may hand us; anything else is refused (no request to an address a client chose). */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /^web\.push\.apple\.com$/, /^[a-z0-9-]+\.notify\.windows\.com$/];

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
    // An allowed host must not bounce the request somewhere else.
    redirect: "error",
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
 * G31: with saved prefs, the daily push goes out for the morning routine when
 * a routine step is due, and for the weekly check-in on the chosen weekday
 * (0 = Sunday, in the subscription's time zone) whether or not a check is due.
 */
export function wanted(prefs: Pick<NotificationPrefs, "types" | "weeklyCheckinDay">, due: { routine: boolean }, weekday: number): boolean {
  return (prefs.types?.routine_morning === true && due.routine) || (prefs.types?.weekly_checkin === true && prefs.weeklyCheckinDay === weekday);
}

/** Subscriptions one account may keep (one per browser; old ones go when a service says they are gone). */
export const MAX_SUBSCRIPTIONS_PER_USER = 5;
/** The cron stops starting new users after this, well inside the 300 s function limit, and says so. */
const CRON_BUDGET_MS = 240_000;

type Sub = { ref: { delete: () => Promise<unknown>; update: (d: Record<string, unknown>) => Promise<unknown>; parent: { parent: { id: string } | null } }; data: () => Record<string, unknown> };

/**
 * The daily cron: at most one notification per subscription per local day
 * (lastSentOn), only when something is due and the account still has
 * reminders on. One read of each user's data, not one per subscription. A
 * browser shared by two accounts keeps only the newest account's
 * subscription. Counts only; no uid is logged.
 */
export async function sendReminders(db: Firestore, now = new Date(), send = sendPush, budgetMs = CRON_BUDGET_MS) {
  const started = Date.now();
  const subs = (await db.collectionGroup("pushSubscriptions").get()).docs as unknown as Sub[];
  let sent = 0;
  let removed = 0;
  let failed = 0;
  let skipped = 0;

  // One browser, two accounts: the newest subscription wins.
  const byEndpoint = new Map<string, Sub>();
  const created = (s: Sub) => {
    const c = s.data().createdAt as { toMillis?: () => number } | undefined;
    return typeof c?.toMillis === "function" ? c.toMillis() : 0;
  };
  for (const s of subs) {
    const endpoint = String(s.data().endpoint);
    const other = byEndpoint.get(endpoint);
    if (!other) byEndpoint.set(endpoint, s);
    else {
      const [keep, drop] = created(s) >= created(other) ? [s, other] : [other, s];
      byEndpoint.set(endpoint, keep);
      await drop.ref.delete().catch(() => undefined);
      removed += 1;
    }
  }
  const byUser = new Map<string, Sub[]>();
  for (const s of Array.from(byEndpoint.values())) {
    const uid = s.ref.parent.parent?.id;
    if (uid) byUser.set(uid, [...(byUser.get(uid) ?? []), s]);
  }

  for (const [uid, list] of Array.from(byUser.entries())) {
    if (Date.now() - started > budgetMs) {
      skipped += list.length;
      continue;
    }
    try {
      const user = db.collection("users").doc(uid);
      const [settings, prefsDoc, checks, analyses, events] = await Promise.all([
        user.collection("settings").doc("home").get(),
        user.collection("settings").doc("notifications").get(),
        ...["skinChecks", "scanAnalyses", "routineEvents"].map((c) => user.collection(c).get()),
      ] as const);
      // Reminders turned off in Account (even if a browser's subscription is still here): nothing is sent.
      if ((settings as { get: (f: string) => unknown }).get("reminders") !== "allowed") continue;
      // G31: per-type switches (users/{uid}/settings/notifications). With no doc, today's rule (check or routine due).
      const saved = prefsDoc as FirebaseFirestore.DocumentSnapshot;
      const prefs = saved.exists ? (saved.data() as Pick<NotificationPrefs, "types" | "weeklyCheckinDay">) : null;
      const data = {
        checks: (checks as FirebaseFirestore.QuerySnapshot).docs.map((d) => ({ id: d.id, data: d.data() })),
        analyses: (analyses as FirebaseFirestore.QuerySnapshot).docs.map((d) => ({ id: d.id, data: d.data() })),
        events: (events as FirebaseFirestore.QuerySnapshot).docs.map((d) => d.data() as RoutineEvent),
      };
      for (const sub of list) {
        const { endpoint, timeZone, lastSentOn } = sub.data() as { endpoint: string; timeZone: string; lastSentOn?: string };
        const tz = isTimeZone(timeZone) ? timeZone : "Asia/Kolkata";
        const today = todayIn(tz, now);
        if (lastSentOn === today) continue;
        const due = dueToday(uid, data, tz, now);
        if (prefs ? !wanted(prefs, due, weekdayOf(today)) : !due.check && !due.routine) continue;
        if (!allowedEndpoint(endpoint) || (await send(endpoint)) === "gone") {
          await sub.ref.delete();
          removed += 1;
        } else {
          await sub.ref.update({ lastSentOn: today });
          sent += 1;
        }
      }
    } catch (err) {
      console.error("reminders: one account failed:", (err as Error)?.name ?? "unknown");
      failed += 1;
    }
  }
  if (skipped) console.error(`reminders: time budget reached, ${skipped} subscriptions left for tomorrow`);
  return { sent, removed, failed, skipped };
}
