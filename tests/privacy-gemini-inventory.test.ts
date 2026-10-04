import { beforeEach, describe, expect, it, vi } from "vitest";

// H03: pins exactly what reaches Gemini. The SDK is mocked at the boundary, so
// the assertions are on the real generateContent argument, not on a helper.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { ECHO_SAFETY_INSTRUCTION, GEMINI_FIELD_INVENTORY, getSkinCheckChatReply } from "@/lib/gemini";
// One list since the wave-2 merge (wiring 3): the rules list that evaluateSafety reads.
import { EXTRA_CAUTION_TRIGGERS } from "@/lib/rules/settings";
import { SECTIONS } from "@/lib/skin-check-steps";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import type { SkinCheckAnswers, StepConfig } from "@/types/skin-check";

const NAME = "ZZNAMEZZ";
const PHONE = "+919999999999";

// One answer for every step, of the right type for that step.
function answerFor(step: StepConfig): string | string[] {
  switch (step.type) {
    case "text":
      return NAME;
    case "phone":
      return PHONE;
    case "photo-capture":
      return "done";
    case "scale-1-5":
      return Object.keys(step.reflections)[0]!;
    case "multi-select-cards":
    case "body-map":
      return [step.options[0]!.value];
    default:
      return step.options[0]!.value;
  }
}

const STEPS = SECTIONS.flatMap((s) => s.steps);
const ANSWERS: SkinCheckAnswers = {
  ...Object.fromEntries(STEPS.map((step) => [step.id, answerFor(step)])),
  female_skin_context: ["pregnant_or_breastfeeding"],
  ZZUNKNOWNZZ: "ZZUNKNOWNZZ",
};

// Distinct non-round values, so a leaked number would be easy to spot.
const SCORES = { redness: 0.731, oiliness: 0.512, texture: 0.268, pores: 0.444, blemishes: 0.613, hydration: 0.127, pigment: 0.389 };

async function captureCall(answers: SkinCheckAnswers = ANSWERS) {
  const composite = summarizeConcerns(SCORES, bandScores(SCORES).bands);
  await getSkinCheckChatReply([{ role: "user", text: "hello" }], {
    answers,
    scores: SCORES,
    composite,
    regionFocus: { region: "Cheeks", scores: SCORES },
  });
  expect(generateContent).toHaveBeenCalledTimes(1);
  const arg = generateContent.mock.calls[0]![0] as {
    contents: { role: string; parts: { text: string }[] }[];
    config: { systemInstruction: string };
  };
  // Prompt text only: the request options carry a timeout, which is not user data.
  return { instruction: arg.config.systemInstruction, all: JSON.stringify([arg.config.systemInstruction, arg.contents]) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("GEMINI_API_KEY", "test-key");
  generateContent.mockResolvedValue({ text: "ok" });
});

