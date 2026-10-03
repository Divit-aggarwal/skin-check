import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkRequestRate, SKIN_SCAN_ROUTE_LIMITS } from "@/lib/rate-limit";
import { AdminNotConfiguredError, bearerToken, verifyFirebaseIdToken } from "@/lib/firebase/admin";
import { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION } from "@/lib/consent";
import { ageStatus, appendConsent } from "@/app/api/account/_ledger";

export const runtime = "nodejs";

// H02a server-side 18+ attestation (D-19). The client posts the age answer
// after phone sign-in; the server records only over18 true/false in the
// consent ledger (never the bucket), and the upload, scan and chat routes
// read it. Sticky (decision 4): the response reports the account's status
// after this write, so a later "18–24" never unlocks an under-18 record.
const BodySchema = z
  .object({
    ageBucket: z.enum(["under-18", "18-24", "25-34", "35-44", "45-plus"]),
    version: z.string().max(200),
  })
  .strict();

const unauthorized = () =>
  NextResponse.json({ error: "Authentication required.", code: "AUTH_REQUIRED" }, { status: 401 });

export async function POST(request: NextRequest) {
  const rateLimited = checkRequestRate(request, SKIN_SCAN_ROUTE_LIMITS);
  if (rateLimited) return rateLimited;

  const token = bearerToken(request.headers.get("authorization"));
  if (!token) return unauthorized();

  let uid: string;
  try {
    uid = await verifyFirebaseIdToken(token);
  } catch (err) {
    if (err instanceof AdminNotConfiguredError) {
      console.error("account/attestation:", err.message);
      return NextResponse.json({ error: "Authentication is misconfigured.", code: "AUTH_MISCONFIGURED" }, { status: 500 });
    }
    return unauthorized();
  }

  const parsed = BodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", code: "BAD_REQUEST" }, { status: 400 });
  }
  if (parsed.data.version !== AGE_ATTESTATION_VERSION) {
    return NextResponse.json({ error: "Please reload and try again.", code: "VERSION_STALE" }, { status: 409 });
  }

  try {
    await appendConsent(uid, {
      purpose: "age_18_plus",
      granted: parsed.data.ageBucket !== "under-18",
      version: AGE_ATTESTATION_VERSION,
      copy: AGE_ATTESTATION_COPY,
      scanId: null,
      source: "attestation_route",
    });
    return NextResponse.json({ ok: true, over18: (await ageStatus(uid)) === "over18" });
  } catch (err) {
    console.error("account/attestation: ledger unavailable:", (err as Error)?.message ?? "unknown");
    return NextResponse.json({ error: "Please try again.", code: "LEDGER_UNAVAILABLE" }, { status: 500 });
  }
}
