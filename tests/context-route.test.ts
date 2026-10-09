import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The chat route with the context switch (docs/lanes/context-design.md §3.1, §3.2).
// Gemini is faked at the SDK boundary; chatTurns and the trusted context are mocked.
const h = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  getSkinCheckChatReply: vi.fn(),
  consumeEchoQuestion: vi.fn(),
  loadTrustedEchoContext: vi.fn(),
  ageStatus: vi.fn(),
  latestGrant: vi.fn(),
  generateContent: vi.fn(),
  recordChatTurns: vi.fn(),
  loadChatHistory: vi.fn(),
  loadSplitCheckTurns: vi.fn(),
  buildContextPackage: vi.fn(),
  handleContextChat: vi.fn(),
  loadTrustedSkinState2Series: vi.fn(),
  evaluateSafety: vi.fn(),
  checkEchoScan: vi.fn(),
}));

// F13: the route's newest-check guard; tests/echo-newest-scan.test.ts covers it.
vi.mock("@/lib/echo-newest-scan", () => ({ checkEchoScan: (...a: unknown[]) => h.checkEchoScan(...a) }));
vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: h.generateContent }; } }));
vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken: h.verifyFirebaseIdToken };
});
vi.mock("@/lib/gemini", async () => ({ ...(await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini")), getSkinCheckChatReply: h.getSkinCheckChatReply }));
vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext: h.loadTrustedEchoContext }));
vi.mock("@/lib/skin-state-2-loader", () => ({ loadTrustedSkinState2Series: h.loadTrustedSkinState2Series }));
vi.mock("@/lib/rules/safety", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rules/safety")>("@/lib/rules/safety");
  h.evaluateSafety.mockImplementation(actual.evaluateSafety);
  return { ...actual, evaluateSafety: h.evaluateSafety };
});
vi.mock("@/lib/context/chat-turns", () => ({ recordChatTurns: h.recordChatTurns, loadChatHistory: h.loadChatHistory, loadSplitCheckTurns: h.loadSplitCheckTurns }));
vi.mock("@/lib/context/builder", async () => {
  const actual = await vi.importActual<typeof import("@/lib/context/builder")>("@/lib/context/builder");
  h.buildContextPackage.mockImplementation(actual.buildContextPackage);
  return { ...actual, buildContextPackage: h.buildContextPackage };
});
vi.mock("@/lib/context/chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/context/chat")>("@/lib/context/chat");
  h.handleContextChat.mockImplementation(actual.handleContextChat);
  return { handleContextChat: h.handleContextChat, seriesUpTo: actual.seriesUpTo, recordReferral: actual.recordReferral };
});
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null };
});
// TD-29 (5): the per-user daily limit replaced the shared quota.
vi.mock("@/lib/echo-quota", () => ({ consumeEchoQuestion: h.consumeEchoQuestion }));
vi.mock("@/app/api/account/_ledger", async () => {
  const actual = await vi.importActual<typeof import("@/app/api/account/_ledger")>("@/app/api/account/_ledger");
  return { ...actual, ageStatus: h.ageStatus, latestGrant: h.latestGrant, withLedgerTimeout: <T,>(p: Promise<T>) => actual.withLedgerTimeout(p, 20) };
});

import { POST } from "@/app/api/skin-check/chat/route";
import { signHistory } from "@/lib/echo-history-token";
import { REFERRAL_COPY, COMPARISON_LEAD } from "@/lib/context/prefilter";
import { UNCERTAINTY } from "@/lib/context/builder";
import { NextRequest } from "next/server";
import { CHEEK_SCORES, SCORES } from "./context-fixtures";
import { syntheticAnalysis } from "./synthetic-scan";
import { toSkinState2 } from "@/lib/skin-state-2";
import { SKINSTATE_FIELD_PATHS } from "@/lib/comparability";
import { seriesUpTo } from "@/lib/context/chat";
import type { BuildInput } from "@/lib/context/builder";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const GOOD = JSON.stringify({ claims: [{ claim_type: "uncertainty", text: UNCERTAINTY.text, fact_ids: [UNCERTAINTY.id] }], needs_referral: false });

