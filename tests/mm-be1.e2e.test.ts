// G31 and H36 (mm:be1) end to end against the local stack (npm run test:local).
// Skipped unless scripts/local-stack.sh started the stack and set
// LOCAL_STACK_WEB. Its own fresh phone user (no seed), erased at the end.
import { describe, expect, it } from "vitest";
import { emulatorPhoneSignIn } from "./e2e-auth";
import { CONSENT_TEXTS, type ConsentState } from "@/lib/feature-contracts/consents";

const WEB = process.env.LOCAL_STACK_WEB;
const PROJECT = process.env.FIREBASE_PROJECT_ID;

describe.skipIf(!WEB)("mm:be1: consents and notification switches end to end", () => {
  it("grant then withdraw marketing, read back; save switches; erase removes settings/notifications", async () => {
    const { initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const db = getFirestore(initializeApp({ projectId: PROJECT! }, `mm-be1-e2e-${Date.now()}`));
    const { idToken, localId: uid } = await emulatorPhoneSignIn("+919999900451");
    const headers = { authorization: `Bearer ${idToken}`, "content-type": "application/json" };
    const consent = (granted: boolean) =>
      fetch(`${WEB}/api/account/consents`, { method: "POST", headers, body: JSON.stringify({ purpose: "marketing", granted, version: CONSENT_TEXTS.marketing.version }) });
    const marketing = async () =>
      ((await (await fetch(`${WEB}/api/account/consents`, { headers })).json()) as { consents: ConsentState[] }).consents.find((c) => c.purpose === "marketing")!;

    expect(await marketing()).toEqual({ purpose: "marketing", granted: false, version: null, at: null });
    expect((await consent(true)).status).toBe(200);
    expect(await marketing()).toMatchObject({ granted: true, version: CONSENT_TEXTS.marketing.version });
    expect((await consent(false)).status).toBe(200);
    const after = await marketing();
    expect(after).toMatchObject({ granted: false, version: CONSENT_TEXTS.marketing.version });
    expect(after.at).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect((await db.collection("users").doc(uid).collection("consentLedger").where("purpose", "==", "marketing").get()).size).toBe(2);

    // Marketing withdrawn: switching it on is refused.
    const prefs = (body: unknown) => fetch(`${WEB}/api/account/notifications`, { method: "PATCH", headers, body: JSON.stringify(body) });
    expect((await (await prefs({ types: { marketing: true } })).json()).code).toBe("NEEDS_CONSENT");
    expect((await prefs({ types: { weekly_checkin: true }, weeklyCheckinDay: 2 })).status).toBe(200);
    const read = await (await fetch(`${WEB}/api/account/notifications`, { headers })).json();
    expect(read.types).toMatchObject({ weekly_checkin: true, marketing: false });
    expect(read.weeklyCheckinDay).toBe(2);
    const ref = db.collection("users").doc(uid).collection("settings").doc("notifications");
    expect((await ref.get()).exists).toBe(true);

    // H01: account erase takes settings/notifications with the rest of users/{uid}.
    const erased = await fetch(`${WEB}/api/account/erase`, { method: "POST", headers, body: JSON.stringify({ confirm: "DELETE MY DATA" }) });
    expect(erased.status).toBe(200);
    expect((await ref.get()).exists).toBe(false);
  }, 60_000);
});
