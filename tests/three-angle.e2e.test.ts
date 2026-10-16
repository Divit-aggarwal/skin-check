// mm:be3 end to end against the local stack (npm run test:local). Skipped
// unless scripts/local-stack.sh started the stack. Its own user, created here
// (never Asha or Ravi, whose counts other files pin), goes through the real dev
// server, the 0.1.6 engine, S3Mock and the Firestore emulator with real rules:
// C10 three-angle upload, save, and each angle read back (only the front is
// analysed); then E19 check-ins, and the account erase removing them.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { emulatorPhoneSignIn } from "./e2e-auth";

const WEB = process.env.LOCAL_STACK_WEB;
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const FACE = process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png";
const USER = { uid: "mm-be3-three-angle", phoneNumber: "+919999900301" };

describe.skipIf(!WEB)("mm:be3 three-angle photos and check-ins end to end", () => {
  it("uploads three angles, saves the check, reads each angle back; check-ins are once a week and erased with the account", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "demo-api-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", `${PROJECT}.firebaseapp.com`);
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:000000000000:web:0000000000000000");
    const { auth } = await import("@/lib/firebase/client");
    const { signInWithCustomToken } = await import("firebase/auth");
    const { initializeApp } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const { getFirestore } = await import("firebase-admin/firestore");
    const { saveSkinCheck } = await import("@/lib/firebase/skin-checks");
    const { eraseSteps } = await import("@/lib/erase");
    const { IMAGE_RETENTION_CONSENT_VERSION, PROCESSING_CONSENT_VERSION } = await import("@/lib/consent");

    const app = initializeApp({ projectId: PROJECT! }, `be3-e2e-${Date.now()}`);
    const admin = getAuth(app);
    const db = getFirestore(app);
    await admin.createUser(USER);
    const signedIn = await emulatorPhoneSignIn(USER.phoneNumber);
    expect(signedIn.localId).toBe(USER.uid);
    const bearer = { authorization: `Bearer ${signedIn.idToken}` };
    const json = { ...bearer, "content-type": "application/json" };
    await signInWithCustomToken(auth(), await admin.createCustomToken(USER.uid));

    // 1. Three angles, each through its own presign, each different bytes.
    const scanId = `be3-${Date.now()}`;
    const face = readFileSync(FACE);
    const bytes = { front: face, left: Buffer.concat([face, Buffer.from("left")]), right: Buffer.concat([face, Buffer.from("right!")]) };
    for (const angle of ["front", "left", "right"] as const) {
      const presign = await fetch(`${WEB}/api/skin-scan/upload`, {
        method: "POST",
        headers: json,
        body: JSON.stringify({ scanId, angle, contentLength: bytes[angle].length, imageRetentionConsent: true, imageRetentionConsentVersion: IMAGE_RETENTION_CONSENT_VERSION }),
      });
      expect(presign.status, angle).toBe(200);
      const { uploadUrl, key, contentType } = (await presign.json()) as { uploadUrl: string; key: string; contentType: string };
      expect(key).toBe(`users/${USER.uid}/scans/${scanId}/${angle === "front" ? "original" : angle}.jpg`);
      expect((await fetch(uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: bytes[angle] })).status).toBe(200);
    }

    // 2. The scan: only the front goes to the engine (the analysis record's hash is the front's).
    const form = new FormData();
    form.append("image", new Blob([face], { type: "image/png" }), "face.png");
    form.append("scanId", scanId);
    form.append("captureMethod", "native");
    form.append("processingConsentVersion", PROCESSING_CONSENT_VERSION);
    const scan = await fetch(`${WEB}/api/skin-scan`, { method: "POST", headers: bearer, body: form });
    expect(scan.status).toBe(200);
    const body = (await scan.json()) as { persisted: boolean; result: Record<string, unknown> };
    expect(body.persisted).toBe(true);
    const analyses = (await db.collection("users").doc(USER.uid).collection("scanAnalyses").get()).docs.map((d) => d.data());
    expect(analyses.map((a) => a.inputSha256)).toEqual([createHash("sha256").update(face).digest("hex")]);

    // 3. Save the check the way the client does (real rules), with both sides kept.
    await saveSkinCheck(
      USER.uid,
      scanId,
      { skin_type: "combination" },
      { status: "success", result: body.result as never, photo: new Blob([face]), captureMethod: "native", originalStored: true, retentionConsentVersion: IMAGE_RETENTION_CONSENT_VERSION },
      {},
      { left: true, right: true }
    );
    const saved = (await db.collection("users").doc(USER.uid).collection("skinChecks").doc(scanId).get()).data();
    expect(saved?.sideImages).toEqual({
      left: { stored: true, storage: "s3", key: `users/${USER.uid}/scans/${scanId}/left.jpg` },
      right: { stored: true, storage: "s3", key: `users/${USER.uid}/scans/${scanId}/right.jpg` },
    });

    // 4. Each angle reads back as its own bytes; an unknown angle is a 404.
    for (const angle of ["front", "left", "right"] as const) {
      const photo = await fetch(`${WEB}/api/checks/photo?scanId=${scanId}${angle === "front" ? "" : `&angle=${angle}`}`, { headers: bearer });
      expect(photo.status, angle).toBe(200);
      const { url } = (await photo.json()) as { url: string };
      expect(Buffer.from(await (await fetch(url)).arrayBuffer()).equals(bytes[angle]), angle).toBe(true);
    }
    expect((await fetch(`${WEB}/api/checks/photo?scanId=${scanId}&angle=back`, { headers: bearer })).status).toBe(404);

    // 5. Check-ins: one this week (tied to this check), a second is 409, GET lists it.
    const checkin = () =>
      fetch(`${WEB}/api/checkins`, { method: "POST", headers: json, body: JSON.stringify({ answers: { overall: "no_change", skin_feel: "oily" }, scanId, timeZone: "Asia/Kolkata" }) });
    const first = await checkin();
    expect(first.status).toBe(201);
    const record = (await first.json()) as { checkinId: string; scanId: string };
    expect(record.checkinId).toMatch(/^\d{4}-W\d{2}$/);
    expect(record.scanId).toBe(scanId);
    expect((await checkin()).status).toBe(409);
    const listed = (await (await fetch(`${WEB}/api/checkins`, { headers: bearer })).json()) as { checkins: { checkinId: string }[] };
    expect(listed.checkins.map((c) => c.checkinId)).toEqual([record.checkinId]);

    // 6. The account erase's Firestore step removes the check-ins with the rest of users/{uid}.
    const checkins = () => db.collection("users").doc(USER.uid).collection("checkins").get();
    expect((await checkins()).size).toBe(1);
    await eraseSteps(USER.uid).firestore();
    expect((await checkins()).size).toBe(0);
    expect((await db.collection("users").doc(USER.uid).listCollections()).length).toBe(0);
    await eraseSteps(USER.uid).auth();
  }, 240_000); // the first requests compile the routes in next dev
});