function post(message = "what does my cheek reading mean?", history: { role: "user" | "echo"; text: string }[] = []) {
  const body = { scanId: SCAN_ID, region: "cheeks", message, history, historyToken: history.length ? signHistory("uid-ctx", SCAN_ID, "cheeks", history) : null };
  return POST(new NextRequest("http://localhost/api/skin-check/chat", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer t" }, body: JSON.stringify(body) }));
}

beforeEach(async () => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("ECHO_CONTEXT_PATH", "on");
  h.verifyFirebaseIdToken.mockResolvedValue("uid-ctx");
  h.checkEchoScan.mockResolvedValue("ok");
  h.consumeEchoQuestion.mockReturnValue(null);
  h.ageStatus.mockResolvedValue("over18");
  h.latestGrant.mockResolvedValue(true);
  h.loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", answers: { skin_type: "oily", primary_concerns: ["redness"] } });
  h.loadTrustedSkinState2Series.mockResolvedValue([]);
  // A throwing implementation from one test must never leak into the next.
  h.evaluateSafety.mockImplementation((await vi.importActual<typeof import("@/lib/rules/safety")>("@/lib/rules/safety")).evaluateSafety);
  h.getSkinCheckChatReply.mockResolvedValue("today's echo");
  h.generateContent.mockResolvedValue({ text: GOOD });
  h.recordChatTurns.mockResolvedValue(undefined);
  h.loadChatHistory.mockResolvedValue([]);
  h.loadSplitCheckTurns.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("switch: the context path ships; today's Echo only behind it (F12, TD-20)", () => {
  it("development or test with ECHO_CONTEXT_PATH=off: today's Echo, unchanged", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ECHO_CONTEXT_PATH", "off");
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("today's echo");
    expect(h.getSkinCheckChatReply).toHaveBeenCalledTimes(1);
    expect(h.handleContextChat).not.toHaveBeenCalled();
    expect(h.buildContextPackage).not.toHaveBeenCalled();
    expect(h.recordChatTurns).not.toHaveBeenCalled();
  });

  it.each([
    ["production build, even with ECHO_CONTEXT_PATH=off", "production", "off"],
    ["production build, unset", "production", ""],
    ["test, unset", "test", ""],
  ])("%s: the context path", async (_name, nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ECHO_CONTEXT_PATH", flag);
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.handleContextChat).toHaveBeenCalledTimes(1);
    expect(h.getSkinCheckChatReply).not.toHaveBeenCalled();
  });
});

describe("switch on: the gates still refuse before any package is built", () => {
  it.each([
    ["under 18", () => h.ageStatus.mockResolvedValue("under18"), 403, "UNDER_18"],
    ["unattested", () => h.ageStatus.mockResolvedValue("missing"), 403, "ATTESTATION_REQUIRED"],
    ["no AI-share consent", () => h.latestGrant.mockResolvedValue(null), 403, "AI_CONSENT_REQUIRED"],
  ])("%s", async (_name, arrange, status, code) => {
    arrange();
    const res = await post("what does my cheek reading mean?");
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
    for (const fn of [h.buildContextPackage, h.loadTrustedEchoContext, h.generateContent, h.recordChatTurns, h.consumeEchoQuestion]) expect(fn).not.toHaveBeenCalled();
  });

  // Second security review (H20): a red-flag message gets the referral before any gate can refuse it.
  it.each([
    ["under 18", () => h.ageStatus.mockResolvedValue("under18")],
    ["unattested", () => h.ageStatus.mockResolvedValue("missing")],
    ["no AI-share consent", () => h.latestGrant.mockResolvedValue(null)],
    ["ledger down", () => h.ageStatus.mockImplementation(() => new Promise(() => {}))],
  ])("%s: a red-flag message still gets the referral, nothing built, no quota spent", async (_name, arrange) => {
    arrange();
    const res = await post("my mole is bleeding");
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    // Nothing about a user the gates would refuse is stored.
    for (const fn of [h.buildContextPackage, h.loadTrustedEchoContext, h.generateContent, h.consumeEchoQuestion, h.recordChatTurns]) expect(fn).not.toHaveBeenCalled();
  });

  it("H22: a message in an unsupported script gets the fixed reply, is recorded as such, and nothing is built", async () => {
    const { UNSUPPORTED_SCRIPT_COPY } = await import("@/lib/context/prefilter");
    const res = await post("আমার ত্বক তৈলাক্ত");
    expect((await res.json()).reply).toBe(UNSUPPORTED_SCRIPT_COPY);
    for (const fn of [h.buildContextPackage, h.generateContent]) expect(fn).not.toHaveBeenCalled();
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ prefilter: "unsupported_script", redFlag: false, modelId: null });
  });

  it("a consented adult's early referral is still recorded as a red-flag turn", async () => {
    const res = await post("my mole is bleeding");
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    expect(h.recordChatTurns).toHaveBeenCalledTimes(1);
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ prefilter: "red_flag", redFlag: true, modelId: null });
  });
});

