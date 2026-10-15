// H37 data export end to end against the local stack (npm run test:local).
// Skipped unless scripts/local-stack.sh started the stack and set
// LOCAL_STACK_WEB. Seeds its own two users here (no lane seed file), so it
// touches no other test's users and test-file order doesn't matter.
import { describe, expect, it } from "vitest";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { emulatorPhoneSignIn } from "./e2e-auth";
import { scanImageKey } from "@/lib/s3-key";
import { sideImageKey } from "@/lib/feature-contracts/check-photos";
import type { DataExport } from "@/lib/feature-contracts/data-export";

const WEB = process.env.LOCAL_STACK_WEB;
const PROJECT = process.env.FIREBASE_PROJECT_ID;

const A = { uid: "mm-be2-export-a", phoneNumber: "+919999937201", scanId: "3b241101-e2bb-4255-8caf-4136c566a962", canary: "ZZEXPORTAZZ" };
const B = { uid: "mm-be2-export-b", phoneNumber: "+919999937202", scanId: "9f0b1e2c-5a4d-4c3b-8e7f-1a2b3c4d5e6f", canary: "ZZEXPORTBZZ" };

describe.skipIf(!WEB)("account export end to end", () => {
  it("each user gets their own data and photo links, and never the other user's", async () => {
    const { initializeApp } = await import("firebase-admin/app");
    const { getAuth } = await import("firebase-admin/auth");
    const { getFirestore, Timestamp } = await import("firebase-admin/firestore");
    const app = initializeApp({ projectId: PROJECT! }, `export-e2e-${Date.now()}`);
    const db = getFirestore(app);
    const s3 = new S3Client({
      region: "ap-south-1",
      endpoint: process.env.S3_SKIN_IMAGES_ENDPOINT!,
      forcePathStyle: true,
      credentials: { accessKeyId: "local-dev", secretAccessKey: "local-dev" },
    });

    for (const u of [A, B]) {
      await getAuth(app).createUser({ uid: u.uid, phoneNumber: u.phoneNumber });
      const ref = db.collection("users").doc(u.uid);
      await ref.collection("skinChecks").doc(u.scanId).set({
        createdAt: Timestamp.fromDate(new Date("2026-10-01T10:00:00Z")),
        note: u.canary,
        image: { stored: true, storage: "s3", key: scanImageKey(u.uid, u.scanId) },
        sideImages: { left: { stored: true, storage: "s3", key: sideImageKey(u.uid, u.scanId, "left") }, right: { stored: false } },
      });
      await ref.collection("chatTurns").doc("t1").set({ text: u.canary });
      for (const key of [scanImageKey(u.uid, u.scanId), sideImageKey(u.uid, u.scanId, "left")]) {
        await s3.send(new PutObjectCommand({ Bucket: "skin-originals-dev", Key: key, Body: `${u.canary}:${key}`, ContentType: "image/jpeg" }));
      }
    }

    const exportOf = async (u: typeof A) => {
      const { idToken } = await emulatorPhoneSignIn(u.phoneNumber);
      const res = await fetch(`${WEB}/api/account/export`, { headers: { authorization: `Bearer ${idToken}` } });
      expect(res.status).toBe(200);
      expect(res.headers.get("content-disposition")).toMatch(/^attachment; filename="project-skin-data-\d{4}-\d{2}-\d{2}\.json"$/);
      expect(res.headers.get("cache-control")).toContain("no-store");
      return { file: (await res.json()) as DataExport, idToken };
    };

    const { file: a } = await exportOf(A);
    expect(a.uid).toBe(A.uid);
    expect(a.collections.skinChecks).toHaveLength(1);
    expect(a.collections.skinChecks[0]!.data.createdAt).toBe("2026-10-01T10:00:00.000Z");
    expect(a.collections.chatTurns).toEqual([{ id: "t1", data: { text: A.canary } }]);
    expect(a.collections.checkins).toEqual([]);
    expect(a.photos.map((p) => p.angle).sort()).toEqual(["front", "left"]);
    // The signed links really fetch A's own objects from storage.
    for (const p of a.photos) {
      const photo = await fetch(p.url);
      expect(photo.status).toBe(200);
      expect(await photo.text()).toMatch(new RegExp(`^${A.canary}:users/${A.uid}/`));
    }
    const aText = JSON.stringify(a);
    expect(aText).not.toContain(B.canary);
    expect(aText).not.toContain(B.uid);

    const { file: b, idToken: bToken } = await exportOf(B);
    expect(JSON.stringify(b)).not.toContain(A.canary);
    expect(JSON.stringify(b)).not.toContain(A.uid);

    // No token: 401. An erased account: 403 (the marker alone, set by hand,
    // due a day from now so no erase sweep in another test picks B up).
    expect((await fetch(`${WEB}/api/account/export`)).status).toBe(401);
    await db.collection("erasedAccounts").doc(B.uid).set({ sweepAfter: Timestamp.fromMillis(Date.now() + 86_400_000) });
    const erased = await fetch(`${WEB}/api/account/export`, { headers: { authorization: `Bearer ${bToken}` } });
    expect(erased.status).toBe(403);
    await db.collection("erasedAccounts").doc(B.uid).delete();
  }, 120_000); // the first request compiles the route in next dev
});