describe("H03 Gemini field inventory", () => {
  it("classifies every quiz step id", () => {
    const missing = STEPS.map((s) => s.id).filter((id) => !(id in GEMINI_FIELD_INVENTORY));
    expect(missing, `add these step ids to GEMINI_FIELD_INVENTORY on purpose: ${missing.join(", ")}`).toEqual([]);
    const stale = Object.keys(GEMINI_FIELD_INVENTORY).filter((id) => !STEPS.some((s) => s.id === id));
    expect(stale, `remove stale ids from GEMINI_FIELD_INVENTORY: ${stale.join(", ")}`).toEqual([]);
  });

  it("sends exactly the steps marked sent", async () => {
    const { instruction } = await captureCall();
    const rendered = STEPS.filter((s) => instruction.includes(s.prompt)).map((s) => s.id).sort();
    const sent = Object.entries(GEMINI_FIELD_INVENTORY)
      .filter(([, mark]) => mark === "sent")
      .map(([id]) => id)
      .sort();
    expect(rendered).toEqual(sent);
  });

  // Step 12 (owner decision 8a): name, age, gender and female_skin_context
  // moved to not_sent. Changing this list is a deliberate privacy decision.
  it("pins the approved not-sent set", () => {
    const notSent = Object.entries(GEMINI_FIELD_INVENTORY)
      .filter(([, mark]) => mark === "not_sent")
      .map(([id]) => id)
      .sort();
    expect(notSent).toEqual(["age", "female_skin_context", "final_phone", "gender", "name", "phone_verify", "skin_photo"]);
  });

  // getSkinCheckChatReply takes no uid or scanId at all, so none can reach the
  // prompt through it; the route passes only answers, scores and the region.
  it("never sends phone numbers, unknown keys or numeric scores", async () => {
    const { all } = await captureCall();
    for (const banned of [PHONE, "9999999999", "ZZUNKNOWNZZ", "0.731", "731"]) {
      expect(all, banned).not.toContain(banned);
    }
    expect(all).not.toMatch(/\d{3,}/);
  });

  it("sends exactly these band categories", async () => {
    const { instruction } = await captureCall();
    const categories = new Set(
      instruction
        .split("\n")
        .map((line) => /^([A-Za-z ]+): (Low|Moderate|Elevated)$/.exec(line)?.[1])
        .filter(Boolean)
    );
    expect(Array.from(categories).sort()).toEqual(
      ["Blemishes", "Oiliness", "Pigmentation", "Redness", "Texture irregularity"].sort()
    );
  });

  it("name, age, gender, female context and Dryness never reach Gemini", async () => {
    const { all } = await captureCall();
    for (const banned of [NAME, "How old are you?", "What's your gender?", "Female", "hormonal", "pregnan", "Dryness", "dryness", "hydration"]) {
      expect(all, banned).not.toContain(banned);
    }
  });
});

