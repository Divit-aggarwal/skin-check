import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Timestamp } from "firebase-admin/firestore";

// E19 /api/checkins. Firebase Admin is an in-memory store keyed by full
// document path; the auth, validation, week id and path-building under test
// are the route's own.
const { verifyFirebaseIdToken, scanAgeGate, store } = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  scanAgeGate: vi.fn(),
  store: new Map<string, Record<string, unknown>>(),
}));

function fakeDb() {
  const collection = (prefix: string) => {
    const rows = () =>
      Array.from(store.entries()).filter(([p]) => p.startsWith(`${prefix}/`) && !p.slice(prefix.length + 1).includes("/"));
    return {
      doc: (id: string) => docRef(`${prefix}/${id}`),
      orderBy: (field: string, dir: "asc" | "desc") => ({
        limit: (n: number) => ({
          get: async () => ({
            docs: rows()
              .map(([, data]) => data)
              .sort((a, b) => ((a[field] as Timestamp).toMillis() - (b[field] as Timestamp).toMillis()) * (dir === "desc" ? -1 : 1))
              .slice(0, n)
              .map((data) => ({ data: () => data })),
          }),
        }),
      }),
    };
  };
  const docRef = (path: string) => ({
    collection: (n: string) => collection(`${path}/${n}`),
    create: async (data: Record<string, unknown>) => {
      if (store.has(path)) throw Object.assign(new Error("exists"), { code: 6 });
      store.set(path, data);
    },
    get: async () => ({ exists: store.has(path), data: () => store.get(path) }),
  });
  return { collection };
}

vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken, adminDb: fakeDb };
});
vi.mock("@/app/api/account/_ledger", () => ({ scanAgeGate }));

import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/checkins/route";
import { bannedWordsIn } from "@/lib/catalog/wording";

const UID = "verified-uid";
const SCAN = "0f8fad5b-d9cb-469f-a165-70867728950e";
const ANSWERS = { overall: "no_change", new_breakouts: "1_2", existing_spots: "fading", routine_changed: "no", skin_feel: "oily" };

let ip = 0;
const headers = (token: string | null = "good") => ({
  "x-forwarded-for": `10.8.0.${++ip % 250}`,
  ...(token ? { authorization: `Bearer ${token}` } : {}),
});
const post = (body: unknown, token: string | null = "good") =>
  POST(new NextRequest("http://localhost/api/checkins", { method: "POST", headers: headers(token), body: JSON.stringify(body) }));
const get = (query = "", token: string | null = "good") => GET(new NextRequest(`http://localhost/api/checkins${query}`, { headers: headers(token) }));
const code = async (r: Response) => ((await r.json()) as { code?: string }).code;
const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.clearAllMocks();
  store.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  at("2026-10-15T06:00:00Z");
  verifyFirebaseIdToken.mockImplementation(async (t: string) => {
    if (t !== "good") throw Object.assign(new Error("bad"), { code: "auth/argument-error" });
    return UID;
  });
  scanAgeGate.mockResolvedValue(null);
  store.set(`users/${UID}/skinChecks/${SCAN}`, { scanId: SCAN });
  store.set(`users/someone-else/skinChecks/7c9e6679-7425-40de-944b-e07fc1f90ae7`, { scanId: "x" });
});
afterEach(() => vi.useRealTimers());

