import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/lib/skin-check-steps";
import { nextEligibleIndex } from "@/lib/useSkinCheckFlow";
import { reusableAnswers, reusableBasics, safetyQuestionsAnswered } from "@/lib/skin-check-validation";
import { evaluateSafety } from "@/lib/rules/safety";
import type { SkinCheckAnswers } from "@/types/skin-check";

// Owner decision 2026-10-11 (replaces D-19's re-asking of current_products and
// female_skin_context on every check): a returning user who answered the
// questions goes from "New check" to the photo step, and the saved answers,
// those two included, are attached to the new check.
const indexOf = (id: string) => SECTIONS.findIndex((s) => s.id === id);

function saved(gender: "female" | "male"): SkinCheckAnswers {
  const answers: SkinCheckAnswers = { age: "25-34", gender };
  for (const step of SECTIONS.flatMap((s) => s.steps)) {
    if (step.id in answers) continue;
    if (step.type === "phone") answers[step.id] = "verified";
    else if (step.type === "photo-capture") answers[step.id] = "done";
    else if (step.type === "text") answers[step.id] = "Asha";
    else if (step.type === "scale-1-5") answers[step.id] = "3";
    else if (step.type === "multi-select-cards" || step.type === "body-map") answers[step.id] = [step.options[0]!.value];
    else answers[step.id] = step.options[0]!.value;
  }
  answers.female_skin_context = ["pregnant_or_breastfeeding"];
  answers.current_products = ["prescription"];
  return answers;
}

function walk(answers: SkinCheckAnswers, from: number): string[] {
  const visited: string[] = [];
  for (let idx = from; idx < SECTIONS.length; idx = nextEligibleIndex(idx + 1, answers, true)) visited.push(SECTIONS[idx]!.id);
  return visited;
}

describe("returning user who answered: no question on a new check", () => {
  it.each(["female", "male"] as const)("%s: the walk is verify, photo, results", (gender) => {
    const reuse = reusableAnswers(saved(gender))!;
    expect(walk(reuse, indexOf("verify"))).toEqual(["verify", "skin-photo", "get-your-results"]);
  });

  it("the saved answers carry over, the two once re-asked included; per-check answers never do", () => {
    const reuse = reusableAnswers(saved("female"))!;
    expect(reuse).toMatchObject({ current_products: ["prescription"], female_skin_context: ["pregnant_or_breastfeeding"], skin_type: expect.any(String) });
    for (const id of ["phone_verify", "skin_photo", "final_phone"]) expect(reuse).not.toHaveProperty(id);
  });

  it("Echo and product suggestions work for the new check: the safety questions count as answered", () => {
    expect(safetyQuestionsAnswered(reusableAnswers(saved("female"))!)).toBe(true);
    expect(safetyQuestionsAnswered(reusableAnswers(saved("male"))!)).toBe(true);
  });

  it("the doctor line and the red-flag guard work from the saved answers", () => {
    const reuse = reusableAnswers(saved("male"))!;
    expect(evaluateSafety({ answers: reuse, confirmedThisScan: [] })).toMatchObject({ extraCaution: true });
    const pregnant = reusableAnswers({ ...saved("female"), current_products: ["none"] })!;
    expect(evaluateSafety({ answers: pregnant, confirmedThisScan: [] })).toMatchObject({ extraCaution: true });
    const flagged = reusableAnswers({ ...saved("male"), breakout_pattern: ["deep_painful"] })!;
    expect(evaluateSafety({ answers: flagged, confirmedThisScan: [] })).toMatchObject({ redFlag: true });
  });

  it("a saved set missing a question is not reused (the record would be incomplete)", () => {
    const { current_products: _, ...missing } = saved("female");
    expect(reusableAnswers(missing)).toBeNull();
  });

  it("an under-18 saved answer still can't be reused", () => {
    expect(reusableAnswers({ ...saved("female"), age: "under-18" })).toBeNull();
  });

  it("a user who skipped the questions before gets the choice again (basics only)", () => {
    expect(reusableBasics({ name: "Asha", age: "25-34", gender: "female" })).toEqual({ name: "Asha", age: "25-34", gender: "female" });
  });

  it("no 'Last time you said' hint is left anywhere in the flow", () => {
    for (const f of ["lib/useSkinCheckFlow.ts", "components/skin-check/SkinCheckFlow.tsx", "lib/skin-check-format.ts"]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/Last time you said|lastAnswerHints|reconfirmHints/);
    }
  });
});
