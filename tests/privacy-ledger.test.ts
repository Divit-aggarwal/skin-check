import { beforeEach, describe, expect, it, vi } from "vitest";

// The consent ledger helpers against an in-memory Firestore that records every
// call, so the tests can assert .create() is the only write.
const { docs, calls } = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  calls: [] as string[],
}));

let autoId = 0;
function fakeCollection(path: string) {
  return {
    doc: (id?: string) => {
      const docPath = `${path}/${id ?? `auto-${++autoId}`}`;
      return {
        collection: (name: string) => fakeCollection(`${docPath}/${name}`),
        create: async (data: Record<string, unknown>) => {
          calls.push(`create ${docPath}`);
          if (docs.has(docPath)) throw new Error("ALREADY_EXISTS");
          docs.set(docPath, data);
        },
        set: async () => calls.push(`set ${docPath}`),
        update: async () => calls.push(`update ${docPath}`),
      };
    },
    where: (field: string, _op: "==", value: unknown) => ({
      get: async () => {
        calls.push(`query ${path} ${field}==${String(value)}`);
        const matching = Array.from(docs.entries()).filter(
          ([p, d]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/") && d[field] === value
        );
        return { docs: matching.map(([, d]) => ({ data: () => d })) };
      },
    }),
  };
}

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({ collection: (name: string) => fakeCollection(name) }) }));

import { ageStatus, appendConsent, latestGrant, sha256, withLedgerTimeout } from "@/app/api/account/_ledger";
import { FieldValue } from "firebase-admin/firestore";

const ts = (ms: number) => ({ toMillis: () => ms });
function seed(uid: string, id: string, fields: Record<string, unknown>) {
  docs.set(`users/${uid}/consentLedger/${id}`, { schemaVersion: 1, version: "v1", ...fields });
}

beforeEach(() => {
  docs.clear();
  calls.length = 0;
});

describe("appendConsent", () => {
  it("writes the exact §2.1 shape with .create() under the given uid", async () => {
    await appendConsent("uid-a", {
      purpose: "image_retention",
      granted: true,
      version: "skin image retention version 1",
      copy: "the copy",
      scanId: "scan-12345678",
      source: "presign",
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatch(/^create users\/uid-a\/consentLedger\/auto-\d+$/);
    const [written] = Array.from(docs.values());
    expect(written).toEqual({
      schemaVersion: 1,
      purpose: "image_retention",
      granted: true,
      version: "skin image retention version 1",
      copySha256: sha256("the copy"),
      scanId: "scan-12345678",
      source: "presign",
      recordedAt: FieldValue.serverTimestamp(),
    });
    expect(written!.copySha256).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("latestGrant", () => {
  it("returns the newest entry at the given version, from an equality-only query", async () => {
    seed("u", "1", { purpose: "ai_share", granted: true, recordedAt: ts(1) });
    seed("u", "2", { purpose: "ai_share", granted: false, recordedAt: ts(2) });
    expect(await latestGrant("u", "ai_share", "v1")).toBe(false);
    expect(calls).toEqual(["query users/u/consentLedger purpose==ai_share"]);
  });

  it("a grant after a withdrawal counts", async () => {
    seed("u", "1", { purpose: "ai_share", granted: false, recordedAt: ts(1) });
    seed("u", "2", { purpose: "ai_share", granted: true, recordedAt: ts(2) });
    expect(await latestGrant("u", "ai_share", "v1")).toBe(true);
  });

  it("ignores entries at another version, other purposes and other users", async () => {
    seed("u", "1", { purpose: "ai_share", granted: true, version: "old", recordedAt: ts(1) });
    seed("u", "2", { purpose: "image_retention", granted: true, recordedAt: ts(2) });
    seed("other", "3", { purpose: "ai_share", granted: true, recordedAt: ts(3) });
    expect(await latestGrant("u", "ai_share", "v1")).toBeNull();
  });
});

describe("ageStatus", () => {
  it("missing when there are no entries", async () => {
    expect(await ageStatus("u")).toBe("missing");
  });

  it("over18 when every entry attests 18+", async () => {
    seed("u", "1", { purpose: "age_18_plus", granted: true, recordedAt: ts(1) });
    expect(await ageStatus("u")).toBe("over18");
  });

  it("sticky: an under-18 entry wins over a later 18+ entry (decision 4)", async () => {
    seed("u", "1", { purpose: "age_18_plus", granted: false, recordedAt: ts(1) });
    seed("u", "2", { purpose: "age_18_plus", granted: true, recordedAt: ts(2) });
    expect(await ageStatus("u")).toBe("under18");
  });
});

describe("withLedgerTimeout", () => {
  it("rejects a hung promise after the ceiling", async () => {
    await expect(withLedgerTimeout(new Promise(() => {}), 10)).rejects.toThrow(/timed out/);
  });

  it("passes a fast result through", async () => {
    await expect(withLedgerTimeout(Promise.resolve(7), 10)).resolves.toBe(7);
  });
});
