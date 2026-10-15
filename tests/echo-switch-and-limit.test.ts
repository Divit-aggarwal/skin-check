import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Owner decision TD-29 (5): a production setting turns Echo off quickly (on by
// default), and the shared daily budget is replaced by 20 questions per user
// per day, counted durably in users/{uid}/echoUsage/daily.

const h = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  getSkinCheckChatReply: vi.fn(),
  loadTrustedEchoContext: vi.fn(),
  ageStatus: vi.fn(),
  latestGrant: vi.fn(),
  docs: new Map<string, Record<string, unknown>>(),
  failTx: false,
  paths: [] as string[],
  splitTurns: [] as { role: "user"; text: string }[],
}));

// The context path's stored user turns for the split check (lib/context/chat-turns.ts).
vi.mock("@/lib/context/chat-turns", async () => {
  const actual = await vi.importActual<typeof import("@/lib/context/chat-turns")>("@/lib/context/chat-turns");
  return { ...actual, loadSplitCheckTurns: async () => h.splitTurns, hadRedFlagTurn: async () => false };
});

vi.mock("@/lib/echo-newest-scan", () => ({ checkEchoScan: async () => "ok" }));
vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  // A minimal Firestore with one transaction shape: get, then set.
  const ref = (path: string) => ({
    path,
    collection: (c: string) => ({ doc: (d: string) => ref(`${path}/${c}/${d}`) }),
  });
  const db = {
    collection: (c: string) => ({ doc: (d: string) => ref(`${c}/${d}`) }),
    runTransaction: async <T,>(fn: (tx: unknown) => Promise<T>): Promise<T> => {
      if (h.failTx) throw Object.assign(new Error("users/uid-x/echoUsage/daily unavailable"), { code: 14 });
      return fn({
        get: async (r: { path: string }) => {
          h.paths.push(r.path);
          return { data: () => h.docs.get(r.path) };
        },
        set: (r: { path: string }, data: Record<string, unknown>) => void h.docs.set(r.path, data),
      });
    },
  };
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken: h.verifyFirebaseIdToken, adminDb: () => db };
});
vi.mock("@/lib/gemini", () => ({ getSkinCheckChatReply: h.getSkinCheckChatReply }));
vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext: h.loadTrustedEchoContext }));
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null };
});
vi.mock("@/app/api/account/_ledger", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/account/_ledger")>("@/app/api/account/_ledger");
  return { ...actual, ageStatus: h.ageStatus, latestGrant: h.latestGrant, withLedgerTimeout: <T,>(p: Promise<T>) => actual.withLedgerTimeout(p, 20) };
});

import { POST } from "@/app/api/skin-check/chat/route";
import { consumeEchoQuestion, ECHO_DAILY_QUESTIONS_PER_USER, quotaDay, secondsToNextQuotaDay } from "@/lib/echo-quota";
import { ECHO_OFF_COPY, echoOn } from "@/lib/context/switch";
import { REFERRAL_COPY } from "@/lib/context/prefilter";
import { ECHO_COPY } from "@/components/skin-check/echoCopy";

const BODY = { scanId: "0f8fad5b-d9cb-469f-a165-70867728950e", region: "cheeks", history: [] };
const SCORES = { redness: 1, oiliness: 1, texture: 1, pores: 0, blemishes: 1, hydration: 1, pigment: 1 };
const post = (message: string) =>
  POST(
    new NextRequest("http://localhost/api/skin-check/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer t" },
      body: JSON.stringify({ ...BODY, message }),
    })
  );

