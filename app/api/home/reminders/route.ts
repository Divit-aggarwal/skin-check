import { NextResponse, type NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { isTimeZone } from "@/lib/routine/events";
import { allowedEndpoint, MAX_SUBSCRIPTIONS_PER_USER, subscriptionId } from "@/lib/home/push";
import { pushOn } from "@/lib/home/switches";
import { fail, overUserCap, smallJson, verifiedUid } from "../_auth";

// TD-47: save (POST) or remove (DELETE) this browser's push subscription for
// the signed-in user. Only the endpoint and time zone are kept (no keys: the
// pushes carry no payload). Account erase removes it with the rest of users/{uid}.
export const runtime = "nodejs";
const LIMITS: PublicRouteLimits = { scope: "home-reminders", perMinute: 10, perDay: 100 };

const subsOf = (uid: string) => adminDb().collection("users").doc(uid).collection("pushSubscriptions");

async function signedIn(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;
  if (overUserCap("home-reminders", uid, 30)) return fail(429, "TOO_MANY");
  return uid;
}

export async function POST(request: NextRequest) {
  if (!pushOn()) return fail(404, "OFF");
  const uid = await signedIn(request);
  if (uid instanceof NextResponse) return uid;
  const body = await smallJson(request, 2000);
  if (!body || !allowedEndpoint(body.endpoint)) return fail(400, "BAD_ENDPOINT");
  // The same markers the Firestore rules check for client writes (H04, H24).
  const [erased, under18, existing] = await Promise.all([
    adminDb().collection("erasedAccounts").doc(uid).get(),
    adminDb().collection("under18Accounts").doc(uid).get(),
    subsOf(uid).get(),
  ]);
  if (erased.exists || under18.exists) return fail(403, "NOT_ALLOWED");
  const id = subscriptionId(body.endpoint);
  if (!existing.docs.some((d) => d.id === id) && existing.size >= MAX_SUBSCRIPTIONS_PER_USER) return fail(409, "TOO_MANY_DEVICES");
  const timeZone = typeof body.timeZone === "string" && isTimeZone(body.timeZone) ? body.timeZone : "Asia/Kolkata";
  await subsOf(uid).doc(id).set({ endpoint: body.endpoint, timeZone, createdAt: FieldValue.serverTimestamp() });
  return NextResponse.json({ ok: true }, { status: 201 });
}

// Works with the switch off too, so a user can always turn reminders off.
// {endpoint}: this browser only (sign-out). {all: true}: every browser of the account (Account's "Turn reminders off").
export async function DELETE(request: NextRequest) {
  const uid = await signedIn(request);
  if (uid instanceof NextResponse) return uid;
  const body = await smallJson(request, 2000);
  if (body?.all === true) {
    const all = await subsOf(uid).get();
    await Promise.all(all.docs.map((d) => d.ref.delete()));
    return NextResponse.json({ ok: true });
  }
  if (!body || !allowedEndpoint(body.endpoint)) return fail(400, "BAD_ENDPOINT");
  await subsOf(uid).doc(subscriptionId(body.endpoint)).delete();
  return NextResponse.json({ ok: true });
}
