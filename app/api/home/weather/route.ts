import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, consumeDailyQuota, type PublicRouteLimits } from "@/lib/rate-limit";
import { nearestPlace } from "@/lib/home/places";
import { isLatE1, isLonE1 } from "@/lib/home/weather";
import { WeatherUnavailableError, fetchWeather } from "@/lib/home/open-meteo";
import { weatherOn } from "@/lib/home/switches";
import { fail, overUserCap, smallJson, verifiedUid } from "../_auth";

// TD-47: today's UV, humidity and air quality for a rounded position. Signed-in
// users only, so this is never an open proxy to the paid source. The position
// comes in the body (never the URL, which can be logged) as whole tenths of a
// degree; only that goes to the source. Any failure is 503 UNAVAILABLE: the
// app works without it.
export const runtime = "nodejs";
// Two upstream calls per request. The global cap keeps one day well inside
// the paid plan (1M calls a month); the cache below absorbs repeat places.
const LIMITS: PublicRouteLimits = { scope: "home-weather", perMinute: 20, perDay: 200, globalPerDay: 20_000 };
const PER_USER_PER_DAY = 50;

export async function POST(request: NextRequest) {
  if (!weatherOn()) return fail(404, "OFF");
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;
  const body = await smallJson(request);
  if (!body || !isLatE1(body.latE1) || !isLonE1(body.lonE1)) return fail(400, "BAD_REQUEST");
  if (overUserCap("home-weather", uid, PER_USER_PER_DAY)) return fail(429, "TOO_MANY");
  const quota = consumeDailyQuota(request, LIMITS, 2);
  if (quota) return quota;
  // Snapped to a listed place: the set of positions sent upstream (and cached) is bounded by the list.
  const place = nearestPlace(body.latE1, body.lonE1);
  try {
    return NextResponse.json(await fetchWeather(place.latE1, place.lonE1));
  } catch (err) {
    // The error name only: a URL in a message would carry the key.
    console.warn("home conditions unavailable:", err instanceof WeatherUnavailableError ? "source" : (err as Error)?.name ?? "unknown");
    return fail(503, "UNAVAILABLE");
  }
}
