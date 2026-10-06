// Capture lane end to end (O-2 = A): a scan posted with captureQuality through
// the real dev server, local engine 0.1.6 and Firestore emulator reads back
// unchanged from scanAnalyses; a malformed value is dropped and the scan still
// succeeds. Also reads the capture seed. Skipped unless scripts/local-stack.sh
// started the stack. Uses seed-user-ravi: seed-user-asha's counts belong to
// tests/local-stack.e2e.test.ts.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PROCESSING_CONSENT_VERSION } from "@/lib/consent";

const WEB = process.env.LOCAL_STACK_WEB;
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = process.env.FIREBASE_PROJECT_ID;
const FACE = process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png";
const UID = "seed-user-ravi";

async function idTokenFor(phoneNumber: string): Promise<string> {
  const idp = `http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1`;
  const json = (r: Response) => r.json() as Promise<Record<string, unknown>>;
  const sent = await fetch(`${idp}/accounts:sendVerificationCode?key=demo-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ phoneNumber, recaptchaToken: "emulator" }),
  }).then(json);
  const codes = (await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/verificationCodes`).then(json)) as {
    verificationCodes: { sessionInfo: string; code: string }[];
  };
  const code = codes.verificationCodes.find((c) => c.sessionInfo === sent.sessionInfo)!.code;
  const signedIn = await fetch(`${idp}/accounts:signInWithPhoneNumber?key=demo-api-key`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionInfo: sent.sessionInfo, code }),
  }).then(json);
  expect(signedIn.localId).toBe(UID);
  return signedIn.idToken as string;
}

describe.skipIf(!WEB)("capture lane end to end", () => {
  it("stores captureQuality with the analysis, drops a malformed one, and the seed is never comparable", async () => {
    const { initializeApp } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const { runCaptureGate } = await import("@/lib/capture-quality/gate");
    const { checkerboard } = await import("@/lib/capture-quality/synthetic-frames");
    const { toSkinState } = await import("@/lib/skin-state");
    const { compareStates } = await import("@/lib/comparability");

    const bearer = { authorization: `Bearer ${await idTokenFor("+919999900002")}` };
    const db = getFirestore(initializeApp({ projectId: PROJECT! }, `capture-e2e-${Date.now()}`));
    const analyses = db.collection("users").doc(UID).collection("scanAnalyses");
    const face = readFileSync(FACE);
    const quality = runCaptureGate(checkerboard(400, 400, 1, 100, 156), { captureMethod: "native", retakeCount: 0 });

    const scan = async (scanId: string, captureQuality: string) => {
      const form = new FormData();
      form.append("image", new Blob([face], { type: "image/png" }), "face.png");
      form.append("scanId", scanId);
      form.append("captureMethod", "native");
      form.append("captureQuality", captureQuality);
      form.append("processingConsentVersion", PROCESSING_CONSENT_VERSION); // privacy step 14 (R4)
      const res = await fetch(`${WEB}/api/skin-scan`, { method: "POST", headers: bearer, body: form });
      expect(res.status).toBe(200);
      expect(await res.json()).toMatchObject({ ok: true, persisted: true });
      const snap = await analyses.where("scanId", "==", scanId).get();
      expect(snap.size).toBe(1);
      return { path: snap.docs[0]!.ref.path, data: snap.docs[0]!.data() };
    };

    // 1. A valid result reads back unchanged; the record is still a skinstate-1 source.
    const ok = await scan(`capture-e2e-${Date.now()}`, JSON.stringify(quality));
    expect(ok.data.captureQuality).toEqual(quality);
    const state = toSkinState(ok.data, ok.path, UID);
    expect(state.kind).toBe("skinstate");
    if (state.kind === "skinstate") {
      expect(state.state.quality).toMatchObject({ blur: null, exposure: null, pose: null, faceScale: null, occlusion: null, device: null });
    }

    // 2. A malformed value is dropped; the scan still succeeds (own scanId, so not an ALREADY_EXISTS hit).
    const bad = await scan(`capture-e2e-bad-${Date.now()}`, JSON.stringify({ ...quality, schemaVersion: 2 }));
    expect(bad.data).not.toHaveProperty("captureQuality");

    // 3. The capture seed: every record is a SkinState, and no pair is comparable today.
    const seeded = await analyses.where("scanId", ">=", "seed-capture-").where("scanId", "<", "seed-capture.").get();
    expect(seeded.size).toBe(6);
    const states = seeded.docs
      .sort((a, b) => String(a.get("scanId")).localeCompare(String(b.get("scanId"))))
      .map((d) => toSkinState(d.data(), d.ref.path, UID));
    for (const s of states) expect(s.kind).toBe("skinstate");
    const ss = states.flatMap((s) => (s.kind === "skinstate" ? [s.state] : []));
    expect(compareStates(ss[0]!, ss[1]!, "colour.native.lStarMean", "cheeks")).toMatchObject({ verdict: "not_comparable", reasons: expect.arrayContaining(["pipeline_version_differs"]) });
    expect(compareStates(ss[2]!, ss[3]!, "colour.native.lStarMean", "cheeks")).toMatchObject({ verdict: "not_comparable", reasons: expect.arrayContaining(["native_stats_missing"]) });
    expect(compareStates(ss[4]!, ss[5]!, "colour.native.lStarMean", "nose")).toMatchObject({ verdict: "not_comparable", reasons: expect.arrayContaining(["region_absent"]) });
  }, 240_000);
});