// TD-17 (1), tracker H19: one instruction for every user; the extra-caution
// flag is not sent. Replaces the extraCaution part of owner decision 8a.
describe("one safety instruction for every user (TD-17, H19)", () => {
  const FEMALE_WORDS = /pregnan|breastfeed|contracepti|menopaus|\bperiods?\b|hormon|reproductive|female/i;

  it("every user gets the same sentence exactly once, with or without a caution answer", async () => {
    for (const answers of [{ primary_concerns: ["blemishes"] }, { primary_concerns: ["blemishes"], current_products: ["prescription"] }, ANSWERS]) {
      generateContent.mockClear();
      const { instruction, all } = await captureCall(answers);
      expect(instruction.split(ECHO_SAFETY_INSTRUCTION)).toHaveLength(2);
      expect(all).not.toMatch(/caution/i);
    }
  });

  it("the sentence gives no reason and no telltale example list, and avoids the persona's banned words", () => {
    expect(ECHO_SAFETY_INSTRUCTION).not.toMatch(FEMALE_WORDS);
    expect(ECHO_SAFETY_INSTRUCTION).not.toMatch(/prescri|retinoid|acid|vitamin|why|caution|this user/i);
    expect(ECHO_SAFETY_INSTRUCTION).toMatch(/active ingredients or new products/);
    expect(ECHO_SAFETY_INSTRUCTION).toMatch(/ask\s+a doctor before starting anything new/);
  });

  it("a caution answer is still hidden, with stray case or spaces too; other current products are still sent", async () => {
    const { all } = await captureCall({ primary_concerns: ["blemishes"], current_products: ["actives", " Prescription "] });
    expect(all).not.toContain("A prescription product");
    expect(all).toContain("Actives");
  });

  it("the trigger list is the provisional one awaiting clinical review (E05)", () => {
    expect(EXTRA_CAUTION_TRIGGERS).toEqual([
      { field: "female_skin_context", anyOf: ["pregnant_or_breastfeeding"] },
      { field: "current_products", anyOf: ["prescription"] },
    ]);
  });

  // Two users who differ only in a hidden answer. Each pair is [with, without].
  const BASE: SkinCheckAnswers = { primary_concerns: ["blemishes"], skin_type: "oily", male_skin_context: ["shaving_irritation"] };
  const PAIRS: [string, SkinCheckAnswers, SkinCheckAnswers][] = [
    ["pregnant vs no answer", { ...BASE, female_skin_context: ["pregnant_or_breastfeeding"] }, BASE],
    ["pregnant vs another female answer", { ...BASE, female_skin_context: ["pregnant_or_breastfeeding"] }, { ...BASE, female_skin_context: ["menopause"] }],
    ["actives+prescription vs actives", { ...BASE, current_products: ["actives", "prescription"] }, { ...BASE, current_products: ["actives"] }],
    ["prescription vs no answer", { ...BASE, current_products: ["prescription"] }, BASE],
    ["prescription vs empty list", { ...BASE, current_products: ["prescription"] }, { ...BASE, current_products: [] }],
  ];

  it.each(PAIRS)("today's Echo: Gemini receives the same request (%s)", async (_, withHidden, without) => {
    generateContent.mockClear();
    const a = await captureCall(withHidden);
    generateContent.mockClear();
    const b = await captureCall(without);
    expect(a.all).toBe(b.all);
  });

  // Every call, including the retry: the first answer names an active, which
  // the validator rejects for everyone, so both users get the same retry prompt.
  it.each(PAIRS)("context path: every Gemini call is the same, retry included (%s)", async (_, withHidden, without) => {
    const { buildContextPackage } = await import("@/lib/context/builder");
    const { answerFromPackage } = await import("@/lib/context/answer");
    const { generateContextAnswer } = await import("@/lib/gemini");
    const { evaluateSafety } = await import("@/lib/rules/safety");
    const run = async (answers: SkinCheckAnswers) => {
      generateContent.mockReset();
      generateContent.mockResolvedValue({ text: JSON.stringify({ claims: [{ claim_type: "smalltalk", text: "Try retinol.", fact_ids: [] }], needs_referral: false }) });
      const safety = evaluateSafety({ answers, confirmedThisScan: [] });
      const pkg = buildContextPackage({ regionFocus: "cheeks", message: "hi", skin: { scores: SCORES, regionScores: { cheeks: SCORES }, regionLowConfidence: {}, pipelineVersion: null }, answers, safety });
      await answerFromPackage(pkg, "hi", [], { generate: generateContextAnswer, redFlag: safety.redFlag });
      return JSON.stringify(generateContent.mock.calls.map((c) => c[0]));
    };
    const a = await run(withHidden);
    expect(generateContent).toHaveBeenCalledTimes(2);
    expect(a).toContain(ECHO_SAFETY_INSTRUCTION.split("\n")[0]);
    expect(a).toBe(await run(without));
  });
});

