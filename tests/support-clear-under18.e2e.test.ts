import { describe, expect, it } from "vitest";

// H05: the owner's script to clear a mistaken under-18 record, against the
// local stack's emulators (Auth + Firestore). Made-up user only. It changes
// nothing unless CLEAR is typed, and then only adds one ledger entry and
// removes the marker.
const STACK = !!process.env.FIRESTORE_EMULATOR_HOST && !!process.env.FIREBASE_AUTH_EMULATOR_HOST;

describe.skipIf(!STACK)("scripts/clear-under18.ts (H05)", () => {
  const PHONE = "+919999900199";

  async function under18User() {
    const { adminAuth } = await import("@/lib/firebase/admin");
    const { appendConsent } = await import("@/app/api/account/_ledger");
    const { AGE_ATTESTATION_COPY, AGE_ATTESTATION_VERSION } = await import("@/lib/consent");
    const existing = await adminAuth().getUserByPhoneNumber(PHONE).catch(() => null);
    if (existing) await adminAuth().deleteUser(existing.uid);
    const { uid } = await adminAuth().createUser({ phoneNumber: PHONE });
    await appendConsent(uid, { purpose: "age_18_plus", granted: false, version: AGE_ATTESTATION_VERSION, copy: AGE_ATTESTATION_COPY, scanId: null, source: "attestation_route" });
    return uid;
  }

  const ledgerCount = async (uid: string) => {
    const { adminDb } = await import("@/lib/firebase/admin");
    return (await adminDb().collection("users").doc(uid).collection("consentLedger").get()).size;
  };

  it("prints the plan and changes nothing unless CLEAR is typed", async () => {
    const { main } = await import("../scripts/clear-under18");
    const { ageStatus } = await import("@/app/api/account/_ledger");
    const uid = await under18User();
    const lines: string[] = [];
    const code = await main(["--phone", PHONE, "--operator", "test", "--reason", "mis-tap"], async () => "no", (l) => lines.push(l));
    expect(code).toBe(1);
    const out = lines.join("\n");
    expect(out).toMatch(/\(EMULATORS\)/);
    expect(out).toContain(`uid ${uid}`);
    expect(out).toContain("*********0199");
    expect(out).not.toContain(PHONE);
    expect(out).toMatch(/granted=false/);
    expect(out).toMatch(/delete under18Accounts/);
    expect(out).toMatch(/Nothing changed/);
    expect(await ageStatus(uid)).toBe("under18");
    expect(await ledgerCount(uid)).toBe(1);
  });

  it("with CLEAR: one audited entry added, the marker removed, the user asked their age again", async () => {
    const { main } = await import("../scripts/clear-under18");
    const { ageStatus } = await import("@/app/api/account/_ledger");
    const { adminDb } = await import("@/lib/firebase/admin");
    const uid = await under18User();
    const code = await main(["--phone", PHONE, "--operator", "owner", "--reason", "mis-tap, confirmed"], async () => "CLEAR", () => {});
    expect(code).toBe(0);
    expect(await ageStatus(uid)).toBe("missing");
    expect((await adminDb().collection("under18Accounts").doc(uid).get()).exists).toBe(false);
    const entries = (await adminDb().collection("users").doc(uid).collection("consentLedger").get()).docs.map((d) => d.data());
    expect(entries).toHaveLength(2);
    expect(entries.find((e) => e.source === "support_clear")).toMatchObject({ operator: "owner", reason: "mis-tap, confirmed", granted: true });
    expect(entries.find((e) => e.granted === false)).toBeTruthy(); // the original answer is kept
    // Run again: nothing to clear.
    const lines: string[] = [];
    expect(await main(["--uid", uid, "--operator", "owner", "--reason", "again"], async () => "CLEAR", (l) => lines.push(l))).toBe(0);
    expect(lines.join("\n")).toMatch(/Nothing to clear/);
    expect(await ledgerCount(uid)).toBe(2);
  });

  it("refuses without an operator or a reason", async () => {
    const { main } = await import("../scripts/clear-under18");
    expect(await main(["--phone", PHONE], async () => "CLEAR", () => {})).toBe(2);
  });
});