describe("switch on: the new path", () => {
  it("a normal question: one Gemini call, recorded with versions and the validator result", async () => {
    const res = await post();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.reply).toBe(UNCERTAINTY.text);
    expect(body.historyToken).toBeTruthy();
    expect(h.getSkinCheckChatReply).not.toHaveBeenCalled();
    expect(h.generateContent).toHaveBeenCalledTimes(1);
    const meta = h.recordChatTurns.mock.calls[0]![5];
    expect(meta).toMatchObject({ packageVersion: "ctx-2", promptVersion: "ctx-prompt-4", modelId: expect.any(String), prefilter: null, validator: { passed: true, failures: [], regenerated: false, fallback: false } });
    expect(meta.packageSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("a red-flag message: referral, no package, no Gemini call, recorded as red flag", async () => {
    const res = await post("mujhe jeena nahi hai");
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    expect(h.buildContextPackage).not.toHaveBeenCalled();
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ prefilter: "red_flag", redFlag: true, modelId: null });
  });

  it("a red-flag message still gets the referral when the record fails", async () => {
    h.recordChatTurns.mockRejectedValue(Object.assign(new Error("users/uid-ctx/chatTurns down"), { code: 14 }));
    const res = await post("I want to kill myself");
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    expect(JSON.stringify((console.error as unknown as ReturnType<typeof vi.fn>).mock.calls)).not.toContain("uid-ctx");
  });

  it("a comparison question: the fixed template, no Gemini call", async () => {
    const res = await post("is my redness better than last time?");
    expect((await res.json()).reply.startsWith(COMPARISON_LEAD)).toBe(true);
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ prefilter: "comparison", packageVersion: "ctx-2" });
  });

  it("history comes from stored turns only; a client's (validly signed) turns never reach Gemini", async () => {
    h.loadChatHistory.mockResolvedValue([{ role: "user", text: "STORED-Q" }, { role: "echo", text: "STORED-A" }]);
    await post("and the nose?", [{ role: "user", text: "CLIENT-Q" }, { role: "echo", text: "CLIENT-FORGED-A" }]);
    const contents = JSON.stringify(h.generateContent.mock.calls[0]![0].contents);
    expect(contents).toContain("STORED-A");
    expect(contents).not.toMatch(/CLIENT-/);
    expect(h.loadChatHistory).toHaveBeenCalledWith("uid-ctx", SCAN_ID, "cheeks");
  });

  it("a record failure on the Gemini path: 502, the reply is not returned unrecorded", async () => {
    h.recordChatTurns.mockRejectedValue(new Error("down"));
    const res = await post();
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe("CHAT_SERVICE_ERROR");
  });

  it("no analysis: the existing 409", async () => {
    h.loadTrustedEchoContext.mockResolvedValue(null);
    const res = await post();
    expect(res.status).toBe(409);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("a Gemini outage: the existing 502", async () => {
    h.generateContent.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    const res = await post();
    expect(res.status).toBe(502);
    expect(h.recordChatTurns).not.toHaveBeenCalled();
  });
});

