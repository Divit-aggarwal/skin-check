import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// TD-33 (2): the typed product names never reach Gemini or a log, on either
// Echo path; TD-33 (1): a skipped check keeps F11 (fixed reply, no Gemini
// call) until its questions are answered later. Real route, real trusted
// loader, real context path and real lib/gemini; Firestore is an in-memory
// fake and the Gemini SDK is mocked at its boundary, so the assertions are on
// the real generateContent argument.
const h = vi.hoisted(() => ({
  generateContent: vi.fn(),
  store: new Map<string, Record<string, unknown>>(),
  reads: [] as string[],
}));

function fakeCollection(path: string) {
  return {
    doc: (id: string) => ({
      collection: (name: string) => fakeCollection(`${path}/${id}/${name}`),
      get: async () => {
        h.reads.push(`${path}/${id}`);
        const data = h.store.get(`${path}/${id}`);
        return { exists: data !== undefined, data: () => data };
      },
    }),
    where: (field: string, _op: "==", value: unknown) => ({
      get: async () => {
        const docs = Array.from(h.store.entries())
          .filter(([p, d]) => p.startsWith(`${path}/`) && !p.slice(path.length + 1).includes("/") && d[field] === value)
          .map(([p, d]) => ({ id: p.slice(path.length + 1), data: () => d }));
        return { docs };
      },
    }),
  };
}

vi.mock("@google/genai", () => ({ GoogleGenAI: class { models = { generateContent: h.generateContent }; } }));
vi.mock("@/lib/echo-newest-scan", () => ({ checkEchoScan: async () => "ok" }));
vi.mock("@/lib/firebase/admin", async () => {
  const actual = await vi.importActual<typeof import("@/lib/firebase/admin")>("@/lib/firebase/admin");
  return {
    bearerToken: actual.bearerToken,
    AdminNotConfiguredError: actual.AdminNotConfiguredError,
    verifyFirebaseIdToken: async () => "user-a",
    adminDb: () => ({ collection: (name: string) => fakeCollection(name) }),
  };
});
vi.mock("@/lib/rate-limit", async () => ({ ...(await vi.importActual<typeof import("@/lib/rate-limit")>("@/lib/rate-limit")), checkRequestRate: () => null }));
vi.mock("@/lib/echo-quota", () => ({ consumeEchoQuestion: () => null }));
vi.mock("@/app/api/account/_ledger", async () => ({
  ...(await vi.importActual<typeof import("@/app/api/account/_ledger")>("@/app/api/account/_ledger")),
  ageStatus: async () => "over18",
  latestGrant: async () => true,
}));
vi.mock("@/lib/context/chat-turns", () => ({ recordChatTurns: async () => undefined, loadChatHistory: async () => [], loadSplitCheckTurns: async () => [] }));
vi.mock("@/lib/skin-state-2-loader", () => ({ loadTrustedSkinState2Series: async () => [] }));

import { NextRequest } from "next/server";
import { POST } from "@/app/api/skin-check/chat/route";
import { loadTrustedEchoContext } from "@/lib/echo-trusted-context";
import { FINISH_QUESTIONNAIRE_COPY } from "@/lib/context/answer";
import { UNCERTAINTY } from "@/lib/context/builder";
import { SECTIONS } from "@/lib/skin-check-steps";
import { QUESTION_SECTION_IDS } from "@/lib/skin-check-validation";
import { buildScanAnalysisRecord, scanAnalysisDocId } from "@/lib/scan-analysis-record";
import type { SkinScanResult } from "@/types/skin-scan";
import type { StepConfig } from "@/types/skin-check";
import { syntheticAnalysis, syntheticNative } from "./synthetic-scan";

const SCAN_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const CHECK = `users/user-a/skinChecks/${SCAN_ID}`;
const LATER = `users/user-a/laterAnswers/${SCAN_ID}`;
// One canary per box and per record, so a leak names its source.
const NAMES = { prescription: "ZZRXCHECKZZ Tretinoin 0.025%", other: "ZZOTHERCHECKZZ Brand serum" };
const LATER_NAMES = { prescription: "ZZRXLATERZZ Adapalene", other: "ZZOTHERLATERZZ Toner" };
const CANARIES = ["ZZRXCHECKZZ", "ZZOTHERCHECKZZ", "ZZRXLATERZZ", "ZZOTHERLATERZZ", "Tretinoin", "Adapalene"];

