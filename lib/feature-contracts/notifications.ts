// G37 feature contracts: shapes, route signatures, constants and fixtures shared by
// the backend and UI agents. Unlike lib/contracts (types only, TD-13), these
// may hold runtime values. Owned by the main session; agents request changes.
// G31 (TD-51 (2)): per-type notification switches, types from mockup 20.
// Types only plus the route signature; BE1 implements, lane E draws screen 20.
//
// Stored at users/{uid}/settings/notifications (one doc), written ONLY by the
// server route below (Admin SDK); the owner may read it. Account erase removes
// it with the rest of users/{uid}.
//
// Sending: Vercel Hobby runs one cron a day (TD-31), so the existing daily
// push (lib/home/push.ts) is the only sender. A type is "sendable" when that
// daily push can honour it; the rest are stored but shown disabled with the
// line naming what they wait for (no fake saving, TD-50 rule 7).

export const NOTIFICATION_PREFS_VERSION = 1 as const;

export type NotificationType =
  | "routine_morning"
  | "routine_evening"
  | "weekly_checkin"
  | "product_usage"
  | "weekly_summary"
  | "recommendations"
  | "echo_tips"
  | "marketing";

/** What the daily push can honour today. Everything else is shown disabled. */
export const SENDABLE_TYPES: readonly NotificationType[] = ["routine_morning", "weekly_checkin"];

/** Why a type cannot be switched on yet (shown under the disabled switch). */
export const WAITS_ON: Partial<Record<NotificationType, string>> = {
  routine_evening: "Evening reminders need a second daily send time.",
  product_usage: "Product reminders need a second daily send time.",
  weekly_summary: "Comes later.",
  recommendations: "Comes later.",
  echo_tips: "Comes later.",
  marketing: "Needs your marketing consent first.",
};

/** "HH:MM", 24-hour, in the user's time zone. Shown only; the daily push picks its own hour. */
export type LocalTime = `${number}${number}:${number}${number}`;

export interface NotificationPrefs {
  schemaVersion: typeof NOTIFICATION_PREFS_VERSION;
  types: Record<NotificationType, boolean>;
  /** Per product id (catalogue ids). Stored only; see WAITS_ON.product_usage. */
  products: Record<string, boolean>;
  morningTime: LocalTime;
  eveningTime: LocalTime;
  /** 0 = Sunday. */
  weeklyCheckinDay: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  /** Server time of the last change (ISO string over the wire). */
  updatedAt: string;
}

export const DEFAULT_NOTIFICATION_PREFS: Omit<NotificationPrefs, "updatedAt"> = {
  schemaVersion: NOTIFICATION_PREFS_VERSION,
  types: {
    routine_morning: false,
    routine_evening: false,
    weekly_checkin: false,
    product_usage: false,
    weekly_summary: false,
    recommendations: false,
    echo_tips: false,
    marketing: false,
  },
  products: {},
  morningTime: "08:00",
  eveningTime: "21:00",
  weeklyCheckinDay: 0,
};

/**
 * GET  /api/account/notifications  → 200 NotificationPrefs (defaults when none saved)
 * PATCH /api/account/notifications  body NotificationPrefsPatch → 200 NotificationPrefs
 *   400 BAD_REQUEST, 401 AUTH_REQUIRED, 403 NOT_ALLOWED (erased, under 18),
 *   409 NOT_SENDABLE (switching on a type outside SENDABLE_TYPES),
 *   409 NEEDS_CONSENT (marketing on without the H36 marketing grant), 429 TOO_MANY.
 */
export type NotificationPrefsPatch = Partial<Pick<NotificationPrefs, "types" | "products" | "morningTime" | "eveningTime" | "weeklyCheckinDay">> & {
  types?: Partial<Record<NotificationType, boolean>>;
};
export const NOTIFICATIONS_ROUTE = "/api/account/notifications";
