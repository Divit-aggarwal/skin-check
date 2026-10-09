import { NextResponse, type NextRequest } from "next/server";

// STOPGAP for CLAUDE.md Part 3 "Rate limiting on public routes". This is not
// auth and not a final security posture — see LIMITATIONS at the bottom.

const MINUTE = 60_000;
const DAY = 86_400_000;
const MAX_TRACKED = 5_000;

const buckets = new Map<string, { count: number; resetAt: number }>();

// Returns 0 when allowed, else seconds until the window resets. `weight` is how
// many units this request consumes — routes making more than one upstream call
// pass >1 so the counter reflects real usage.
function hit(key: string, limit: number, windowMs: number, weight = 1): number {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now >= existing.resetAt) {
    if (buckets.size >= MAX_TRACKED) {
      // forEach rather than for...of: no "target" in tsconfig.json, so TS
      // defaults to ES5 and Map iteration needs downlevelIteration.
      buckets.forEach((b, k) => {
        if (now >= b.resetAt) buckets.delete(k);
      });
    }
    buckets.set(key, { count: weight, resetAt: now + windowMs });
    return weight > limit ? Math.ceil(windowMs / 1000) : 0;
  }

  existing.count += weight;
  return existing.count > limit ? Math.ceil((existing.resetAt - now) / 1000) : 0;
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

function tooMany(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfter) } }
  );
}

export interface PublicRouteLimits {
  scope: string;          // shared bucket name — routes on one quota share a scope
  perMinute: number;      // per-IP burst
  perDay: number;         // per-IP daily
  globalPerDay?: number;  // cap across ALL callers, for shared external quotas
}

/**
 * Phase 1 — volume/abuse protection. Payload-agnostic and cheap, so it runs at
 * the top of the handler, before body parsing.
 *
 * Deliberately does NOT touch the daily counters: those model real upstream
 * consumption, and a request rejected for a malformed body never reaches the
 * upstream service. Counting attempts here would let anyone exhaust the shared
 * daily budget with garbage payloads and lock out every legitimate user.
 */
export function checkRequestRate(
  request: NextRequest,
  limits: PublicRouteLimits
): NextResponse | null {
  // Intentional: local dev has no x-forwarded-for, so every request would share
  // one bucket and dev testing would be gated by a production quota guard.
  if (process.env.NODE_ENV === "development") return null;

  // Only this app's own client calls these routes, so a cross-origin Origin
  // header is not the app. A missing Origin (curl's default) falls through to
  // the rate limiter rather than being blocked outright.
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const burst = hit(`${limits.scope}:m:${clientIp(request)}`, limits.perMinute, MINUTE);
  return burst ? tooMany(burst) : null;
}

/**
 * Phase 2 — quota accounting. Call this only once the request is known-good and
 * is about to hit the upstream service (Gemini, or the skin-scan FastAPI), so
 * the counters track real consumption rather than request attempts.
 *
 * `upstreamCalls` is how many upstream requests this handler will make. Pass >1
 * on routes that call the service more than once, otherwise the budget
 * under-counts against the provider's own quota.
 */
export function consumeDailyQuota(
  request: NextRequest,
  limits: PublicRouteLimits,
  upstreamCalls = 1
): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  const ip = clientIp(request);

  const daily = hit(`${limits.scope}:d:${ip}`, limits.perDay, DAY, upstreamCalls);
  if (daily) return tooMany(daily);

  if (limits.globalPerDay !== undefined) {
    const global = hit(`${limits.scope}:global`, limits.globalPerDay, DAY, upstreamCalls);
    if (global) return tooMany(global);
  }

  return null;
}

// The chat route's per-IP burst limit. Its daily limit is per user, not per
// IP or shared (owner decision TD-29 (5), lib/echo-quota.ts), so the chat
// route no longer calls consumeDailyQuota with these: perDay is unused.
export const GEMINI_ROUTE_LIMITS: PublicRouteLimits = {
  scope: "gemini",
  perMinute: 5,
  perDay: 0,
};

// Self-hosted FastAPI — no external quota, so burst protection only.
export const SKIN_SCAN_ROUTE_LIMITS: PublicRouteLimits = {
  scope: "skin-scan",
  perMinute: 5,
  perDay: 40,
};

// LIMITATIONS (read before trusting this):
// - In-memory and per-process. Serverless runs many instances, so the real
//   ceiling is roughly limit × instance count, and cold starts reset counters.
// - x-forwarded-for[0] is client-supplied and therefore spoofable. Behind a
//   trusted proxy the rightmost trusted hop is the correct value.
// - Requests with no IP header share one "unknown" bucket.
