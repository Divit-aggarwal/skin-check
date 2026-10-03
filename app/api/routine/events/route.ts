import { isDeepStrictEqual } from "node:util";
import { NextResponse, type NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { AdminNotConfiguredError, adminDb, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { CATALOG_VERSION, CATALOGUE, getProduct } from "@/lib/catalog/catalogue";
import {
  DEFAULT_TIME_ZONE,
  OTHER_PRODUCT_ID,
  ROUTINE_EVENT_SCHEMA_VERSION,
  RoutineEventInputSchema,
  addDays,
  currentRoutine,
  isTimeZone,
  todayIn,
  type RoutineEvent,
  type RoutineEventInput,
} from "@/lib/routine/events";
import { adherence } from "@/lib/routine/adherence";

// E03 routine events (docs/lanes/routine-design.md, R-6 A). The server is the
// only writer of users/{uid}/routineEvents/{eventId}; firestore.rules deny all
// client writes. The uid comes from the verified ID token only, never the
// body. Purpose (R-1 A): the user keeps and sees their own record. Nothing
// here reads scans or calls Gemini.
export const runtime = "nodejs";

const LIMITS: PublicRouteLimits = { scope: "routine", perMinute: 30, perDay: 1000 };
const MAX_BODY_BYTES = 4_000;

const fail = (status: number, code: string) => NextResponse.json({ error: code, code }, { status });

async function verifiedUid(request: NextRequest): Promise<string | NextResponse> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return fail(401, "AUTH_REQUIRED");
  try {
    return await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("routine events:", err.message);
      return fail(500, "AUTH_MISCONFIGURED");
    }
    console.warn("routine events: ID token verification failed:", (err as { code?: string })?.code ?? "unknown");
    return fail(401, "AUTH_REQUIRED");
  }
}

const eventsOf = (uid: string) => adminDb().collection("users").doc(uid).collection("routineEvents");

/** null when the id is fine; otherwise the 400 code. */
function productProblem(id: string, mustBeAvailable: boolean): string | null {
  if (id === OTHER_PRODUCT_ID) return null;
  const p = getProduct(id);
  if (!p) return "unknown_product";
  return mustBeAvailable && p.availability !== "available" ? "product_not_available" : null;
}

function inputProblem(e: RoutineEventInput): string | null {
  // Starting something needs an available product; stopping, rescheduling or
  // logging accepts any catalogue row, so a user can always end an old item.
  const own = productProblem(e.productId, e.type === "start");
  if (own) return own;
  if (e.type === "substitute") return productProblem(e.toProductId, true);
  return null;
}

export async function POST(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;

  if (Number(request.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) return fail(413, "too_large");
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "invalid_event");
  }
  const parsed = RoutineEventInputSchema.safeParse(body);
  if (!parsed.success) return fail(400, "invalid_event");
  const input = parsed.data;

  const problem = inputProblem(input);
  if (problem) return fail(400, problem);
  if (input.effectiveDate > todayIn(input.timeZone)) return fail(400, "future_date");

  const ref = eventsOf(uid).doc(input.eventId);
  try {
    await ref.create({
      ...input,
      schemaVersion: ROUTINE_EVENT_SCHEMA_VERSION,
      catalogVersion: CATALOG_VERSION,
      recordedAt: FieldValue.serverTimestamp(),
      source: "user",
    });
    return NextResponse.json({ eventId: input.eventId }, { status: 201 });
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("routine events:", err.message);
      return fail(500, "AUTH_MISCONFIGURED");
    }
    // gRPC 6 = ALREADY_EXISTS: a retry, or a reused eventId. create() is
    // atomic, so two racing requests cannot both write.
    if ((err as { code?: unknown })?.code !== 6) {
      console.error("routine events: write failed:", (err as { code?: unknown })?.code ?? "unknown");
      return fail(500, "write_failed");
    }
    const stored = (await ref.get()).data() ?? {};
    // Only the client's input is compared, so a replay after a catalogue
    // version bump is still the same event.
    const { schemaVersion: _v, catalogVersion: _c, recordedAt: _r, source: _s, ...storedInput } = stored;
    void [_v, _c, _r, _s];
    return isDeepStrictEqual(storedInput, input)
      ? NextResponse.json({ eventId: input.eventId, replay: true }, { status: 200 })
      : fail(409, "event_id_conflict");
  }
}

export async function GET(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;

  const timeZone = request.nextUrl.searchParams.get("tz") ?? DEFAULT_TIME_ZONE;
  if (!isTimeZone(timeZone)) return fail(400, "bad_time_zone");

  try {
    // ponytail: reads the whole history each time; add a snapshot or paging if a user's history grows large.
    const snap = await eventsOf(uid).get();
    const events = snap.docs.map((d) => {
      const data = d.data();
      const at = data.recordedAt;
      return { ...data, recordedAt: at instanceof Timestamp ? at.toDate().toISOString() : String(at ?? "") } as RoutineEvent;
    });
    const today = todayIn(timeZone);
    return NextResponse.json({
      today,
      timeZone,
      catalogVersion: CATALOG_VERSION,
      // Names and availability only: the routine page shows no claims (R-4 A).
      products: CATALOGUE.products.map((p) => ({ id: p.id, name: p.name, available: p.availability === "available" })),
      events,
      routine: currentRoutine(events, today),
      adherence: adherence(events, { from: addDays(today, -6), to: today, today }),
    });
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("routine events:", err.message);
      return fail(500, "AUTH_MISCONFIGURED");
    }
    console.error("routine events: read failed:", (err as { code?: unknown })?.code ?? "unknown");
    return fail(500, "read_failed");
  }
}
