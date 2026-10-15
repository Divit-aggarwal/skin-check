import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// H36 (mm:be1): a withdrawn personalisation consent keeps Echo answering but
// with no product suggestions, and no opening. Same mocks as
// tests/echo-products-chat.test.ts: Gemini faked at the SDK boundary.
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

import { NextRequest } from "next/server";
import { POST } from "@/app/api/skin-check/chat/route";
import { CONSENT_TEXTS } from "@/lib/feature-contracts/consents";
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

const post = (body: Record<string, unknown>) =>
  POST(new NextRequest("http://localhost/api/skin-check/chat", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" }, body: JSON.stringify(body) }));
const question = () => post({ scanId: SCAN_ID, region: "cheeks", message: "Which products should I use?", history: [] });
const opening = () => post({ scanId: SCAN_ID, region: "cheeks", opening: true });
const sentList = () => JSON.stringify(h.generateContent.mock.calls.map((c) => c[0].config.systemInstruction));

/** ai_share granted; personalisation as given (null = never answered). */
const personalisation = (answer: boolean | null | Error) =>
  h.latestGrant.mockImplementation(async (_uid: string, purpose: string, version: string) => {
    if (purpose !== "personalisation") return true;
    expect(version).toBe(CONSENT_TEXTS.personalisation.version);
    if (answer instanceof Error) throw answer;
    return answer;
  });

describe("H36: personalisation withdrawal and Echo", () => {
  it("never answered: the default (on) applies, products as before", async () => {
    personalisation(null);
    const body = await (await question()).json();
    expect(body.products).toEqual([{ productId: "refreshing-cleanser", reason: "You told us your skin type: Oily" }]);
    expect(sentList()).toContain("rec.refreshing-cleanser");
  });

  it("withdrawn: Echo still answers, with no products and no product list sent", async () => {
    personalisation(false);
    const res = await question();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.reply).toBe("string");
    expect(body.products).toEqual([]);
    expect(sentList()).not.toContain("rec.refreshing-cleanser");
  });

  it("an unreadable ledger for it: no products (fails closed), the answer still goes out", async () => {
    personalisation(new Error("down"));
    const body = await (await question()).json();
    expect(body.ok).toBe(true);
    expect(body.products).toEqual([]);
  });

  it("withdrawn: no opening, new or stored, and nothing spent", async () => {
    personalisation(false);
    h.loadOpening.mockResolvedValue({ reply: "stored", products: [] });
    const res = await opening();
    expect(res.status).toBe(404);
    expect((await res.json()).code).toBe("ECHO_PRODUCTS_OFF");
    expect(h.loadOpening).not.toHaveBeenCalled();
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.consumeEchoQuestion).not.toHaveBeenCalled();
  });

  it("granted again: the opening comes back", async () => {
    personalisation(true);
    expect((await opening()).status).toBe(200);
  });
});
