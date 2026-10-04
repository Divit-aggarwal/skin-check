import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TD-20 (owner, 2026-10-05): in a production build the context chat runs the
// red-flag and extra-caution check (marked provisional) and calls Gemini; it
// never falls back for "rules off", and it never recommends a product.
const h = vi.hoisted(() => ({
  generateContent: vi.fn(),
  loadTrustedEchoContext: vi.fn(),
  recordChatTurns: vi.fn(),
  evaluateSafety: vi.fn(),
}));

vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: h.generateContent }; } }));
vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext: h.loadTrustedEchoContext }));
vi.mock("@/lib/skin-state-2-loader", () => ({ loadTrustedSkinState2Series: async () => [] }));
vi.mock("@/lib/context/chat-turns", () => ({ recordChatTurns: h.recordChatTurns, loadChatHistory: async () => [], loadSplitCheckTurns: async () => [] }));
vi.mock("@/lib/rules/safety", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rules/safety")>("@/lib/rules/safety");
  h.evaluateSafety.mockImplementation(actual.evaluateSafety);
  return { ...actual, evaluateSafety: h.evaluateSafety };
});

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";

beforeEach(() => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.resetModules();
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("production build: the safety check runs, recommendations do not", () => {
  it("calls Gemini with the provisional safety state; no fallback for rules off; no product", async () => {
    const { SCORES, CHEEK_SCORES } = await import("./context-fixtures");
    const { UNCERTAINTY } = await import("@/lib/context/builder");
    const { RULES_ENABLED } = await import("@/lib/rules/settings");
    expect(RULES_ENABLED).toBe(false);
    h.loadTrustedEchoContext.mockResolvedValue({
      scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional",
      schemaVersion: 1, answers: { skin_type: "oily", primary_concerns: ["redness"], current_products: ["prescription"] },
    });
    h.generateContent.mockResolvedValue({ text: JSON.stringify({ claims: [{ claim_type: "uncertainty", text: UNCERTAINTY.text, fact_ids: [UNCERTAINTY.id] }], needs_referral: false }) });

    const { handleContextChat } = await import("@/lib/context/chat");
    const result = await handleContextChat({ uid: "uid-prod", scanId: SCAN_ID, region: "cheeks", message: "what does my cheek reading mean?" });

    expect(result).toEqual({ ok: true, reply: UNCERTAINTY.text });
    expect(h.evaluateSafety).toHaveBeenCalledTimes(1);
    expect(h.evaluateSafety.mock.results[0]).toMatchObject({ type: "return", value: { reviewStatus: "provisional", extraCaution: true, redFlag: false } });
    expect(h.generateContent).toHaveBeenCalledTimes(1);
    const meta = h.recordChatTurns.mock.calls[0]![5];
    expect(meta.validator).toMatchObject({ passed: true, fallback: false });
    expect(meta.validator.failures ?? []).not.toContain("safety_unavailable");
    // The package Gemini saw has no recommendation in it.
    const sent = JSON.stringify(h.generateContent.mock.calls[0]![0]);
    expect(sent).not.toMatch(/cleanser|serum|moisturi[sz]er|sunscreen|niacinamide/i);
  });

  it("recommend() refuses in the same build", async () => {
    const { recommend } = await import("@/lib/rules/recommend");
    const { CATALOGUE } = await import("@/lib/catalog/catalogue");
    expect(() => recommend({ answers: { primary_concerns: ["pigment"] }, confirmedThisScan: [] }, CATALOGUE)).toThrow(/clinical sign-off/);
  });
});
