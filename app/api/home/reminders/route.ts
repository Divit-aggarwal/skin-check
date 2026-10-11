import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { isTimeZone } from "@/lib/routine/events";
import { allowedEndpoint, subscriptionId } from "@/lib/home/push";
import { pushOn } from "@/lib/home/switches";
import { fail, smallJson, verifiedUid } from "../_auth";

// TD-47: save (POST) or remove (DELETE) this browser's push subscription for
// the signed-in user. Only the endpoint and time zone are kept (no keys: the
// pushes carry no payload). Account erase removes it with the rest of users/{uid}.
export const runtime = "nodejs";
const LIMITS: PublicRouteLimits = { scope: "home-reminders", perMinute: 10, perDay: 100 };

async function parse(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;
  const body = await smallJson(request, 2000);
  if (!body || !allowedEndpoint(body.endpoint)) return fail(400, "BAD_ENDPOINT");
  return { uid, body, ref: adminDb().collection("users").doc(uid).collection("pushSubscriptions").doc(subscriptionId(body.endpoint)) };
}

export async function POST(request: NextRequest) {
  if (!pushOn()) return fail(404, "OFF");
  const p = await parse(request);
  if (p instanceof NextResponse) return p;
  const timeZone = typeof p.body.timeZone === "string" && isTimeZone(p.body.timeZone) ? p.body.timeZone : "Asia/Kolkata";
  await p.ref.set({ endpoint: p.body.endpoint, timeZone, createdAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Works with the switch off too, so a user can always turn reminders off.
export async function DELETE(request: NextRequest) {
  const p = await parse(request);
  if (p instanceof NextResponse) return p;
  await p.ref.delete();
  return NextResponse.json({ ok: true });
}
