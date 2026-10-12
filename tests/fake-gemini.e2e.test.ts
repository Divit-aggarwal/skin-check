// The local Gemini stand-in (scripts/fake-gemini.mjs) on the running stack:
// today's Echo answers through it, and the recorded request carries no phone,
// uid or name. Skipped unless scripts/local-stack.sh started the stack.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { emulatorPhoneSignIn } from "./e2e-auth";
import { adminDb } from "@/lib/firebase/admin";
import { echoScanIdFrom } from "@/components/dashboard/state";

const WEB = process.env.LOCAL_STACK_WEB;
const RAVI = { uid: "seed-user-ravi", phoneNumber: "+919999900002" };

describe.skipIf(!WEB)("fake Gemini on the local stack", () => {
  it("Echo calls it, and the recorded request has no phone, uid, name, city, position or push subscription (TD-47)", async () => {
    // Ravi's newest measured check (F13: Echo answers only about that one), a
    // seeded check with quiz answers including the name "Ravi", which must never be sent.
    const analyses = (await adminDb().collection("users").doc(RAVI.uid).collection("scanAnalyses").get()).docs.map((d) => ({ id: d.id, data: d.data() }));
    const scanId = echoScanIdFrom(RAVI.uid, analyses);
    expect(scanId).not.toBeNull();

    // TD-47: a city, a rounded position, both choices and a push subscription on the account, none of which may reach Gemini.
    const ravi = adminDb().collection("users").doc(RAVI.uid);
    await ravi.collection("settings").doc("home").set({ location: "allowed", reminders: "allowed", city: { name: "ZZCITYZZ", region: "ZZREGIONZZ", country: "India", latE1: 131, lonE1: 803, source: "device" } });
    await ravi.collection("pushSubscriptions").doc("zz").set({ endpoint: "https://fcm.googleapis.com/fcm/send/ZZPUSHZZ", timeZone: "Asia/Kolkata" });

    const { idToken } = await emulatorPhoneSignIn(RAVI.phoneNumber);
    const res = await fetch(`${WEB}/api/skin-check/chat`, {
      method: "POST",
      headers: { authorization: `Bearer ${idToken}`, "content-type": "application/json" },
      body: JSON.stringify({ scanId, region: "cheeks", message: "what does oiliness mean?", history: [] }),
    });
    expect(res.status).toBe(200);
    // On the context path the stand-in's plain sentence is not valid structured
    // output, so the validator gives the fixed fallback; on today's Echo it is the reply.
    expect(typeof (await res.json()).reply).toBe("string");

    const lines = readFileSync(".local-stack/fake-gemini/requests.jsonl", "utf8").trim().split("\n");
    const last = lines.at(-1)!;
    expect(last).toContain("what does oiliness mean?");
    for (const banned of [RAVI.phoneNumber, "9999900002", RAVI.uid, "Ravi", "ZZCITYZZ", "ZZREGIONZZ", "ZZPUSHZZ", "latE1", "lonE1"]) expect(last, banned).not.toContain(banned);
    // Nothing of the Home settings in any request this run, not only the last one.
    for (const line of lines) for (const banned of ["ZZCITYZZ", "ZZPUSHZZ", "latE1"]) expect(line, banned).not.toContain(banned);
  }, 60_000);
});
