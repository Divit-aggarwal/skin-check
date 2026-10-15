import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { getProduct } from "@/lib/catalog/catalogue";
import { CONSENT_TEXTS } from "@/lib/feature-contracts/consents";
import {
  DEFAULT_NOTIFICATION_PREFS,
  SENDABLE_TYPES,
  type NotificationPrefs,
  type NotificationType,
} from "@/lib/feature-contracts/notifications";
import { latestGrant, withLedgerTimeout } from "@/app/api/account/_ledger";
import { fail, overUserCap, smallJson, verifiedUid } from "@/app/api/home/_auth";

// G31 (TD-51 (2)): per-type notification switches. One doc,
// users/{uid}/settings/notifications, written only here (Admin SDK); the
// owner may read it (firestore.rules, mm:be1). Account erase removes it with
// the rest of users/{uid}. Only SENDABLE_TYPES can be switched on: the daily
// push (lib/home/push.ts) is the only sender.
export const runtime = "nodejs";
const LIMITS: PublicRouteLimits = { scope: "account-notifications", perMinute: 20, perDay: 200 };

const TYPES = Object.keys(DEFAULT_NOTIFICATION_PREFS.types) as NotificationType[];
const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const PatchSchema = z
  .object({
    types: z.object(Object.fromEntries(TYPES.map((t) => [t, z.boolean().optional()]))).strict(),
    products: z.record(z.string().max(100).refine((id) => !!getProduct(id)), z.boolean()),
    morningTime: Time,
    eveningTime: Time,
    weeklyCheckinDay: z.number().int().min(0).max(6),
  })
  .partial()
  .strict();

const settingsOf = (uid: string) => adminDb().collection("users").doc(uid).collection("settings");

async function signedIn(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;
  if (overUserCap("account-notifications", uid, 100)) return fail(429, "TOO_MANY");
  return uid;
}

/** H36: the marketing grant, newest entry at the current version; unreadable counts as not granted. */
async function marketingGranted(uid: string): Promise<boolean> {
  try {
    return (await withLedgerTimeout(latestGrant(uid, "marketing", CONSENT_TEXTS.marketing.version))) ?? CONSENT_TEXTS.marketing.defaultGranted;
  } catch {
    return false;
  }
}

/**
 * The saved prefs, or the defaults when none are saved. With no doc, a user
 * who allowed reminders on Home (settings/home.reminders) reads
 * routine_morning on: computed here, nothing is migrated. A withdrawn
 * marketing consent reads the marketing type off (H36).
 */
async function currentPrefs(uid: string): Promise<NotificationPrefs> {
  const [saved, home, marketing] = await Promise.all([settingsOf(uid).doc("notifications").get(), settingsOf(uid).doc("home").get(), marketingGranted(uid)]);
  const d = saved.exists ? (saved.data() as Partial<NotificationPrefs> & { updatedAt?: { toDate?: () => Date } }) : null;
  const types = d
    ? { ...DEFAULT_NOTIFICATION_PREFS.types, ...d.types }
    : { ...DEFAULT_NOTIFICATION_PREFS.types, routine_morning: home.exists && home.get("reminders") === "allowed" };
  types.marketing = types.marketing && marketing;
  return {
    ...DEFAULT_NOTIFICATION_PREFS,
    ...(d ? { products: d.products ?? {}, morningTime: d.morningTime ?? DEFAULT_NOTIFICATION_PREFS.morningTime, eveningTime: d.eveningTime ?? DEFAULT_NOTIFICATION_PREFS.eveningTime, weeklyCheckinDay: d.weeklyCheckinDay ?? 0 } : {}),
    types,
    // "" when nothing was ever saved.
    updatedAt: typeof d?.updatedAt?.toDate === "function" ? d.updatedAt.toDate().toISOString() : "",
  };
}

export async function GET(request: NextRequest) {
  const uid = await signedIn(request);
  if (uid instanceof NextResponse) return uid;
  return NextResponse.json(await currentPrefs(uid));
}

export async function PATCH(request: NextRequest) {
  const uid = await signedIn(request);
  if (uid instanceof NextResponse) return uid;
  const parsed = PatchSchema.safeParse(await smallJson(request, 4000));
  if (!parsed.success) return fail(400, "BAD_REQUEST");
  const patch = parsed.data;

  // The same markers the Firestore rules check for client writes (H04, H24).
  // An erased account writes nothing (the sweep must not find new data); an
  // under-18 account may switch off and change times, never switch on.
  const on = TYPES.filter((t) => patch.types?.[t] === true);
  const [erased, under18] = await Promise.all([
    adminDb().collection("erasedAccounts").doc(uid).get(),
    adminDb().collection("under18Accounts").doc(uid).get(),
  ]);
  if (erased.exists || (on.length > 0 && under18.exists)) return fail(403, "NOT_ALLOWED");

  // Switching off is always allowed. Consent first, so a missing marketing grant says so.
  if (on.includes("marketing") && !(await marketingGranted(uid))) return fail(409, "NEEDS_CONSENT");
  if (on.some((t) => !SENDABLE_TYPES.includes(t))) return fail(409, "NOT_SENDABLE");

  // Merged onto what GET shows (so a first save keeps a computed routine_morning).
  // ponytail: read then write, so two saves at once can lose one switch; a transaction if that ever matters.
  const base = await currentPrefs(uid);
  const types = { ...base.types } as Record<NotificationType, boolean>;
  for (const t of TYPES) if (typeof patch.types?.[t] === "boolean") types[t] = patch.types[t] as boolean;
  const next: Omit<NotificationPrefs, "updatedAt"> = {
    schemaVersion: DEFAULT_NOTIFICATION_PREFS.schemaVersion,
    types,
    products: { ...base.products, ...patch.products },
    morningTime: (patch.morningTime ?? base.morningTime) as NotificationPrefs["morningTime"],
    eveningTime: (patch.eveningTime ?? base.eveningTime) as NotificationPrefs["eveningTime"],
    weeklyCheckinDay: (patch.weeklyCheckinDay ?? base.weeklyCheckinDay) as NotificationPrefs["weeklyCheckinDay"],
  };
  await settingsOf(uid).doc("notifications").set({ ...next, updatedAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ...next, updatedAt: new Date().toISOString() } satisfies NotificationPrefs);
}
