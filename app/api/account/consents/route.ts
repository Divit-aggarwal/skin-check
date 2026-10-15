import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { checkRequestRate, type PublicRouteLimits } from "@/lib/rate-limit";
import { AI_SHARE_CONSENT_VERSION } from "@/lib/consent";
import { CONSENT_TEXTS, type ConsentState, type ConsentSwitch, type NewConsentPurpose } from "@/lib/feature-contracts/consents";
import { appendConsent, latestEntry, withLedgerTimeout } from "@/app/api/account/_ledger";
import { fail, overUserCap, smallJson, verifiedUid } from "@/app/api/home/_auth";

// H36 (TD-51 (2)): screen 22's separate consents over the D-16 ledger. Each
// grant and withdrawal is one append-only entry; the newest entry at the
// current version wins, and with none the purpose's default applies.
// ai_share is read here for the screen; it is still written only by
// /api/account/consent with its own copy.
export const runtime = "nodejs";
const LIMITS: PublicRouteLimits = { scope: "account-consents", perMinute: 20, perDay: 200 };

const NEW_PURPOSES = Object.keys(CONSENT_TEXTS) as NewConsentPurpose[];
/** Screen 22's order (lib/feature-contracts/consents.ts ConsentSwitch). */
const SWITCHES: ConsentSwitch[] = [...NEW_PURPOSES, "ai_share"];

const BodySchema = z
  .object({ purpose: z.enum(NEW_PURPOSES as [NewConsentPurpose, ...NewConsentPurpose[]]), granted: z.boolean(), version: z.string().max(200) })
  .strict();

const versionOf = (p: ConsentSwitch) => (p === "ai_share" ? AI_SHARE_CONSENT_VERSION : CONSENT_TEXTS[p].version);
const defaultOf = (p: ConsentSwitch) => (p === "ai_share" ? false : CONSENT_TEXTS[p].defaultGranted);

async function stateOf(uid: string, purpose: ConsentSwitch): Promise<ConsentState> {
  const entry = await latestEntry(uid, purpose, versionOf(purpose));
  return entry
    ? { purpose, granted: entry.granted, version: versionOf(purpose), at: entry.at }
    : { purpose, granted: defaultOf(purpose), version: null, at: null };
}

async function signedIn(request: NextRequest) {
  const limited = checkRequestRate(request, LIMITS);
  if (limited) return limited;
  const uid = await verifiedUid(request);
  if (uid instanceof NextResponse) return uid;
  if (overUserCap("account-consents", uid, 100)) return fail(429, "TOO_MANY");
  return uid;
}

const ledgerDown = (err: unknown) => {
  console.error("account/consents: ledger unavailable:", (err as Error)?.name ?? "unknown", (err as { code?: unknown })?.code ?? "");
  return fail(500, "LEDGER_UNAVAILABLE");
};

export async function GET(request: NextRequest) {
  const uid = await signedIn(request);
  if (uid instanceof NextResponse) return uid;
  try {
    return NextResponse.json({ consents: await withLedgerTimeout(Promise.all(SWITCHES.map((p) => stateOf(uid, p)))) });
  } catch (err) {
    return ledgerDown(err);
  }
}

export async function POST(request: NextRequest) {
  const uid = await signedIn(request);
  if (uid instanceof NextResponse) return uid;
  const parsed = BodySchema.safeParse(await smallJson(request));
  if (!parsed.success) return fail(400, "BAD_REQUEST");
  const { purpose, granted, version } = parsed.data;
  const text = CONSENT_TEXTS[purpose];
  if (version !== text.version) return fail(409, "VERSION_STALE");
  try {
    // The same markers the Firestore rules check for client writes (H04, H24).
    const [erased, under18] = await Promise.all([
      adminDb().collection("erasedAccounts").doc(uid).get(),
      adminDb().collection("under18Accounts").doc(uid).get(),
    ]);
    if (erased.exists || under18.exists) return fail(403, "NOT_ALLOWED");
    await appendConsent(uid, { purpose, granted, version: text.version, copy: text.copy, scanId: null, source: "consent_route" });
    // The entry just written is the newest, so it is the state (its stored time is the server's, within a moment of this one).
    const state: ConsentState = { purpose, granted, version: text.version, at: new Date().toISOString() };
    return NextResponse.json(state);
  } catch (err) {
    return ledgerDown(err);
  }
}
