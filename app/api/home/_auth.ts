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
