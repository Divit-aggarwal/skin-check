import { NextResponse, type NextRequest } from "next/server";
import { AdminNotConfiguredError, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";

// TD-47: the Home routes' sign-in check, as the routine route does it. The
// uid comes from the verified ID token only, never the body.
export const fail = (status: number, code: string) => NextResponse.json({ error: code, code }, { status });

export async function verifiedUid(request: NextRequest): Promise<string | NextResponse> {
  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return fail(401, "AUTH_REQUIRED");
  try {
    return await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) return fail(500, "AUTH_MISCONFIGURED");
    return fail(401, "AUTH_REQUIRED");
  }
}

// Per verified uid, so rotating IPs does not help (security review TD-47).
// ponytail: in-memory and per instance, like the routine route's cap; move to
// a shared store if a hard global per-user cap is ever needed.
const perUid = new Map<string, { day: string; n: number }>();
export function overUserCap(scope: string, uid: string, max: number): boolean {
  const day = new Date().toISOString().slice(0, 10);
  const key = `${scope}:${uid}`;
  const w = perUid.get(key);
  const n = w?.day === day ? w.n + 1 : 1;
  perUid.set(key, { day, n });
  return n > max;
}

/** A small JSON body, or null (too large or not JSON). */
export async function smallJson(request: NextRequest, max = 1000): Promise<Record<string, unknown> | null> {
  const text = await request.text();
  if (text.length > max) return null;
  try {
    const v = JSON.parse(text);
    return v && typeof v === "object" && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
