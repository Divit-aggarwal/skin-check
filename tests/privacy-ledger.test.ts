import { beforeEach, describe, expect, it, vi } from "vitest";

// The consent ledger helpers against an in-memory Firestore that records every
// call, so the tests can assert .create() is the only write.
const { docs, calls, hang, fail } = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  calls: [] as string[],
  hang: { reads: false },
  fail: { reads: false },
}));

// Equality filters and limit only, like the real helpers use.
function fakeQuery(path: string, filters: [string, unknown][], max = Infinity): {
  where: (f: string, op: "==", v: unknown) => ReturnType<typeof fakeQuery>;
  limit: (n: number) => ReturnType<typeof fakeQuery>;
  get: () => Promise<{ empty: boolean; docs: { data: () => Record<string, unknown> }[] }>;
} {
  return {
    where: (f, _op, v) => fakeQuery(path, [...filters, [f, v]], max),
    limit: (n) => fakeQuery(path, filters, n),
    get: async () => {
      if (hang.reads) await new Promise(() => {});
      if (fail.reads) throw new Error("firestore down");
      calls.push(`query ${path} ${filters.map(([f, v]) => `${f}==${String(v)}`).join(" ")}${max < Infinity ? ` limit ${max}` : ""}`);
      const matching = Array.from(docs.entries())
        .filter(([p, d]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/") && filters.every(([f, v]) => d[f] === v))
        .slice(0, max);
      return { empty: matching.length === 0, docs: matching.map(([, d]) => ({ data: () => d })) };
    },
  };
}

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
    where: (field: string, _op: "==", value: unknown) => fakeQuery(path, [[field, value]]),
  };
}

vi.mock("@/lib/firebase/admin", () => ({ adminDb: () => ({ collection: (name: string) => fakeCollection(name) }) }));

import { ageStatus, appendConsent, latestGrant, REQUIRE_AGE_ATTESTATION, scanAgeGate, sha256, withLedgerTimeout } from "@/app/api/account/_ledger";
import { FieldValue } from "firebase-admin/firestore";

const ts = (ms: number) => ({ toMillis: () => ms });
function seed(uid: string, id: string, fields: Record<string, unknown>) {
  docs.set(`users/${uid}/consentLedger/${id}`, { schemaVersion: 1, version: "v1", ...fields });
}

beforeEach(() => {
  hang.reads = false;
  fail.reads = false;
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

describe("scanAgeGate (upload and scan routes)", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  it("decision 3(a): REQUIRE_AGE_ATTESTATION is false", () => {
    expect(REQUIRE_AGE_ATTESTATION).toBe(false);
  });

  it("under-18 record: 403 UNDER_18 in both modes", async () => {
    seed("u", "1", { purpose: "age_18_plus", granted: false, recordedAt: ts(1) });
    for (const mode of [false, true]) {
      const res = await scanAgeGate("u", "test", mode);
      expect(res?.status).toBe(403);
      expect((await res!.json()).code).toBe("UNDER_18");
    }
  });

  it("sticky: under-18 then 18+ is still refused", async () => {
    seed("u", "1", { purpose: "age_18_plus", granted: false, recordedAt: ts(1) });
    seed("u", "2", { purpose: "age_18_plus", granted: true, recordedAt: ts(2) });
    expect((await scanAgeGate("u", "test"))?.status).toBe(403);
  });

  it("no record: goes ahead and logs without the uid (degrade); 403 ATTESTATION_REQUIRED in refuse mode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await scanAgeGate("uid-secret", "test")).toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain("uid-secret");
    const res = await scanAgeGate("uid-secret", "test", true);
    expect(res?.status).toBe(403);
    expect((await res!.json()).code).toBe("ATTESTATION_REQUIRED");
  });

  it("attested 18+: goes ahead", async () => {
    seed("u", "1", { purpose: "age_18_plus", granted: true, recordedAt: ts(1) });
    expect(await scanAgeGate("u", "test", true)).toBeNull();
  });

  it("a failed read goes ahead (D-03)", async () => {
    fail.reads = true;
    expect(await scanAgeGate("u", "test", true)).toBeNull();
  });

  it("reads are fixed-size: a flood of 18+ entries doesn't grow them", async () => {
    for (let i = 0; i < 50; i++) seed("u", `e${i}`, { purpose: "age_18_plus", granted: true, recordedAt: ts(i) });
    calls.length = 0;
    expect(await ageStatus("u")).toBe("over18");
    expect(calls.sort()).toEqual([
      "query users/u/consentLedger purpose==age_18_plus granted==false limit 1",
      "query users/u/consentLedger purpose==age_18_plus limit 1",
    ]);
  });

  it("a hung read goes ahead after the ceiling (D-03)", async () => {
    vi.useFakeTimers();
    hang.reads = true;
    const result = scanAgeGate("u", "test", true);
    await vi.advanceTimersByTimeAsync(2_001);
    expect(await result).toBeNull();
    vi.useRealTimers();
  });
});
