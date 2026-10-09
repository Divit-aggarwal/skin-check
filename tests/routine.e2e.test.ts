// End to end against the local stack (npm run test:local), lane:routine.
// Skipped unless scripts/local-stack.sh started the stack. Seed user Ravi signs
// in by phone through the Auth emulator, then reads and appends routine events
// through the real dev server and the Firestore emulator.
import { describe, expect, it } from "vitest";

const WEB = process.env.LOCAL_STACK_WEB;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = process.env.FIREBASE_PROJECT_ID;

async function phoneSignIn(phoneNumber: string): Promise<{ idToken: string; localId: string }> {
  const idp = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
  const json = { "content-type": "application/json" };
  const sent = await fetch(`${idp}/accounts:sendVerificationCode?key=demo-api-key`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ phoneNumber, recaptchaToken: "emulator" }),
  }).then((r) => r.json() as Promise<{ sessionInfo: string }>);
  const codes = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/verificationCodes`)
    .then((r) => r.json() as Promise<{ verificationCodes: { sessionInfo: string; code: string }[] }>);
  const code = codes.verificationCodes.find((c) => c.sessionInfo === sent.sessionInfo)!.code;
  return fetch(`${idp}/accounts:signInWithPhoneNumber?key=demo-api-key`, {
    method: "POST",
    headers: json,
    body: JSON.stringify({ sessionInfo: sent.sessionInfo, code }),
  }).then((r) => r.json() as Promise<{ idToken: string; localId: string }>);
}

describe.skipIf(!WEB)("routine end to end", () => {
  it("a seeded user reads only their own routine and appends a usage event", async () => {
    const ravi = await phoneSignIn("+919999900002");
    expect(ravi.localId).toBe("seed-user-ravi");
    const auth = { authorization: `Bearer ${ravi.idToken}` };

    const before = await fetch(`${WEB}/api/routine/events?tz=Asia/Kolkata`, { headers: auth }).then((r) => r.json());
    expect(before.routine.map((i: { productId: string }) => i.productId)).toEqual(["other-not-ours"]);
    expect(before.events.every((e: { productId: string }) => e.productId !== "protecting-sunscreen")).toBe(true); // Asha's

    const usage = {
      type: "usage",
      eventId: crypto.randomUUID(),
      productId: "other-not-ours",
      effectiveDate: before.today,
      timeZone: "Asia/Kolkata",
      slot: "PM",
      status: "used",
    };
    const post = () =>
      fetch(`${WEB}/api/routine/events`, { method: "POST", headers: { ...auth, "content-type": "application/json" }, body: JSON.stringify(usage) });
    expect((await post()).status).toBe(201);
    expect((await post()).status).toBe(200); // replay

    const after = await fetch(`${WEB}/api/routine/events`, { headers: auth }).then((r) => r.json());
    expect(after.events).toHaveLength(before.events.length + 1);
    const today = after.adherence.days.find((d: { date: string; slot: string }) => d.date === before.today && d.slot === "PM");
    expect(today.status).toBe("used");

    expect((await fetch(`${WEB}/api/routine/events`)).status).toBe(401);
  }, 120_000); // the first request compiles the route in next dev
});
