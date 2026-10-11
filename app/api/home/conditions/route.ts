import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { isLatE1, isLonE1 } from "@/lib/home/conditions";
import { ConditionsUnavailableError, fetchConditions } from "@/lib/home/open-meteo";
import { conditionsOn } from "@/lib/home/switches";
import { fail, smallJson, verifiedUid } from "../_auth";

// TD-47: today's UV, humidity and air quality for a rounded position. Signed-in
// users only, so this is never an open proxy to the paid source. The position
// comes in the body (never the URL, which can be logged) as whole tenths of a
// degree; only that goes to the source. Any failure is 503 UNAVAILABLE: the
// app works without it.
export const runtime = "nodejs";
const LIMITS: PublicRouteLimits = { scope: "home-conditions", perMinute: 20, perDay: 500 };

export async function POST(request: NextRequest) {
  if (!conditionsOn()) return fail(404, "OFF");
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;
  const body = await smallJson(request);
  if (!body || !isLatE1(body.latE1) || !isLonE1(body.lonE1)) return fail(400, "BAD_REQUEST");
  try {
    return NextResponse.json(await fetchConditions(body.latE1, body.lonE1));
  } catch (err) {
    // The error name only: a URL in a message would carry the key.
    console.warn("home conditions unavailable:", err instanceof ConditionsUnavailableError ? "source" : (err as Error)?.name ?? "unknown");
    return fail(503, "UNAVAILABLE");
  }
}
