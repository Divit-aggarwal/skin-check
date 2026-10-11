import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { sendReminders } from "@/lib/home/push";
import { pushOn } from "@/lib/home/switches";

export const runtime = "nodejs";

// TD-47: the daily reminder cron (vercel.json; Hobby plan: once a day, within
// the hour), called with `Authorization: Bearer ${CRON_SECRET}` like the erase
// sweep. Does nothing while PUSH_SWITCH is not "on".

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured.", code: "CRON_MISCONFIGURED" }, { status: 500 });
  if (!authorized(request.headers.get("authorization"), secret)) return NextResponse.json({ error: "Not allowed.", code: "AUTH_REQUIRED" }, { status: 401 });
  if (!pushOn()) return NextResponse.json({ ok: true, off: true });
  try {
    const result = await sendReminders(adminDb());
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 500 });
  } catch (err) {
    console.error("home/reminders/send failed:", (err as Error)?.name ?? "unknown");
    return NextResponse.json({ error: "Failed.", code: "REMINDERS_FAILED" }, { status: 500 });
  }
}