const scores = (n: number) => ({ redness: n / 10, oiliness: n / 10, texture: n / 10, pores: 0, blemishes: n / 10, hydration: n / 10, pigment: n / 10 });
const BASICS = { name: "Tester", age: "25-34", gender: "female" };

function answerFor(step: StepConfig): string | string[] {
  if (step.type === "multi-select-cards" || step.type === "body-map") return [step.options.at(-1)!.value === "none_not_sure" ? step.options[0]!.value : step.options[0]!.value];
  return "options" in step ? step.options[0]!.value : "x";
}
// Every optional question answered, with both name options picked.
const QUESTIONS = {
  ...Object.fromEntries(SECTIONS.filter((s) => QUESTION_SECTION_IDS.has(s.id)).flatMap((s) => s.steps).map((step) => [step.id, answerFor(step)])),
  current_products: ["cleanser_moisturizer", "prescription", "other_products"],
};

function seedAnalysis() {
  const docId = `${SCAN_ID}_aaaaaaaaaaaaaaaa`;
  const result = { ...syntheticAnalysis(), ...syntheticNative(), scores: scores(3), region_scores: { cheeks: scores(4) }, pipeline_version: "scan-0.1.6-provisional", engine_build: "sha-test" };
  const record = buildScanAnalysisRecord(result as unknown as SkinScanResult, { scanId: SCAN_ID, inputSha256: "a".repeat(16).padEnd(64, "0"), requestId: "r-1", captureMethod: "native" });
  expect(scanAnalysisDocId(SCAN_ID, "a".repeat(16).padEnd(64, "0"))).toBe(docId);
  h.store.set(`users/user-a/scanAnalyses/${docId}`, { ...record, createdAt: { toMillis: () => 1000, toDate: () => new Date(1000) } });
}

const post = () =>
  POST(
    new NextRequest("http://localhost/api/skin-check/chat", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer good" },
      body: JSON.stringify({ scanId: SCAN_ID, region: "cheeks", history: [], message: "what does my cheek reading mean?" }),
    })
  );

const GOOD = JSON.stringify({ claims: [{ claim_type: "uncertainty", text: UNCERTAINTY.text, fact_ids: [UNCERTAINTY.id] }], needs_referral: false });
let logged: unknown[][] = [];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  vi.stubEnv("FIREBASE_PRIVATE_KEY", "test-private-key");
  vi.stubEnv("ECHO_CONTEXT_PATH", "on");
  h.store.clear();
  h.reads.length = 0;
  h.generateContent.mockResolvedValue({ text: GOOD });
  seedAnalysis();
  logged = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => void logged.push(args));
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const sentToGemini = () => JSON.stringify(h.generateContent.mock.calls);
const expectNoCanary = (text: string) => {
  for (const c of CANARIES) expect(text, c).not.toContain(c);
};

describe("TD-33 (2): product names never reach Gemini or a log", () => {
  // Names on the check, and a later-answers record with its own names (the
  // rules allow that record only for a skipped check; here both exist so one
  // run covers both sources).
  function seedBoth() {
    h.store.set(CHECK, { answers: { ...BASICS, ...QUESTIONS }, questionnaire: "answered", questionnaireVersion: 2, productNames: NAMES });
    h.store.set(LATER, { scanId: SCAN_ID, answers: QUESTIONS, questionnaireVersion: 2, productNames: LATER_NAMES });
  }

  it("context path: Gemini is called, and no name from either record is in its argument", async () => {
    seedBoth();
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.generateContent).toHaveBeenCalled();
    expectNoCanary(sentToGemini());
  });

  it("today's Echo (behind the switch): Gemini is called, and no name is in its argument", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ECHO_CONTEXT_PATH", "off");
    h.generateContent.mockResolvedValue({ text: "Your cheek reading is one photo's view." });
    seedBoth();
    const res = await post();
    expect(res.status).toBe(200);
    expect(h.generateContent).toHaveBeenCalled();
    expectNoCanary(sentToGemini());
  });

  it("a name smuggled into answers (an unknown key) is not sent either", async () => {
    h.store.set(CHECK, { answers: { ...BASICS, ...QUESTIONS, productNames: NAMES.prescription, prescription_name: NAMES.prescription } });
    await post();
    expect(h.generateContent).toHaveBeenCalled();
    expectNoCanary(sentToGemini());
  });

  it("the trusted loader returns answers only: no productNames from the check or the later record", async () => {
    seedBoth();
    const ctx = await loadTrustedEchoContext("user-a", SCAN_ID);
    expect(ctx).not.toBeNull();
    expect(Object.keys(ctx!.answers)).not.toContain("productNames");
    expectNoCanary(JSON.stringify(ctx));
  });

  it("no log line carries a name: a normal answer, a Gemini failure and a Firestore failure", async () => {
    seedBoth();
    await post();
    h.generateContent.mockRejectedValueOnce(Object.assign(new Error(`bad request ${NAMES.prescription}`), { status: 400 }));
    await post();
    h.store.set(CHECK, { answers: "not a map", productNames: NAMES });
    await post();
    expect(logged.length).toBeGreaterThan(0); // the failure paths did log
    expectNoCanary(JSON.stringify(logged.map((args) => args.map(String))));
  });
});

