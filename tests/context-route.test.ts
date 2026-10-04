import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The chat route with the context switch (docs/lanes/context-design.md §3.1, §3.2).
// Gemini is faked at the SDK boundary; chatTurns and the trusted context are mocked.
const h = vi.hoisted(() => ({
  verifyFirebaseIdToken: vi.fn(),
  getSkinCheckChatReply: vi.fn(),
  consumeDailyQuota: vi.fn(),
  loadTrustedEchoContext: vi.fn(),
  ageStatus: vi.fn(),
  latestGrant: vi.fn(),
  generateContent: vi.fn(),
  recordChatTurns: vi.fn(),
  loadChatHistory: vi.fn(),
  buildContextPackage: vi.fn(),
  handleContextChat: vi.fn(),
  loadTrustedSkinState2Series: vi.fn(),
}));

vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: h.generateContent }; } }));
vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return { bearerToken: actual.bearerToken, AdminNotConfiguredError: actual.AdminNotConfiguredError, verifyFirebaseIdToken: h.verifyFirebaseIdToken };
});
vi.mock("@/lib/gemini", async () => ({ ...(await vi.importActual<typeof import("@/lib/gemini")>("@/lib/gemini")), getSkinCheckChatReply: h.getSkinCheckChatReply }));
vi.mock("@/lib/echo-trusted-context", () => ({ loadTrustedEchoContext: h.loadTrustedEchoContext }));
vi.mock("@/lib/skin-state-2-loader", () => ({ loadTrustedSkinState2Series: h.loadTrustedSkinState2Series }));
vi.mock("@/lib/context/chat-turns", () => ({ recordChatTurns: h.recordChatTurns, loadChatHistory: h.loadChatHistory }));
vi.mock("@/lib/context/builder", async () => {
  const actual = await vi.importActual<typeof import("@/lib/context/builder")>("@/lib/context/builder");
  h.buildContextPackage.mockImplementation(actual.buildContextPackage);
  return { ...actual, buildContextPackage: h.buildContextPackage };
});
vi.mock("@/lib/context/chat", async () => {
  const actual = await vi.importActual<typeof import("@/lib/context/chat")>("@/lib/context/chat");
  h.handleContextChat.mockImplementation(actual.handleContextChat);
  return { handleContextChat: h.handleContextChat, seriesUpTo: actual.seriesUpTo };
});
vi.mock("@/lib/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit");
  return { ...actual, checkRequestRate: () => null, consumeDailyQuota: h.consumeDailyQuota };
});
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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("ECHO_CONTEXT_PATH", "on");
  h.verifyFirebaseIdToken.mockResolvedValue("uid-ctx");
  h.consumeDailyQuota.mockReturnValue(null);
  h.ageStatus.mockResolvedValue("over18");
  h.latestGrant.mockResolvedValue(true);
  h.loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", answers: { skin_type: "oily", primary_concerns: ["redness"] } });
  h.loadTrustedSkinState2Series.mockResolvedValue([]);
  h.getSkinCheckChatReply.mockResolvedValue("today's echo");
  h.generateContent.mockResolvedValue({ text: GOOD });
  h.recordChatTurns.mockResolvedValue(undefined);
  h.loadChatHistory.mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.unstubAllEnvs());

describe("switch off: today's Echo, unchanged", () => {
  it.each([
    ["unset", "test", ""],
    ["production build, even with the switch set", "production", "on"],
  ])("%s", async (_name, nodeEnv, flag) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("ECHO_CONTEXT_PATH", flag);
    const res = await post();
    expect(res.status).toBe(200);
    expect((await res.json()).reply).toBe("today's echo");
    expect(h.getSkinCheckChatReply).toHaveBeenCalledTimes(1);
    expect(h.handleContextChat).not.toHaveBeenCalled();
    expect(h.buildContextPackage).not.toHaveBeenCalled();
    expect(h.recordChatTurns).not.toHaveBeenCalled();
  });
});

describe("switch on: the gates still refuse before any package is built", () => {
  it.each([
    ["under 18", () => h.ageStatus.mockResolvedValue("under18"), 403, "UNDER_18"],
    ["unattested", () => h.ageStatus.mockResolvedValue("missing"), 403, "ATTESTATION_REQUIRED"],
    ["no AI-share consent", () => h.latestGrant.mockResolvedValue(null), 403, "AI_CONSENT_REQUIRED"],
  ])("%s", async (_name, arrange, status, code) => {
    arrange();
    const res = await post("my mole is bleeding"); // even a red-flag message is refused first
    expect(res.status).toBe(status);
    expect((await res.json()).code).toBe(code);
    for (const fn of [h.buildContextPackage, h.loadTrustedEchoContext, h.generateContent, h.recordChatTurns, h.consumeDailyQuota]) expect(fn).not.toHaveBeenCalled();
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
    expect(meta).toMatchObject({ packageVersion: "ctx-1", promptVersion: "ctx-prompt-1", modelId: expect.any(String), prefilter: null, validator: { passed: true, failures: [], regenerated: false, fallback: false } });
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
    expect(h.recordChatTurns.mock.calls[0]![5]).toMatchObject({ prefilter: "comparison", packageVersion: "ctx-1" });
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

  it("extra caution from evaluateSafety: the caution sentence goes to Gemini, the answer behind it does not", async () => {
    h.loadTrustedEchoContext.mockResolvedValue({ scores: SCORES, regionScores: { cheeks: CHEEK_SCORES }, regionLowConfidence: {}, pipelineVersion: "scan-0.1.6-provisional", answers: { primary_concerns: ["redness"], current_products: ["actives", "prescription"] } });
    await post();
    expect(builtWith().safety).toMatchObject({ extraCaution: true, extraCautionRaisedBy: [{ field: "current_products", value: "prescription" }] });
    expect(geminiCall()).toContain("Extra caution applies to this user.");
    expect(geminiCall()).not.toMatch(/A prescription product|extraCautionRaisedBy/);
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