describe("POST /api/checkins", () => {
  it("201: one record at users/{verifiedUid}/checkins/{ISO week}, the reply equals the record", async () => {
    const r = await post({ answers: ANSWERS, scanId: SCAN, timeZone: "Asia/Kolkata" });
    expect(r.status).toBe(201);
    const body = await r.json();
    expect(body).toEqual({
      schemaVersion: 1,
      checkinId: "2026-W42",
      answers: ANSWERS,
      scanId: SCAN,
      timeZone: "Asia/Kolkata",
      createdAt: "2026-10-15T06:00:00.000Z",
    });
    expect(Array.from(store.keys()).filter((k) => k.includes("/checkins/"))).toEqual([`users/${UID}/checkins/2026-W42`]);
    expect(store.get(`users/${UID}/checkins/2026-W42`)!.createdAt).toBeInstanceOf(Timestamp);
  });

  it("a second submit in the same week is 409 ALREADY_THIS_WEEK; the first record is kept", async () => {
    expect((await post({ answers: { overall: "no_change" } })).status).toBe(201);
    at("2026-10-18T17:00:00Z"); // Sunday 22:30 in Kolkata, same week
    const r = await post({ answers: { overall: "much_worse" } });
    expect(r.status).toBe(409);
    expect(await code(r)).toBe("ALREADY_THIS_WEEK");
    expect(store.get(`users/${UID}/checkins/2026-W42`)!.answers).toEqual({ overall: "no_change" });
  });

  it("the week is the user's own: Monday 00:30 in Kolkata is a new week while UTC is still Sunday", async () => {
    at("2026-10-18T19:00:00Z"); // Mon 2026-10-19 00:30 IST
    expect((await (await post({ answers: { overall: "no_change" } })).json()).checkinId).toBe("2026-W43");
    store.clear();
    expect((await (await post({ answers: { overall: "no_change" }, timeZone: "UTC" })).json()).checkinId).toBe("2026-W42");
  });

  it("the week id uses the ISO week-year at year ends (checked against date +%G-W%V)", async () => {
    const cases: [string, string][] = [
      ["2026-12-31T06:00:00Z", "2026-W53"],
      ["2027-01-01T06:00:00Z", "2026-W53"],
      ["2027-01-04T06:00:00Z", "2027-W01"],
      ["2024-12-30T06:00:00Z", "2025-W01"],
      ["2021-01-03T06:00:00Z", "2020-W53"],
    ];
    for (const [now, week] of cases) {
      store.clear();
      at(now);
      expect((await (await post({ answers: { overall: "no_change" } })).json()).checkinId, now).toBe(week);
    }
  });

  it("no token or a bad token: 401, nothing written", async () => {
    expect((await post({ answers: ANSWERS }, null)).status).toBe(401);
    expect((await post({ answers: ANSWERS }, "forged")).status).toBe(401);
    expect(Array.from(store.keys()).some((k) => k.includes("/checkins/"))).toBe(false);
  });

  it("unknown question, unknown option, an option of another question, no answers, a non-string: 400 BAD_REQUEST", async () => {
    for (const answers of [
      { mood: "no_change" },
      { overall: "great" },
      { overall: "fading" }, // existing_spots' option
      {},
      { overall: 3 },
      { overall: ["no_change"] },
    ]) {
      const r = await post({ answers });
      expect(r.status, JSON.stringify(answers)).toBe(400);
      expect(await code(r)).toBe("BAD_REQUEST");
    }
    expect(Array.from(store.keys()).some((k) => k.includes("/checkins/"))).toBe(false);
  });

  it("extra body fields (a uid, a checkinId, a createdAt), a bad time zone, a bad body: 400", async () => {
    for (const extra of [{ uid: "victim" }, { checkinId: "2020-W01" }, { createdAt: "2020-01-01" }, { timeZone: "Mars/Base" }]) {
      expect((await post({ answers: ANSWERS, ...extra })).status, JSON.stringify(extra)).toBe(400);
    }
    const bad = await POST(new NextRequest("http://localhost/api/checkins", { method: "POST", headers: headers(), body: "{nope" }));
    expect(bad.status).toBe(400);
    expect((await post({ answers: ANSWERS, pad: "x".repeat(5000) })).status).toBe(400);
  });

  it("scanId: only one of the caller's own checks; another user's or a missing one is 403, a malformed one 400", async () => {
    const theirs = await post({ answers: ANSWERS, scanId: "7c9e6679-7425-40de-944b-e07fc1f90ae7" });
    expect(theirs.status).toBe(403);
    expect(await code(theirs)).toBe("NOT_ALLOWED");
    expect((await post({ answers: ANSWERS, scanId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed" })).status).toBe(403);
    expect((await post({ answers: ANSWERS, scanId: "../other/x" })).status).toBe(400);
    expect((await post({ answers: ANSWERS, scanId: null })).status).toBe(201);
  });

  it("an erased account or an under-18 record: 403 NOT_ALLOWED, nothing written", async () => {
    store.set(`erasedAccounts/${UID}`, {});
    expect(await code(await post({ answers: ANSWERS }))).toBe("NOT_ALLOWED");
    store.delete(`erasedAccounts/${UID}`);
    scanAgeGate.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect(await code(await post({ answers: ANSWERS }))).toBe("NOT_ALLOWED");
    expect(Array.from(store.keys()).some((k) => k.includes("/checkins/"))).toBe(false);
  });
});

describe("GET /api/checkins", () => {
  it("the caller's own check-ins only, newest first, limit honoured", async () => {
    for (const [now, overall] of [["2026-10-01T06:00:00Z", "no_change"], ["2026-10-08T06:00:00Z", "bit_better"], ["2026-10-15T06:00:00Z", "bit_worse"]]) {
      at(now!);
      expect((await post({ answers: { overall } })).status).toBe(201);
    }
    store.set("users/someone-else/checkins/2026-W42", { checkinId: "2026-W42", createdAt: Timestamp.now() });
    const all = await (await get()).json();
    expect(all.checkins.map((c: { checkinId: string }) => c.checkinId)).toEqual(["2026-W42", "2026-W41", "2026-W40"]);
    expect(all.checkins[0].answers).toEqual({ overall: "bit_worse" });
    expect(all.checkins[0].createdAt).toBe("2026-10-15T06:00:00.000Z");
    expect((await (await get("?limit=1")).json()).checkins).toHaveLength(1);
    expect((await get("", null)).status).toBe(401);
  });
});

describe("check-ins never reach Gemini", () => {
  it("the Echo trusted context and the context builder never read the checkins collection", () => {
    for (const f of ["lib/echo-trusted-context.ts", "lib/context/builder.ts", "lib/context/chat.ts", "app/api/skin-check/chat/route.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/checkin/i);
    }
  });

  it("the route never imports a Gemini or context module, and its error codes carry no banned words", () => {
    const src = readFileSync("app/api/checkins/route.ts", "utf8");
    const imports = src.split("\n").filter((l) => l.startsWith("import "));
    expect(imports.join("\n")).not.toMatch(/gemini|@\/lib\/context|echo|@google\/genai/i);
    expect(bannedWordsIn("ALREADY_THIS_WEEK NOT_ALLOWED BAD_REQUEST TOO_MANY")).toEqual([]);
  });
});