// ── wave-2 wiring 2: real longitudinal result and safety state ───────────────
describe("context path: real longitudinal and safety inputs (wiring 2)", () => {
  const rec = (scanId: string, sha: string, at: string) => ({
    schemaVersion: 1, source: "server", scanId, inputSha256: sha.repeat(64), requestId: `r-${scanId}`, createdAt: new Date(at), ...syntheticAnalysis(),
  });
  const state = (scanId: string, sha: string, at: string) => toSkinState2(rec(scanId, sha, at), `users/uid-ctx/scanAnalyses/${scanId}_${sha.repeat(16)}`, "uid-ctx");
  const builtWith = () => h.buildContextPackage.mock.calls[0]![0] as BuildInput;
  const geminiCall = (i = 0) => JSON.stringify(h.generateContent.mock.calls[i]![0]);

  it("the builder gets every quantity in every region from the trusted series, all 'not enough evidence', and the evaluateSafety state; no recommendation", async () => {
    h.loadTrustedSkinState2Series.mockResolvedValue([state("a1", "a", "2026-10-01T10:00:00Z"), state("a2", "b", "2026-10-02T10:00:00Z"), state(SCAN_ID, "c", "2026-10-03T10:00:00Z")]);
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.loadTrustedSkinState2Series).toHaveBeenCalledWith("uid-ctx");
    const input = builtWith();
    expect(input.longitudinal).toHaveLength(SKINSTATE_FIELD_PATHS.length * 6);
    expect(new Set(input.longitudinal!.map((r) => r.evidence))).toEqual(new Set(["not_enough_evidence"]));
    expect(input.safety).toEqual({ rulesetVersion: "rules-0-provisional", reviewStatus: "provisional", extraCaution: false, extraCautionRaisedBy: [], redFlag: false });
    expect(input.recommendation).toBeUndefined();
    // The package Gemini sees carries the longitudinal facts and says products were left out.
    expect(geminiCall()).toContain("long.");
    expect(geminiCall()).toContain("Product suggestions were not included here.");
  });

  it("the series stops at the scan being discussed, so a later scan is never 'latest'", () => {
    const series = [state("a1", "a", "2026-10-01T10:00:00Z"), state(SCAN_ID, "c", "2026-10-03T10:00:00Z"), state("later", "d", "2026-10-05T10:00:00Z")];
    expect(seriesUpTo(series, SCAN_ID).map((e) => (e.kind === "skinstate" ? e.state.identity.scanId : e.kind))).toEqual(["a1", SCAN_ID]);
    expect(seriesUpTo(series, "not-in-series")).toHaveLength(3);
  });

  it("a series read failure leaves the section out (missing 'trend'), never a made-up trend", async () => {
    h.loadTrustedSkinState2Series.mockRejectedValue(new Error("unavailable"));
    const res = await post();
    expect(res.status).toBe(200);
    expect(builtWith().longitudinal).toBeUndefined();
    expect(geminiCall()).toContain("Readings from different checks cannot be lined up yet.");
  });

  it("extra caution from evaluateSafety stays internal: Gemini gets the everyone sentence, not the answer behind it", async () => {
    h.loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", answers: { primary_concerns: ["redness"], current_products: ["actives", "prescription"] } });
    await post();
    expect(builtWith().safety).toMatchObject({ extraCaution: true, extraCautionRaisedBy: [{ field: "current_products", value: "prescription" }] });
    expect(geminiCall()).toContain("Do not suggest any active ingredients or new products.");
    expect(geminiCall()).not.toMatch(/A prescription product|extraCaution|caution/i);
  });

  it("a quiz red flag reaches answerFromPackage: a rejected answer is not retried", async () => {
    const BAD = JSON.stringify({ claims: [{ claim_type: "uncertainty", text: "Your redness is 42.", fact_ids: [UNCERTAINTY.id] }], needs_referral: false });
    h.generateContent.mockResolvedValue({ text: BAD });
    await post();
    expect(h.generateContent).toHaveBeenCalledTimes(2); // control: no red flag, one retry
    h.generateContent.mockClear();
    h.loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", answers: { primary_concerns: ["blemishes"], breakout_pattern: ["deep_painful"] } });
    await post();
    expect(h.generateContent).toHaveBeenCalledTimes(1);
    // The red flag itself never reaches Gemini.
    expect(geminiCall()).not.toMatch(/redFlag|deep_painful|red_flag\./);
  });
});