beforeEach(() => {
  // Today's Echo (dev and test only) keeps the harness small; both paths share the switch and the limit.
  vi.stubEnv("ECHO_CONTEXT_PATH", "off");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key");
  vi.clearAllMocks();
  h.docs.clear();
  h.paths = [];
  h.failTx = false;
  h.splitTurns = [];
  h.verifyFirebaseIdToken.mockResolvedValue("uid-x");
  h.loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: {}, answers: {} });
  h.getSkinCheckChatReply.mockResolvedValue("Your cheeks read Moderate for redness in this photo.");
  h.ageStatus.mockResolvedValue("over18");
  h.latestGrant.mockResolvedValue(true);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("the Echo switch (ECHO_SWITCH)", () => {
  it.each([[undefined, true], ["", true], ["on", true], ["OFF", true], ["off ", true], ["false", true], ["off", false]])(
    "ECHO_SWITCH=%j: on is %s (only the exact value 'off' turns Echo off)",
    (value, on) => {
      if (value === undefined) vi.stubEnv("ECHO_SWITCH", undefined as unknown as string);
      else vi.stubEnv("ECHO_SWITCH", value);
      expect(echoOn()).toBe(on);
    }
  );

  it("off: 503 ECHO_OFF, before any ledger read, quota or Gemini call", async () => {
    vi.stubEnv("ECHO_SWITCH", "off");
    const res = await post("what does my redness mean?");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: ECHO_OFF_COPY, code: "ECHO_OFF" });
    for (const fn of [h.ageStatus, h.latestGrant, h.loadTrustedEchoContext, h.getSkinCheckChatReply]) expect(fn).not.toHaveBeenCalled();
    expect(h.docs.size).toBe(0);
  });

  it("off: a red-flag message still gets the referral (it goes out before the switch)", async () => {
    vi.stubEnv("ECHO_SWITCH", "off");
    const res = await post("I want to hurt myself");
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    expect(h.getSkinCheckChatReply).not.toHaveBeenCalled();
  });

  it("the page copy is the same text the route sends", () => {
    expect(ECHO_COPY.off).toBe(ECHO_OFF_COPY);
  });

  it("/echo reads the switch and, when off, shows the notice in place of the input", async () => {
    const { readFileSync } = await import("node:fs");
    expect(readFileSync("app/(marketing)/echo/page.tsx", "utf8")).toContain("<EchoWithConsent echoOn={echoOn()} productsOn={echoProductsOn()} />");
    // H36 (lane C): the wrapper passes the Echo switch through unchanged and only narrows products.
    expect(readFileSync("components/products/PersonalisedProducts.tsx", "utf8")).toContain("<EchoPage echoOn={echoOn} productsOn={productsOn && personal} />"); // TD-34: the product switch is passed beside it
    const page = readFileSync("components/skin-check/EchoPage.tsx", "utf8");
    // The notice, then the help line (safety review: a user who cannot write still sees it).
    expect(page).toMatch(/\{!echoOn \? \(\s*<div role="status"[^>]*>\s*<p>\{E\.off\}<\/p>\s*<p>\{withPhoneLinks\(REFERRAL_LINE\)\}<\/p>/);
    // Every other way into Echo is hidden while it is off, and the browser build reads the same value.
    // TD-47: the env block now lists four switches, one per line; the Echo two are unchanged.
    const config = readFileSync("next.config.js", "utf8");
    expect(config).toContain('ECHO_SWITCH: process.env.ECHO_SWITCH ?? "",');
    expect(config).toContain('ECHO_PRODUCTS_SWITCH: process.env.ECHO_PRODUCTS_SWITCH ?? "",'); // TD-34: the product switch beside it
    // TD-47: Home's Ask Echo card (with its starter questions) is the dashboard's way into Echo.
    expect(readFileSync("components/dashboard/DashboardPage.tsx", "utf8")).toMatch(/\{echoOn\(\) && \(\s*<Area name="echo">\s*<AskEchoCard/);
    expect(readFileSync("components/checks/ChecksView.tsx", "utf8")).toMatch(/echoOn\(\) && \(\s*<Link href="\/echo"/);
    expect(readFileSync("components/skin-check/SkinCheckDashboard.tsx", "utf8")).toMatch(/\{echoOn\(\) && \(\s*<div className="sticky/);
    // Every refusal that stops the user writing carries the help line, the limit-store outage too (retryable).
    for (const code of ["ECHO_OFF", "ECHO_DAILY_LIMIT", "ECHO_LIMIT_UNAVAILABLE"]) expect(page).toMatch(new RegExp(`${code}: \`\\$\\{E\\.\\w+\\} \\$\\{REFERRAL_LINE\\}\``));
    expect(page).not.toMatch(/NOT_RETRYABLE = new Set\([^)]*ECHO_LIMIT_UNAVAILABLE/);
    // No greeting inviting a question while Echo is off.
    expect(page).toContain("{echoOn && messages.length === 0 && (");
    // TD-50 (redesign lane D): the input is the kit's ChatInput (a form inside the kit), still after the notice.
    expect(page).toContain("<ChatInput");
    expect(page.indexOf("{!echoOn ? (")).toBeLessThan(page.indexOf("<ChatInput"));
  });
});

describe("20 questions per user per day (lib/echo-quota.ts)", () => {
  it("is a named setting of 20", () => expect(ECHO_DAILY_QUESTIONS_PER_USER).toBe(20));

  it("the day is India time: 18:29 UTC is still the same day, 18:30 UTC is the next", () => {
    expect(quotaDay(new Date("2026-10-09T18:29:59Z"))).toBe("2026-10-09");
    expect(quotaDay(new Date("2026-10-09T18:30:00Z"))).toBe("2026-10-10");
    expect(secondsToNextQuotaDay(new Date("2026-10-09T18:29:00Z"))).toBe(60);
  });

  it("the 20th question is answered, the 21st gets 429 ECHO_DAILY_LIMIT and no Gemini call", async () => {
    for (let i = 0; i < ECHO_DAILY_QUESTIONS_PER_USER; i++) expect((await post(`question ${i}`)).status).toBe(200);
    expect(h.getSkinCheckChatReply).toHaveBeenCalledTimes(ECHO_DAILY_QUESTIONS_PER_USER);
    const res = await post("one more");
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toEqual({ error: ECHO_COPY.dailyLimit, code: "ECHO_DAILY_LIMIT" });
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(h.getSkinCheckChatReply).toHaveBeenCalledTimes(ECHO_DAILY_QUESTIONS_PER_USER);
  });

  it("is per user: another user still has all 20", async () => {
    h.docs.set("users/uid-x/echoUsage/daily", { day: quotaDay(new Date()), count: ECHO_DAILY_QUESTIONS_PER_USER });
    expect((await post("hi")).status).toBe(429);
    h.verifyFirebaseIdToken.mockResolvedValue("uid-y");
    expect((await post("hi")).status).toBe(200);
  });

  it("lives under users/{uid}, so account erase (recursiveDelete of users/{uid}) removes it", async () => {
    await post("hi");
    expect(h.paths).toEqual(["users/uid-x/echoUsage/daily"]);
  });

  it("resets on the next India day", async () => {
    const now = new Date("2026-10-09T18:00:00Z");
    h.docs.set("users/uid-x/echoUsage/daily", { day: "2026-10-09", count: ECHO_DAILY_QUESTIONS_PER_USER });
    expect((await consumeEchoQuestion("uid-x", now))?.status).toBe(429);
    expect(await consumeEchoQuestion("uid-x", new Date("2026-10-09T18:30:00Z"))).toBeNull();
    expect(h.docs.get("users/uid-x/echoUsage/daily")).toEqual({ day: "2026-10-10", count: 1 });
  });

  it("fails closed: an unreadable store refuses with 503 and Gemini is never called", async () => {
    h.failTx = true;
    const res = await post("hi");
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("ECHO_LIMIT_UNAVAILABLE");
    expect(h.getSkinCheckChatReply).not.toHaveBeenCalled();
    // Name and code only in the log: never the message, which names the doc path (the uid).
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toContain("uid-x");
  });

  it("refused questions spend nothing: under-18 and no AI-share consent are refused before counting", async () => {
    h.ageStatus.mockResolvedValue("under18");
    expect((await post("hi")).status).toBe(403);
    h.ageStatus.mockResolvedValue("over18");
    h.latestGrant.mockResolvedValue(null);
    expect((await post("hi")).status).toBe(403);
    expect(h.docs.size).toBe(0);
  });
});

// Safety review 2026-10-09: a red flag split over two turns must get the referral even when
// the answer would otherwise be a refusal (Echo off, the daily limit, the limit store down).
describe("a split red flag beats every refusal (context path, the one that ships)", () => {
  beforeEach(() => {
    vi.stubEnv("ECHO_CONTEXT_PATH", "");
    h.splitTurns = [{ role: "user", text: "i want to" }];
  });

  it("control: 'die' alone is not a red flag, 'i want to' + 'die' is", async () => {
    const { redFlagHit } = await import("@/lib/context/prefilter");
    expect(redFlagHit("die")).toBe(false);
    expect(redFlagHit("i want to die")).toBe(true);
  });

  it("Echo off: the referral, not ECHO_OFF", async () => {
    vi.stubEnv("ECHO_SWITCH", "off");
    const res = await post("die");
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
  });

  it("at the daily limit: the referral, not ECHO_DAILY_LIMIT, and Gemini is never called", async () => {
    h.docs.set("users/uid-x/echoUsage/daily", { day: quotaDay(new Date()), count: ECHO_DAILY_QUESTIONS_PER_USER });
    const res = await post("die");
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    expect(h.getSkinCheckChatReply).not.toHaveBeenCalled();
  });

  it("limit store down: the referral, not 503", async () => {
    h.failTx = true;
    const res = await post("die");
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
  });

  it("control: an ordinary message at the limit still gets ECHO_DAILY_LIMIT", async () => {
    h.splitTurns = [{ role: "user", text: "what is my redness" }];
    h.docs.set("users/uid-x/echoUsage/daily", { day: quotaDay(new Date()), count: ECHO_DAILY_QUESTIONS_PER_USER });
    expect((await (await post("and my cheeks?")).json()).code).toBe("ECHO_DAILY_LIMIT");
  });
});
