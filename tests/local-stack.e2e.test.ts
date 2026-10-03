// End to end against the local stack (npm run test:local; tracker B01).
// Skipped unless scripts/local-stack.sh started the stack and set
// LOCAL_STACK_WEB. No UI: a seeded user signs in by phone through the Auth
// emulator (REST; the Node build of firebase/auth has no phone provider), the
// client SDK signs in as the same user with an emulator custom token, then the
// scan goes through the real dev server,
// the local 0.1.6 engine, S3Mock and the Firestore emulator with real rules.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { ListObjectsV2Command, S3Client } from "@aws-sdk/client-s3";

const WEB = process.env.LOCAL_STACK_WEB;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const FACE = process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png";

describe.skipIf(!WEB)("local stack end to end", () => {
  it("signs in a seeded user, scans, stores the original and saves to the emulator", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "demo-api-key");
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", `${PROJECT}.firebaseapp.com`);
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_APP_ID", "1:000000000000:web:0000000000000000");
    const { auth, db } = await import("@/lib/firebase/client");
    const { signInWithCustomToken } = await import("firebase/auth");
    const { initializeApp } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const { collection, getDocs } = await import("firebase/firestore");
    const { saveSkinCheck, listSkinChecks } = await import("@/lib/firebase/skin-checks");
    const { IMAGE_RETENTION_CONSENT_VERSION } = await import("@/lib/consent");

    // 1. Sign in seeded user Asha: the emulator issues the code, the real SDK signs in.
    const idp = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
    const phoneNumber = "+15555550101";
    const sent = await fetch(`${idp}/accounts:sendVerificationCode?key=demo-api-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phoneNumber, recaptchaToken: "emulator" }),
    }).then((r) => r.json() as Promise<{ sessionInfo: string }>);
    const codes = await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/verificationCodes`)
      .then((r) => r.json() as Promise<{ verificationCodes: { sessionInfo: string; code: string }[] }>);
    const code = codes.verificationCodes.find((c) => c.sessionInfo === sent.sessionInfo)!.code;
    const signedIn = await fetch(`${idp}/accounts:signInWithPhoneNumber?key=demo-api-key`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionInfo: sent.sessionInfo, code }),
    }).then((r) => r.json() as Promise<{ idToken: string; localId: string }>);
    expect(signedIn.localId).toBe("seed-user-asha");
    const bearer = { authorization: `Bearer ${signedIn.idToken}` };
    const admin = getAuth(initializeApp({ projectId: PROJECT! }, `e2e-${Date.now()}`));
    const { user } = await signInWithCustomToken(auth(), await admin.createCustomToken(signedIn.localId));
    expect(user.uid).toBe("seed-user-asha");

    // 2. Presign through the app, upload the original to S3Mock.
    const scanId = `e2e-${Date.now()}`;
    const face = readFileSync(FACE);
    const presign = await fetch(`${WEB}/api/skin-scan/upload`, {
      method: "POST",
      headers: { ...bearer, "content-type": "application/json" },
      body: JSON.stringify({ scanId, imageRetentionConsent: true, imageRetentionConsentVersion: IMAGE_RETENTION_CONSENT_VERSION }),
    });
    expect(presign.status).toBe(200);
    const { uploadUrl, key, contentType } = (await presign.json()) as { uploadUrl: string; key: string; contentType: string };
    expect(new URL(uploadUrl).hostname).toBe("127.0.0.1");
    expect((await fetch(uploadUrl, { method: "PUT", headers: { "content-type": contentType }, body: face })).status).toBe(200);
    const s3 = new S3Client({
      region: "ap-south-1", endpoint: process.env.S3_SKIN_IMAGES_ENDPOINT!, forcePathStyle: true,
      credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" },
    });
    const listed = await s3.send(new ListObjectsV2Command({ Bucket: "skin-originals-dev", Prefix: key }));
    expect(listed.KeyCount).toBe(1);

    // 3. Scan through the app -> local engine 0.1.6 -> scanAnalyses (Admin SDK).
    const form = new FormData();
    form.append("image", new Blob([face], { type: "image/png" }), "face.png");
    form.append("scanId", scanId);
    form.append("captureMethod", "native");
    const scan = await fetch(`${WEB}/api/skin-scan`, { method: "POST", headers: bearer, body: form });
    expect(scan.status).toBe(200);
    const body = (await scan.json()) as { ok: boolean; persisted: boolean; result: Record<string, unknown> };
    expect(body.persisted).toBe(true);
    expect(body.result.pipeline_version).toBe("scan-0.1.6-provisional");
    expect(body.result.engine_build).toBe("sha-8dc37dc501ea974825427c665acd7019120c20ec");

    // 4. Save the Skin Check the way the client does (rules enforced by the emulator).
    await saveSkinCheck(user.uid, scanId, { skin_type: "combination" }, {
      status: "success",
      result: body.result as never,
      photo: new Blob([face]),
      captureMethod: "native",
      originalStored: true,
      retentionConsentVersion: IMAGE_RETENTION_CONSENT_VERSION,
    });

    // 5. Confirm it is in the emulator: 3 seeded scans + this one, and the analysis record.
    const saved = await listSkinChecks(user.uid);
    expect(saved).toHaveLength(4);
    expect(saved.find((s) => s.scanId === scanId)).toMatchObject({ status: "completed", imageStored: true, hasResult: true });
    const analyses = await getDocs(collection(db(), "users", user.uid, "scanAnalyses"));
    const record = analyses.docs.map((d) => d.data()).find((d) => d.scanId === scanId);
    expect(record).toMatchObject({ source: "server", engine_build: "sha-8dc37dc501ea974825427c665acd7019120c20ec", captureMethod: "native" });
    expect(record?.region_raw_native).toBeTruthy();

    // 6. Echo uses only the dev key: without GEMINI_DEV_API_KEY it is misconfigured, never the production key.
    const chat = await fetch(`${WEB}/api/skin-check/chat`, { method: "POST", headers: { ...bearer, "content-type": "application/json" }, body: "{}" });
    if (chat.status === 500) expect(((await chat.json()) as { code: string }).code).toBe("CHAT_MISCONFIGURED");
    else expect(chat.status).toBe(400); // a dev key is set: auth passed, the empty body is rejected
    expect((await fetch(`${WEB}/api/skin-check/chat`, { method: "POST", body: "{}" })).status).toBe(401);
  }, 240_000);
});
