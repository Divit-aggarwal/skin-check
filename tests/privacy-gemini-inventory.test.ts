import { beforeEach, describe, expect, it, vi } from "vitest";

// H03: pins exactly what reaches Gemini. The SDK is mocked at the boundary, so
// the assertions are on the real generateContent argument, not on a helper.
const { generateContent } = vi.hoisted(() => ({ generateContent: vi.fn() }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent };
  },
}));

import { EXTRA_CAUTION_INSTRUCTION, EXTRA_CAUTION_TRIGGERS, GEMINI_FIELD_INVENTORY, getSkinCheckChatReply } from "@/lib/gemini";
import { SECTIONS } from "@/lib/skin-check-steps";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import type { SkinCheckAnswers, StepConfig } from "@/types/skin-check";

const NAME = "ZZNAMEZZ";
const PHONE = "+919999999999";
const UID = "uid-ZZUIDZZ";
const SCAN_ID = "scan-ZZSCANZZ";

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

  it("never sends phone numbers, unknown keys, ids or numeric scores", async () => {
    const { all } = await captureCall();
    for (const banned of [PHONE, "9999999999", "ZZUNKNOWNZZ", UID, SCAN_ID, "0.731", "731"]) {
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

describe("extra caution flag (owner decision 8)", () => {
  const FEMALE_WORDS = /pregnan|breastfeed|contracepti|menopaus|\bperiods?\b|hormon|reproductive|female/i;

  it("each trigger alone turns it on: one fixed sentence, and no trigger value or reason leaks", async () => {
    for (const [stepId, values] of Object.entries(EXTRA_CAUTION_TRIGGERS)) {
      for (const value of values) {
        generateContent.mockClear();
        const answers = { primary_concerns: ["blemishes"], gender: "female", [stepId]: [value] };
        const { instruction, all } = await captureCall(answers);
        expect(instruction, `${stepId}=${value}`).toContain(EXTRA_CAUTION_INSTRUCTION);
        expect(instruction.split(EXTRA_CAUTION_INSTRUCTION)).toHaveLength(2);
        expect(all).not.toMatch(FEMALE_WORDS);
        expect(all).not.toContain("pregnant_or_breastfeeding");
      }
    }
  });

  it("off without a trigger answer: the sentence is absent", async () => {
    const { instruction } = await captureCall({ primary_concerns: ["blemishes"], current_products: ["actives"], female_skin_context: ["menopause"] });
    expect(instruction).not.toContain("Extra caution");
  });

  it("the sentence itself gives no reason", () => {
    expect(EXTRA_CAUTION_INSTRUCTION).not.toMatch(FEMALE_WORDS);
    expect(EXTRA_CAUTION_INSTRUCTION).not.toMatch(/prescri/i);
  });

  it("the trigger list is the provisional one awaiting clinical review (E05)", () => {
    expect(EXTRA_CAUTION_TRIGGERS).toEqual({
      female_skin_context: ["pregnant_or_breastfeeding"],
      current_products: ["prescription"],
    });
  });
});
