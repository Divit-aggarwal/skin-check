import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/lib/skin-check-steps";
import { nextEligibleIndex, prevEligibleIndex, revealCountFor } from "@/lib/useSkinCheckFlow";
import { reusableAnswers } from "@/lib/skin-check-validation";
import type { SkinCheckAnswers } from "@/types/skin-check";

const indexOf = (id: string) => SECTIONS.findIndex((s) => s.id === id);

function savedAnswers(): SkinCheckAnswers {
  const answers: SkinCheckAnswers = { age: "25-34", gender: "male" };
  for (const section of SECTIONS) {
    for (const step of section.steps) {
      if (step.id in answers) continue;
      if (step.type === "phone") answers[step.id] = "+919876543210";
      else if (step.type === "photo-capture") answers[step.id] = "done";
      else if (step.type === "text") answers[step.id] = "Ravi";
      else if (step.type === "scale-1-5") answers[step.id] = "3";
      else if (step.type === "multi-select-cards" || step.type === "body-map") answers[step.id] = [step.options[0]!.value];
      else answers[step.id] = step.options[0]!.value;
    }
  }
  return answers;
}

// Walks the flow the way next() does, recording each section a user lands on.
function walk(answers: SkinCheckAnswers, reusing: boolean, from: number): string[] {
  const visited: string[] = [];
  let idx = from;
  while (idx < SECTIONS.length) {
    visited.push(SECTIONS[idx]!.id);
    idx = nextEligibleIndex(idx + 1, answers, reusing);
  }
  return visited;
}

describe("skin-check flow navigation", () => {
  it("a first scan goes through every section in order", () => {
    expect(walk({ gender: "female" }, false, 0)).toEqual(SECTIONS.map((s) => s.id));
  });

  it("a repeat scan goes verify → photo → results and nothing else", () => {
    const reuse = reusableAnswers(savedAnswers())!;
    expect(walk(reuse, true, indexOf("verify"))).toEqual(["verify", "skin-photo", "get-your-results"]);
  });

  it("back from results on a repeat scan returns to the photo, not the questionnaire", () => {
    const reuse = reusableAnswers(savedAnswers())!;
    expect(SECTIONS[prevEligibleIndex(indexOf("get-your-results") - 1, reuse, true)]!.id).toBe("skin-photo");
  });

  it("back from verify on a repeat scan reaches About You so answers can still be corrected", () => {
    const reuse = reusableAnswers(savedAnswers())!;
    expect(prevEligibleIndex(indexOf("verify") - 1, reuse, true)).toBe(0);
  });

  it("a repeat scan shows the per-scan step on landing, since its answer was cleared", () => {
    const reuse = reusableAnswers(savedAnswers())!;
    expect(revealCountFor(SECTIONS[indexOf("verify")]!, reuse)).toBe(1);
    expect(reuse.phone_verify).toBeUndefined();
  });
});