// ── wave-2 wiring 4: any rules/safety error means the fixed fallback ─────────
describe("context path: a safety error is never 'no red flag' (wiring 4)", () => {
  const actualSafety = async () => (await vi.importActual<typeof import("@/lib/rules/safety")>("@/lib/rules/safety")).evaluateSafety;
  beforeEach(async () => {
    h.evaluateSafety.mockImplementation(await actualSafety());
  });

  const expectFixedFallback = async (res: Response) => {
    expect(res.status).toBe(200);
    const { reply } = await res.json();
    // Our own reading text for the focus region plus the uncertainty line: nothing else.
    expect(reply.split("\n").at(-1)).toBe(UNCERTAINTY.text);
    expect(reply).toMatch(/photo-based estimate/);
    expect(reply).not.toMatch(/product|routine|cleanser|serum|dermatologist/i);
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({
      prefilter: null, modelId: null, validator: { passed: false, failures: ["safety_unavailable"], regenerated: false, fallback: true },
    });
  };

  it("a disabled-rules error (RulesDisabledError)", async () => {
    const { RulesDisabledError } = await import("@/lib/rules/settings");
    h.evaluateSafety.mockImplementation(() => { throw new RulesDisabledError(); });
    await expectFixedFallback(await post());
  });

  it("malformed input (TypeError) and any other error", async () => {
    h.evaluateSafety.mockImplementation(() => { throw new TypeError("rules: answers must be an object"); });
    await expectFixedFallback(await post());
    vi.clearAllMocks();
    h.evaluateSafety.mockImplementation(() => { throw new Error("bug"); });
    await expectFixedFallback(await post());
  });

  // F11: the fixed reply also asks the user to finish the questionnaire.
  it("a check with no quiz answers (the real evaluateSafety throws): fixed fallback plus 'finish the questions', no Gemini", async () => {
    const { FINISH_QUESTIONNAIRE_COPY } = await import("@/lib/context/answer");
    for (const answers of [{}, { name: "ZZ", skin_type: "oily" }]) {
      vi.clearAllMocks();
      h.loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", answers });
      const { reply } = await (await post()).json();
      const lines = reply.split("\n");
      expect(lines.at(-1)).toBe(FINISH_QUESTIONNAIRE_COPY);
      expect(lines.at(-2)).toBe(UNCERTAINTY.text);
      expect(reply).toMatch(/photo-based estimate/);
      expect(h.generateContent).not.toHaveBeenCalled();
      expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ validator: { failures: ["no_answers"], fallback: true } });
    }
  });

  it("control: any other safety error keeps the plain fixed reply, with no questionnaire line", async () => {
    const { FINISH_QUESTIONNAIRE_COPY } = await import("@/lib/context/answer");
    h.evaluateSafety.mockImplementation(() => { throw new Error("bug"); });
    const { reply } = await (await post()).json();
    expect(reply).not.toContain(FINISH_QUESTIONNAIRE_COPY);
  });

  it("a chat red flag still gets the referral first (the pre-filter runs before safety)", async () => {
    h.evaluateSafety.mockImplementation(() => { throw new Error("bug"); });
    const res = await post("I don't want to live anymore");
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
  });
});

// ── wave-2 security review: red flags never reach Gemini on either path ──────
describe("red-flag pre-filter on both chat paths (wave-2 security review)", () => {
  it("today's Echo (switch off): a self-harm message gets the referral, Gemini is never called", async () => {
    vi.stubEnv("ECHO_CONTEXT_PATH", "off");
    const res = await post("I want to k1ll myself");
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    expect(h.getSkinCheckChatReply).not.toHaveBeenCalled();
    expect(h.loadTrustedEchoContext).not.toHaveBeenCalled();
  });

  it("today's Echo (switch off): a message split over the signed history is caught", async () => {
    vi.stubEnv("ECHO_CONTEXT_PATH", "off");
    const res = await post("die", [{ role: "user", text: "i want to" }, { role: "echo", text: "Could you say more?" }]);
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    expect(h.getSkinCheckChatReply).not.toHaveBeenCalled();
  });

  it("today's Echo (switch off): an ordinary question still reaches Echo", async () => {
    vi.stubEnv("ECHO_CONTEXT_PATH", "off");
    const res = await post("what does my cheek reading mean?");
    expect((await res.json()).reply).toBe("today's echo");
  });

  it("context path: a split red flag wins over a safety error (checked before anything is built)", async () => {
    h.loadSplitCheckTurns.mockResolvedValue([{ role: "user", text: "i want to" }]);
    h.evaluateSafety.mockImplementation(() => { throw new Error("bug"); });
    expect((await (await post("die")).json()).reply).toBe(REFERRAL_COPY);
    expect(h.loadTrustedEchoContext).not.toHaveBeenCalled();
  });

  it("context path: a message split over stored turns is caught before Gemini and recorded as a red flag", async () => {
    h.loadSplitCheckTurns.mockResolvedValue([{ role: "user", text: "i want to" }]);
    const res = await post("die");
    expect((await res.json()).reply).toBe(REFERRAL_COPY);
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ prefilter: "red_flag", redFlag: true });
  });

  it("red team pass 2 (P2-3): the split check reads a first half whose answer fell back (not in Gemini's history)", async () => {
    h.loadChatHistory.mockResolvedValue([]); // the fallback turn is left out of Gemini's history
    h.loadSplitCheckTurns.mockResolvedValue([{ role: "user", text: "i want to" }]);
    expect((await (await post("die")).json()).reply).toBe(REFERRAL_COPY);
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.loadSplitCheckTurns).toHaveBeenCalledWith("uid-ctx", SCAN_ID, "cheeks");
  });
});

