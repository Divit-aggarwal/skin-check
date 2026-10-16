import { NextResponse, type NextRequest } from "next/server";
import { Timestamp, type DocumentData } from "firebase-admin/firestore";
import { z } from "zod";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { AdminNotConfiguredError, adminDb, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { isValidScanId } from "@/lib/s3-key";
import { DEFAULT_TIME_ZONE, isTimeZone, todayIn } from "@/lib/routine/events";
import { scanAgeGate } from "@/app/api/account/_ledger";
import { CHECKIN_QUESTIONS, CHECKIN_VERSION, type CheckinAnswers, type CheckinRecord } from "@/lib/feature-contracts/checkin";

// E19 weekly check-in (lib/feature-contracts/checkin.ts, TD-51 (2)). The
// server is the only writer of users/{uid}/checkins/{YYYY-Www}; firestore.rules
// deny all client writes. The uid comes from the verified ID token only, never
// the body. Self-report only: no score, no change claim, and nothing here (or
// anything that reads this collection) calls Gemini; tests/checkins-route.test.ts
// pins that the Echo context never reads it.
export const runtime = "nodejs";

// Per-IP burst (checkRequestRate); perDay is required by the type but not
// enforced there. One write per week is the real bound (create, 409 after).
const LIMITS: PublicRouteLimits = { scope: "checkins", perMinute: 30, perDay: 1000 };
const MAX_BODY_BYTES = 4_000;
const MAX_LIMIT = 52;

// Per verified uid, so rotating X-Forwarded-For does not help. ponytail:
// in-memory and per instance, like the routine route's cap.
const POSTS_PER_UID_PER_DAY = 30;
const posts = new Map<string, { day: string; n: number }>();
function overUserCap(uid: string): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const p = posts.get(uid);
  const n = p?.day === day ? p.n + 1 : 1;
  posts.set(uid, { day, n });
  return n > POSTS_PER_UID_PER_DAY;
}

const fail = (status: number, code: string) => NextResponse.json({ error: code, code }, { status });

async function verifiedUid(request: NextRequest): Promise<string | NextResponse> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return fail(401, "AUTH_REQUIRED");
  try {
    return await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("checkins:", err.message);
      return fail(500, "AUTH_MISCONFIGURED");
    }
    console.warn("checkins: ID token verification failed:", (err as { code?: string })?.code ?? "unknown");
    return fail(401, "AUTH_REQUIRED");
  }
}

const user = (uid: string) => adminDb().collection("users").doc(uid);

const BodySchema = z.strictObject({
  answers: z.record(z.string(), z.string()),
  scanId: z.string().nullable().optional(),
  timeZone: z.string().max(64).optional(),
});

/** Every key a known question, every value one of that question's options, at least one answer. */
function answersOk(answers: Record<string, string>): answers is CheckinAnswers {
  const entries = Object.entries(answers);
  return (
    entries.length > 0 &&
    entries.every(([q, o]) => CHECKIN_QUESTIONS.find((x) => x.id === q)?.options.some((opt) => opt.id === o) === true)
  );
}

/** ISO 8601 week ("2026-W42") of a YYYY-MM-DD calendar date; the year is the ISO week-year. */
function isoWeekId(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  // The Thursday of this Monday-to-Sunday week decides the week-year.
  d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000));
  return `${year}-W${String(week).padStart(2, "0")}`;
}

function toRecord(data: DocumentData): CheckinRecord {
  const at = data.createdAt;
  return { ...(data as CheckinRecord), createdAt: at instanceof Timestamp ? at.toDate().toISOString() : String(at ?? "") };
}

export async function POST(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;
  if (overUserCap(uid)) return fail(429, "TOO_MANY");

  // ponytail: buffers the whole body before the size check (like the upload
  // route); a streaming cap like the routine route's if bodies ever matter.
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return fail(400, "BAD_REQUEST");
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail(400, "BAD_REQUEST");
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success || !answersOk(parsed.data.answers)) return fail(400, "BAD_REQUEST");
  const { answers } = parsed.data;
  const timeZone = parsed.data.timeZone ?? DEFAULT_TIME_ZONE;
  if (!isTimeZone(timeZone)) return fail(400, "BAD_REQUEST");
  const scanId = parsed.data.scanId ?? null;
  if (scanId !== null && !isValidScanId(scanId)) return fail(400, "BAD_REQUEST");

  // The Admin SDK skips the rules' notErased / notUnder18, so the same gates here.
  if (await scanAgeGate(uid, "checkins")) return fail(403, "NOT_ALLOWED");

  try {
    const [erased, check] = await Promise.all([
      adminDb().collection("erasedAccounts").doc(uid).get(),
      scanId ? user(uid).collection("skinChecks").doc(scanId).get() : null,
    ]);
    // A scanId must name one of this user's own checks (looked up under the verified uid).
    if (erased.exists || (check && !check.exists)) return fail(403, "NOT_ALLOWED");

    const checkinId = isoWeekId(todayIn(timeZone));
    // Server time, stored as written so the reply equals the record without a read back.
    const record = { schemaVersion: CHECKIN_VERSION, checkinId, answers, scanId, timeZone, createdAt: Timestamp.now() };
    await user(uid).collection("checkins").doc(checkinId).create(record);
    return NextResponse.json(toRecord(record), { status: 201 });
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("checkins:", err.message);
      return fail(500, "AUTH_MISCONFIGURED");
    }
    // gRPC 6 = ALREADY_EXISTS: this week's check-in is already in. create() is
    // atomic, so two racing submits cannot both land.
    if ((err as { code?: unknown })?.code === 6) return fail(409, "ALREADY_THIS_WEEK");
    console.error("checkins: write failed:", (err as { code?: unknown })?.code ?? "unknown");
    return fail(500, "WRITE_FAILED");
  }
}

export async function GET(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;

  const asked = Number(request.nextUrl.searchParams.get("limit") ?? 12);
  const limit = Number.isInteger(asked) ? Math.min(Math.max(asked, 1), MAX_LIMIT) : 12;
  try {
    const snap = await user(uid).collection("checkins").orderBy("createdAt", "desc").limit(limit).get();
    return NextResponse.json({ checkins: snap.docs.map((d) => toRecord(d.data())) });
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("checkins:", err.message);
      return fail(500, "AUTH_MISCONFIGURED");
    }
    console.error("checkins: read failed:", (err as { code?: unknown })?.code ?? "unknown");
    return fail(500, "READ_FAILED");
  }
}