describe("TD-33 (1): a skipped check keeps F11 until its questions are answered", () => {
  it("skipped: the fixed reply with the finish line, and no Gemini call", async () => {
    h.store.set(CHECK, { answers: BASICS, questionnaire: "skipped", questionnaireVersion: 2 });
    const res = await post();
    const { reply } = (await res.json()) as { reply: string };
    expect(res.status).toBe(200);
    expect(reply.split("\n").at(-1)).toBe(FINISH_QUESTIONNAIRE_COPY);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("a record that claims 'answered' with only name, age and gender gets the same: no call", async () => {
    h.store.set(CHECK, { answers: BASICS, questionnaire: "answered" });
    const { reply } = (await (await post()).json()) as { reply: string };
    expect(reply).toContain(FINISH_QUESTIONNAIRE_COPY);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("answered later: the same check now gets a Gemini call, with the later answers", async () => {
    h.store.set(CHECK, { answers: BASICS, questionnaire: "skipped", questionnaireVersion: 2 });
    h.store.set(LATER, { scanId: SCAN_ID, answers: QUESTIONS, questionnaireVersion: 2 });
    const { reply } = (await (await post()).json()) as { reply: string };
    expect(h.generateContent).toHaveBeenCalledTimes(1);
    expect(reply).not.toContain(FINISH_QUESTIONNAIRE_COPY);
  });

  it("partial answers (one question) get the fixed reply too: no Gemini call (safety review MED-1)", async () => {
    h.store.set(CHECK, { answers: { ...BASICS, skin_factors: ["stress"] }, questionnaire: "answered" });
    const { reply } = (await (await post()).json()) as { reply: string };
    expect(reply).toContain(FINISH_QUESTIONNAIRE_COPY);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("a later record never replaces a check's own answers, nor name, age or gender (reviews MED-2)", async () => {
    h.store.set(CHECK, { answers: { ...BASICS, ...QUESTIONS, female_skin_context: ["pregnant_or_breastfeeding"] }, questionnaire: "skipped" });
    h.store.set(LATER, { scanId: SCAN_ID, answers: { ...QUESTIONS, female_skin_context: ["none_not_sure"], gender: "male", age: "45-plus" } });
    const ctx = await loadTrustedEchoContext("user-a", SCAN_ID);
    expect(ctx!.answers.female_skin_context).toEqual(["pregnant_or_breastfeeding"]);
    expect(ctx!.answers.gender).toBe("female");
    h.store.set(CHECK, { answers: BASICS, questionnaire: "skipped" });
    const later = await loadTrustedEchoContext("user-a", SCAN_ID);
    expect(later!.answers.gender).toBe("female");
    expect(later!.answers.age).toBe("25-34");
  });

  it("today's Echo keeps F11 too: a skipped check, no Gemini call", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ECHO_CONTEXT_PATH", "off");
    h.store.set(CHECK, { answers: BASICS, questionnaire: "skipped" });
    const { reply } = (await (await post()).json()) as { reply: string };
    expect(reply.split("\n").at(-1)).toBe(FINISH_QUESTIONNAIRE_COPY);
    expect(h.generateContent).not.toHaveBeenCalled();
  });

  it("the later record is read for the same check only", async () => {
    h.store.set(CHECK, { answers: BASICS, questionnaire: "skipped" });
    await post();
    expect(h.reads).toContain(LATER);
    expect(h.reads.filter((r) => r.includes("laterAnswers"))).toEqual([LATER]);
  });
});
