import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { sweepErasedAccounts } from "@/lib/erase";

export const runtime = "nodejs";

// H04 + H21 (TD-19): the second erase sweep, called by a cron with
// `Authorization: Bearer ${CRON_SECRET}` (Vercel's cron convention). It
// removes what landed after an erase and finishes any step the erase did not.
// No user identity: it acts only on accounts already marked erased whose
// sweep time has passed. Refuses when CRON_SECRET is not set.

function authorized(header: string | null, secret: string): boolean {
  const given = Buffer.from(header ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error("account/erase/sweep: CRON_SECRET is not set; refusing.");
    return NextResponse.json({ error: "Not configured.", code: "SWEEP_MISCONFIGURED" }, { status: 500 });
  }
  if (!authorized(request.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "Not allowed.", code: "AUTH_REQUIRED" }, { status: 401 });
  }
  try {
    const result = await sweepErasedAccounts();
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 500 });
  } catch (err) {
    console.error("account/erase/sweep failed:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
    return NextResponse.json({ error: "Sweep failed.", code: "SWEEP_FAILED" }, { status: 500 });
  }
}
