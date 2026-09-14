import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/lib/skin-check-steps";
import { reusableAnswers } from "@/lib/skin-check-validation";
import type { SkinCheckAnswers } from "@/types/skin-check";

// A complete questionnaire, as saved with a finished scan.
function savedAnswers(): SkinCheckAnswers {
  const answers: SkinCheckAnswers = { age: "25-34", gender: "female" };
  for (const section of SECTIONS) {
    for (const step of section.steps) {
      if (step.id in answers) continue;
      if (step.type === "phone") answers[step.id] = "+919876543210";
      else if (step.type === "photo-capture") answers[step.id] = "done";
      else if (step.type === "text") answers[step.id] = "Asha";
      else if (step.type === "scale-1-5") answers[step.id] = "3";
      else if (step.type === "multi-select-cards" || step.type === "body-map") answers[step.id] = [step.options[0]!.value];
      else answers[step.id] = step.options[0]!.value;
    }
  }
  return answers;
}

describe("reusableAnswers", () => {
  it("keeps the questionnaire and drops what belongs to one scan", () => {
    const reuse = reusableAnswers(savedAnswers());
    expect(reuse).not.toBeNull();
    expect(reuse).toMatchObject({ name: "Asha", age: "25-34" });
    expect(reuse).not.toHaveProperty("phone_verify");
    expect(reuse).not.toHaveProperty("skin_photo");
    expect(reuse).not.toHaveProperty("final_phone");
  });

  it("refuses a questionnaire with an unanswered question", () => {
    const answers = savedAnswers();
    delete answers.sunscreen_habit;
    expect(reusableAnswers(answers)).toBeNull();
  });

  it("refuses an under-18 answer", () => {
    expect(reusableAnswers({ ...savedAnswers(), age: "under-18" })).toBeNull();
  });

  it("ignores malformed values instead of trusting them", () => {
    expect(reusableAnswers({ ...savedAnswers(), name: 42 as unknown as string })).toBeNull();
  });
});