// F13 (owner TD-20, option a): Echo answers only about the newest measured check.
describe("only the newest measured check (F13)", () => {
  it.each([["context path", "on"], ["today's Echo", "off"]])("%s: an older check gets 409 CHAT_NOT_NEWEST before the ledger, the quota and Gemini", async (_n, flag) => {
    vi.stubEnv("ECHO_CONTEXT_PATH", flag);
    h.checkEchoScan.mockResolvedValue("not_newest");
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CHAT_NOT_NEWEST");
    expect(h.checkEchoScan).toHaveBeenCalledWith("uid-ctx", SCAN_ID);
    for (const fn of [h.ageStatus, h.consumeEchoQuestion, h.loadTrustedEchoContext, h.generateContent, h.getSkinCheckChatReply, h.recordChatTurns]) expect(fn).not.toHaveBeenCalled();
  });

  it("a red-flag message about an older check still gets the referral", async () => {
    h.checkEchoScan.mockResolvedValue("not_newest");
    expect((await (await post("I want to end my life")).json()).reply).toBe(REFERRAL_COPY);
  });

  it("the check just made, whose reading has not landed: the retryable 409 CHAT_ANALYSIS_UNAVAILABLE, nothing spent", async () => {
    h.checkEchoScan.mockResolvedValue("no_reading");
    const res = await post();
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("CHAT_ANALYSIS_UNAVAILABLE");
    for (const fn of [h.consumeEchoQuestion, h.generateContent, h.getSkinCheckChatReply, h.recordChatTurns]) expect(fn).not.toHaveBeenCalled();
  });

  it("a read error refuses (503), never lets the check through", async () => {
    h.checkEchoScan.mockRejectedValue(new Error("firestore down"));
    const res = await post();
    expect(res.status).toBe(503);
    expect((await res.json()).code).toBe("CHAT_CHECK_UNAVAILABLE");
    expect(h.generateContent).not.toHaveBeenCalled();
    expect(h.consumeEchoQuestion).not.toHaveBeenCalled();
  });
});

// F15: Gemini ran out of time (live probe 2026-10-06: default thinking took 5.5-12.7 s).
describe("Gemini timeouts (F15)", () => {
  it("the context call asks for MINIMAL thinking and keeps the 10 s limit", async () => {
    await post();
    const config = h.generateContent.mock.calls[0]![0].config;
    expect(config.thinkingConfig).toEqual({ thinkingLevel: "MINIMAL" });
    expect(config.httpOptions).toEqual({ timeout: 10_000 });
  });

  it.each([
    ["a server deadline (504)", Object.assign(new Error("deadline"), { status: 504 })],
    ["the client's own timeout", Object.assign(new Error("aborted"), { name: "TimeoutError" })],
  ])("%s: 504 CHAT_TIMEOUT with a 'please try again' message", async (_n, err) => {
    h.generateContent.mockRejectedValue(err);
    const res = await post();
    expect(res.status).toBe(504);
    expect(await res.json()).toEqual({ error: "Echo took too long to answer. Please try again.", code: "CHAT_TIMEOUT" });
  });

  it("any other Gemini failure stays CHAT_SERVICE_ERROR, also asking to try again", async () => {
    h.generateContent.mockRejectedValue(Object.assign(new Error("bad"), { status: 400 }));
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Couldn't reach Echo. Please try again.", code: "CHAT_SERVICE_ERROR" });
  });

  it("the Echo page shows the timeout message with its Retry button", async () => {
    const { readFileSync } = await import("node:fs");
    const page = readFileSync("components/skin-check/EchoPage.tsx", "utf8");
    expect(page).toContain('CHAT_TIMEOUT: "Echo took too long to answer. Please try again."');
    expect(page).not.toMatch(/NOT_RETRYABLE = new Set\([^)]*CHAT_TIMEOUT/);
    expect(page).toContain("Couldn't reach Echo just now. Please try again.");
  });
});