// ── lane:context (add-only) ──────────────────────────────────────────────────
// The context-package path (D-14, approved for local use): the same pins,
// on the real generateContent argument of generateContextAnswer.
describe("context-package path (lane:context)", () => {
  const MESSAGE = "ZZMESSAGEZZ what about my cheeks?";

  async function captureContextCall(answers: SkinCheckAnswers = ANSWERS) {
    const { buildContextPackage } = await import("@/lib/context/builder");
    const { answerFromPackage } = await import("@/lib/context/answer");
    const { generateContextAnswer } = await import("@/lib/gemini");
    const pkg = buildContextPackage({
      regionFocus: "cheeks",
      message: MESSAGE,
      skin: { scores: SCORES, regionScores: { cheeks: SCORES }, regionLowConfidence: {}, pipelineVersion: null },
      answers,
    });
    generateContent.mockResolvedValue({ text: "{}" });
    await answerFromPackage(pkg, MESSAGE, [], { generate: generateContextAnswer, redFlag: false });
    const arg = generateContent.mock.calls[0]![0] as {
      contents: { role: string; parts: { text: string }[] }[];
      config: { systemInstruction: string; responseJsonSchema?: unknown; safetySettings?: unknown[]; tools?: unknown };
    };
    return { arg, pkg, instruction: arg.config.systemInstruction, all: JSON.stringify([arg.config.systemInstruction, arg.contents]) };
  }

  it("never sends names, phones, unknown keys, numeric scores or not-sent steps", async () => {
    const { all } = await captureContextCall();
    for (const banned of [NAME, PHONE, "9999999999", "ZZUNKNOWNZZ", "0.731", "731", "How old are you?", "What's your gender?", "Dryness"]) {
      expect(all, banned).not.toContain(banned);
    }
    expect(all).not.toMatch(/\d{3,}/);
  });

  it("female context never leaks, and the caution trigger answer is dropped", async () => {
    const { all, instruction } = await captureContextCall({ ...ANSWERS, current_products: ["actives", "prescription"] });
    expect(all).not.toMatch(/pregnan|breastfeed|contracepti|menopaus|\bperiods?\b|hormon|reproductive|female/i);
    expect(all).not.toContain("A prescription product");
    expect(instruction.split(ECHO_SAFETY_INSTRUCTION)).toHaveLength(2);
    expect(all).not.toMatch(/caution/i);
  });

  // Quiz labels the user chose (e.g. "Small bumps or clogged pores") are self-reports, sent today too.
  it("hydration and pores appear only as missing items or the user's own quiz labels, never as a reading", async () => {
    const { pkg, instruction } = await captureContextCall();
    const quoted = [...pkg.missing, ...(pkg.selfReported ?? [])].map((f) => JSON.stringify(f.text));
    const withoutMissing = quoted.reduce((t, q) => t.split(q).join(""), instruction).replace(/"about":"(hydration|pores)"|"missing\.all\.(hydration|pores)"/g, "");
    expect(withoutMissing).not.toMatch(/hydrat|\bpores?\b|Pore visibility/i);
    expect(pkg.skin!.readings.map((r) => r.metric).sort()).toEqual(["blemishes", "blemishes", "oiliness", "oiliness", "pigment", "pigment", "redness", "redness", "texture", "texture"]);
  });

  it("the user's message goes only in contents; structured output, explicit safety settings, no tools", async () => {
    const { arg, instruction } = await captureContextCall();
    expect(instruction).not.toContain("ZZMESSAGEZZ");
    expect(JSON.stringify(arg.contents)).toContain("ZZMESSAGEZZ");
    expect(arg.config.responseJsonSchema).toBeTruthy();
    expect(arg.config.safetySettings).toHaveLength(4);
    expect(arg.config.tools).toBeUndefined();
    expect(instruction).not.toMatch(/digital twin|confidence: (low|medium|high)/i);
  });
});

describe("context-package path with every internal input (lane:context)", () => {
  it("no uid, scanId, rule id, trigger, date, ref or internal number from the internal results reaches Gemini", async () => {
    const { buildContextPackage } = await import("@/lib/context/builder");
    const { answerFromPackage } = await import("@/lib/context/answer");
    const { generateContextAnswer } = await import("@/lib/gemini");
    const { fullInput, withExtraKeys, SECRETS } = await import("./context-fixtures");
    const input = withExtraKeys(fullInput());
    generateContent.mockResolvedValue({ text: "{}" });
    await answerFromPackage(buildContextPackage(input), input.message, [], { generate: generateContextAnswer, redFlag: false });
    const all = JSON.stringify(generateContent.mock.calls[0]![0]);
    for (const secret of SECRETS) expect(all, secret).not.toContain(secret);
    expect(all).not.toMatch(/redFlag|raisedBy|ruleId|triggeredBy|inputSha256|ZZSECRET/);
  });
});

// ── wave-2 security review: today's Echo sets explicit safety settings ──────
describe("today's Echo call (wave-2 security review)", () => {
  it("passes explicit safety settings, not the platform default", async () => {
    generateContent.mockClear();
    await captureCall();
    const config = (generateContent.mock.calls[0]![0] as { config: { safetySettings?: { category: string; threshold: string }[] } }).config;
    expect(config.safetySettings?.map((s) => s.category).sort()).toEqual([
      "HARM_CATEGORY_DANGEROUS_CONTENT", "HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH", "HARM_CATEGORY_SEXUALLY_EXPLICIT",
    ]);
    expect(new Set(config.safetySettings!.map((s) => s.threshold))).toEqual(new Set(["BLOCK_MEDIUM_AND_ABOVE"]));
  });
});
