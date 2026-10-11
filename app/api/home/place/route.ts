import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { isLatE1, isLonE1 } from "@/lib/home/weather";
import { nearestPlace, searchPlaces } from "@/lib/home/places";
import { weatherOn } from "@/lib/home/switches";
import { fail, overUserCap, smallJson, verifiedUid } from "../_auth";

// TD-47: a place name from a rounded position ({latE1, lonE1}, whole tenths of
// a degree) or from typed text ({query}), looked up in our own offline list.
// Nothing leaves the server; nothing is stored or logged here (the client
// saves the place it chose in its own settings doc).
export const runtime = "nodejs";
const LIMITS: PublicRouteLimits = { scope: "home-place", perMinute: 30, perDay: 500 };

export async function POST(request: NextRequest) {
  if (!weatherOn()) return fail(404, "OFF");
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;
  if (overUserCap("home-place", uid, 200)) return fail(429, "TOO_MANY");
  const body = await smallJson(request);
  if (!body) return fail(400, "BAD_REQUEST");
  if (typeof body.query === "string" && body.query.length <= 100) return NextResponse.json({ places: searchPlaces(body.query) });
  // Integers only: a precise position is refused, never rounded here, so a client that forgot to round is caught in tests.
  if (isLatE1(body.latE1) && isLonE1(body.lonE1)) return NextResponse.json({ places: [nearestPlace(body.latE1, body.lonE1)] });
  return fail(400, "BAD_REQUEST");
}
