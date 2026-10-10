import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TD-34 through the real chat path and route: Gemini is faked at the SDK
// boundary; chatTurns, the trusted context and the gates are mocked.
const h = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  consumeEchoQuestion: vi.fn(),
  loadTrustedEchoContext: vi.fn(),
  ageStatus: vi.fn(),
  latestGrant: vi.fn(),
  generateContent: vi.fn(),
  recordChatTurns: vi.fn(),
  loadChatHistory: vi.fn(),
  loadSplitCheckTurns: vi.fn(),
  loadOpening: vi.fn(),
  hadRedFlagTurn: vi.fn(),
  checkEchoScan: vi.fn(),
}));

vi.mock("@/lib/echo-newest-scan", () => ({ checkEchoScan: (...a: unknown[]) => h.checkEchoScan(...a) }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: h.generateContent }; } }));
vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken: h.verifyFirebaseIdToken };
});
vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext: h.loadTrustedEchoContext }));
vi.mock("@/lib/skin-state-2-loader", () => ({ loadTrustedSkinState2Series: async () => [] }));
vi.mock("@/lib/context/chat-turns", () => ({ recordChatTurns: h.recordChatTurns, loadChatHistory: h.loadChatHistory, loadSplitCheckTurns: h.loadSplitCheckTurns, loadOpening: h.loadOpening, hadRedFlagTurn: h.hadRedFlagTurn }));
vi.mock("@/lib/rate-limit", async () => ({ ...(await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit")), checkRequestRate: () => null }));
vi.mock("@/lib/echo-quota", () => ({ consumeEchoQuestion: h.consumeEchoQuestion }));
vi.mock("@/app/api/account/_ledger", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/account/_ledger")>("@/app/api/account/_ledger");
  return { ...actual, ageStatus: h.ageStatus, latestGrant: h.latestGrant, withLedgerTimeout: <T,>(p: Promise<T>) => actual.withLedgerTimeout(p, 20) };
});

import { NextRequest, NextResponse } from "next/server";
import { POST } from "@/app/api/skin-check/chat/route";
import { handleContextChat } from "@/lib/context/chat";
import { OPENING_MESSAGE, PRODUCT_DOCTOR_LINE } from "@/lib/context/products";
import { COPY } from "@/lib/rules/settings";
import { REFERRAL_COPY } from "@/lib/context/prefilter";
import { SCORES, CHEEK_SCORES } from "./context-fixtures";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const BASE = { skin_type: "oily", primary_concerns: ["blemishes"], male_skin_context: ["shaving_irritation"] };
const trusted = (answers: Record<string, unknown>) => ({ scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", schemaVersion: 1, answers });

// A checked suggestion: a product claim, one listed product with a reason that repeats what the user told us.
const SUGGESTION = JSON.stringify({
  claims: [{ claim_type: "product", text: "Here is a simple routine from Project Skin's products.", fact_ids: ["rec.refreshing-cleanser"] }],
  products: [{ product_id: "refreshing-cleanser", reason: "You told us your skin type: Oily", fact_ids: ["self.all.skin_type"] }],
  needs_referral: false,
  distress: false,
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("ECHO_CONTEXT_PATH", "on");
  h.verifyFirebaseIdToken.mockResolvedValue("uid-p");
  h.checkEchoScan.mockResolvedValue("ok");
  h.consumeEchoQuestion.mockReturnValue(null);
  h.ageStatus.mockResolvedValue("over18");
  h.latestGrant.mockResolvedValue(true);
  h.loadTrustedEchoContext.mockResolvedValue(trusted(BASE));
  h.generateContent.mockResolvedValue({ text: SUGGESTION });
  h.recordChatTurns.mockResolvedValue(undefined);
  h.loadChatHistory.mockResolvedValue([]);
  h.loadSplitCheckTurns.mockResolvedValue([]);
  h.loadOpening.mockResolvedValue(null);
  h.hadRedFlagTurn.mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

const calls = () => JSON.stringify(h.generateContent.mock.calls.map((c) => c[0]));

// Two users who differ only in a hidden answer. Each pair is [with, without].
const PAIRS: [string, Record<string, unknown>, Record<string, unknown>][] = [
  ["pregnant vs another female answer", { ...BASE, gender: "female", female_skin_context: ["pregnant_or_breastfeeding"] }, { ...BASE, gender: "female", female_skin_context: ["menopause"] }],
  ["prescription vs no answer", { ...BASE, current_products: ["prescription"] }, BASE],
  ["red flag from a hidden answer vs none", { ...BASE, gender: "female", female_skin_context: ["irregular_periods"] }, { ...BASE, gender: "female", female_skin_context: ["none_not_sure"] }],
];

describe("TD-34: the guards never change what Gemini receives, over two turns", () => {
  it.each(PAIRS)("%s: the same Gemini calls, turn 1 and turn 2 (history from what was stored)", async (_, withHidden, without) => {
    const run = async (answers: Record<string, unknown>) => {
      h.generateContent.mockClear();
      h.recordChatTurns.mockClear();
      h.loadTrustedEchoContext.mockResolvedValue(trusted(answers));
      h.loadChatHistory.mockResolvedValue([]);
      const first = await handleContextChat({ uid: "uid-p", scanId: SCAN_ID, region: "cheeks", message: "Which products should I use?" });
      const [, , , userText, echoText, meta] = h.recordChatTurns.mock.calls[0]!;
      // Turn 2 reads back exactly what turn 1 stored, as loadChatHistory does.
      h.loadChatHistory.mockResolvedValue(meta.historyExcluded ? [] : [{ role: "user", text: userText }, { role: "echo", text: echoText }]);
      await handleContextChat({ uid: "uid-p", scanId: SCAN_ID, region: "cheeks", message: "How do I use the cleanser?" });
      return { sent: calls(), first, stored: echoText as string };
    };
    const a = await run(withHidden);
    const b = await run(without);
    expect(h.generateContent).toHaveBeenCalledTimes(2);
    expect(a.sent).toBe(b.sent);
    expect(a.stored).toBe(b.stored);
    // What each user SEES differs: that is the guard, applied after the call.
    expect(a.first).not.toEqual(b.first);
  });

  it("the guarded user sees the guard: red flag gets the dermatologist line first and no product", async () => {
    h.loadTrustedEchoContext.mockResolvedValue(trusted({ ...BASE, breakout_pattern: ["deep_painful"] }));
    const r = await handleContextChat({ uid: "uid-p", scanId: SCAN_ID, region: "cheeks", message: "Which products should I use?" });
    expect(r).toMatchObject({ ok: true, products: [] });
    expect(r.ok && r.reply.split("\n")[0]).toBe(COPY.referral);
    expect(r.ok && r.reply).not.toContain("Project Skin's products");
    // Stored for Gemini's history: the unguarded answer.
    expect(h.recordChatTurns.mock.calls[0]![4]).toBe("Here is a simple routine from Project Skin's products.");
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ guard: "red_flag", products: [{ productId: "refreshing-cleanser" }] });
  });

  it("a prescription answer: products shown with the fixed doctor line", async () => {
    h.loadTrustedEchoContext.mockResolvedValue(trusted({ ...BASE, current_products: ["prescription"] }));
    const r = await handleContextChat({ uid: "uid-p", scanId: SCAN_ID, region: "cheeks", message: "Which products should I use?" });
    expect(r).toMatchObject({ ok: true, products: [{ productId: "refreshing-cleanser", reason: "You told us your skin type: Oily" }] });
    expect(r.ok && r.reply.split("\n").at(-1)).toBe(PRODUCT_DOCTOR_LINE);
  });

  it("a self-harm message keeps its fixed reply, no Gemini call, no product", async () => {
    const r = await handleContextChat({ uid: "uid-p", scanId: SCAN_ID, region: "cheeks", message: "which product should I use, I want to die" });
    expect(r).toEqual({ ok: true, reply: REFERRAL_COPY, products: [] });
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("an id Gemini makes up never reaches the user: the answer falls back, no product", async () => {
    h.generateContent.mockResolvedValue({ text: SUGGESTION.replace(/refreshing-cleanser"/g, 'made-up-cleanser"') });
    const r = await handleContextChat({ uid: "uid-p", scanId: SCAN_ID, region: "cheeks", message: "Which products should I use?" });
    expect(r).toMatchObject({ ok: true, products: [] });
    expect(h.recordChatTurns.mock.calls[0]![5].validator).toMatchObject({ passed: false, fallback: true });
  });
});

function openingPost(body: Record<string, unknown> = { scanId: SCAN_ID, region: "cheeks", opening: true }) {
  return POST(new NextRequest("http://localhost/api/skin-check/chat", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" }, body: JSON.stringify(body) }));
}

describe("TD-34: the opening suggestion (route)", () => {
  it("asks Gemini the fixed request about the whole face, with the product list, and stores it as the opening", async () => {
    const res = await openingPost();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, reply: "Here is a simple routine from Project Skin's products.", products: [{ productId: "refreshing-cleanser", reason: "You told us your skin type: Oily" }] });
    const sent = h.generateContent.mock.calls[0]![0];
    expect(JSON.stringify(sent.contents)).toBe(JSON.stringify([{ role: "user", parts: [{ text: OPENING_MESSAGE }] }]));
    expect(sent.config.systemInstruction).toContain('"regionFocus":null');
    expect(sent.config.systemInstruction).toContain("rec.refreshing-cleanser");
    expect(h.consumeEchoQuestion).toHaveBeenCalledTimes(1);
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ opening: true });
  });

  it("a stored opening is shown again with no Gemini call and no question spent, under today's guards", async () => {
    h.loadOpening.mockResolvedValue({ reply: "Here is a simple routine from Project Skin's products.", withoutProducts: "", productContent: true, products: [{ productId: "refreshing-cleanser", reason: "You told us your skin type: Oily" }, { productId: "active-boba-cream", reason: "x" }] });
    const body = await (await openingPost()).json();
    expect(body.products).toEqual([{ productId: "refreshing-cleanser", reason: "You told us your skin type: Oily" }]); // out of stock now: dropped
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.consumeEchoQuestion).not.toHaveBeenCalled();
    h.loadTrustedEchoContext.mockResolvedValue(trusted({ ...BASE, breakout_pattern: ["deep_painful"] }));
    const flagged = await (await openingPost()).json();
    expect(flagged).toEqual({ ok: true, reply: COPY.referral, products: [] });
  });

  it.each([
    ["product suggestions off", () => vi.stubEnv("ECHO_PRODUCTS_SWITCH", "off"), 404, "ECHO_PRODUCTS_OFF"],
    ["Echo off", () => vi.stubEnv("ECHO_SWITCH", "off"), 503, "ECHO_OFF"],
    ["under 18", () => h.ageStatus.mockResolvedValue("under18"), 403, "UNDER_18"],
    ["no AI-share consent", () => h.latestGrant.mockResolvedValue(false), 403, "AI_CONSENT_REQUIRED"],
    ["not the newest check", () => h.checkEchoScan.mockResolvedValue("not_newest"), 409, "CHAT_NOT_NEWEST"],
  ])("refused when %s: no Gemini call, nothing spent", async (_, arrange, status, code) => {
    arrange();
    const res = await openingPost();
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.consumeEchoQuestion).not.toHaveBeenCalled();
  });

  it("the day's limit applies to a new opening", async () => {
    h.consumeEchoQuestion.mockReturnValue(NextResponse.json({ code: "ECHO_DAILY_LIMIT" }, { status: 429 }));
    expect((await openingPost()).status).toBe(429);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("a check without answers gets no opening and nothing is stored", async () => {
    h.loadTrustedEchoContext.mockResolvedValue(trusted({})); // the trusted loader returns no answers for a skipped check (TD-33)
    const res = await openingPost();
    expect(res.status).toBe(409);
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.recordChatTurns).not.toHaveBeenCalled();
  });

  it("an opening that fell back is stored (no spend on reload) but shown as no suggestion; a stored one is not shown either", async () => {
    h.generateContent.mockResolvedValue({ text: "not json" });
    const res = await openingPost();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("OPENING_UNAVAILABLE");
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ opening: true, validator: { fallback: true } });
    h.generateContent.mockClear();
    h.consumeEchoQuestion.mockClear();
    h.loadOpening.mockResolvedValue({ reply: "x", withoutProducts: "x", products: [], productContent: false, fallback: true });
    expect((await openingPost()).status).toBe(409);
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.consumeEchoQuestion).not.toHaveBeenCalled();
  });

  it("the opening skips the split red-flag check over the thread's stored turns (its text is fixed)", async () => {
    h.loadSplitCheckTurns.mockResolvedValue([{ role: "user", text: "i want to" }]);
    const res = await openingPost();
    expect(res.status).toBe(200);
    expect(h.generateContent).toHaveBeenCalledTimes(1);
  });

  it("a red-flag message earlier on this check: the opening shows the dermatologist line and no product", async () => {
    h.hadRedFlagTurn.mockResolvedValue(true);
    expect(await (await openingPost()).json()).toEqual({ ok: true, reply: COPY.referral, products: [] });
    h.loadOpening.mockResolvedValue({ reply: "Here is a simple routine from Project Skin's products.", withoutProducts: "", products: [{ productId: "refreshing-cleanser", reason: "r" }], productContent: true, fallback: false });
    expect(await (await openingPost()).json()).toEqual({ ok: true, reply: COPY.referral, products: [] });
  });

  it("the request shape is strict: a message or history is refused", async () => {
    expect((await openingPost({ scanId: SCAN_ID, region: "cheeks", opening: true, message: "hi" })).status).toBe(400);
    expect((await openingPost({ scanId: SCAN_ID, region: "cheeks", opening: false })).status).toBe(400);
  });
});
