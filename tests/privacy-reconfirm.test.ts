import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SECTIONS } from "@/lib/skin-check-steps";
import { nextEligibleIndex, revealCountFor } from "@/lib/useSkinCheckFlow";
import { RECONFIRM_EACH_SCAN_IDS, reusableAnswers } from "@/lib/skin-check-validation";
import { reconfirmHints } from "@/lib/skin-check-format";
import type { SkinCheckAnswers } from "@/types/skin-check";

// H02b (D-19): current_products and female_skin_context are asked again on
// every scan, blank, with last time's answer as a hint only (decision 10a).
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

describe("re-confirm on every scan", () => {
  it("the re-confirmed ids are exactly current_products and female_skin_context", () => {
    expect([...RECONFIRM_EACH_SCAN_IDS].sort()).toEqual(["current_products", "female_skin_context"]);
  });

  it("reusableAnswers drops both, and still reuses an otherwise complete set", () => {
    const reuse = reusableAnswers(saved("female"));
    expect(reuse).not.toBeNull();
    expect(reuse).not.toHaveProperty("current_products");
    expect(reuse).not.toHaveProperty("female_skin_context");
    expect(reuse).toMatchObject({ skin_type: expect.any(String), male_skin_context: expect.any(Array) });
  });

  it("female: the reuse walk visits both re-confirm sections", () => {
    const reuse = reusableAnswers(saved("female"))!;
    expect(walk(reuse, indexOf("verify"))).toEqual(["verify", "skin-photo", "your-skin", "personal-context", "get-your-results"]);
  });

  it("male: the reuse walk visits only the current_products section", () => {
    const reuse = reusableAnswers(saved("male"))!;
    expect(walk(reuse, indexOf("verify"))).toEqual(["verify", "skin-photo", "your-skin", "get-your-results"]);
  });

  it("re-confirmed steps start blank: the section is not complete until they are answered", () => {
    const reuse = reusableAnswers(saved("female"))!;
    for (const id of ["your-skin", "personal-context"]) {
      const section = SECTIONS[indexOf(id)]!;
      const eligible = section.steps.filter((s) => !s.condition || s.condition(reuse));
      const blank = eligible.find((s) => RECONFIRM_EACH_SCAN_IDS.includes(s.id))!;
      expect(reuse[blank.id]).toBeUndefined();
      // The reveal stops at (and includes) the blank step.
      expect(revealCountFor(section, reuse)).toBe(eligible.indexOf(blank) + 1);
    }
  });

  it("an under-18 saved answer still can't be reused", () => {
    expect(reusableAnswers({ ...saved("female"), age: "under-18" })).toBeNull();
  });
});

describe("last-time hints (decision 10a)", () => {
  it("returns label text for each re-confirmed step, and nothing else", () => {
    expect(reconfirmHints(saved("female"))).toEqual({
      current_products: "Last time you said: A prescription product",
      female_skin_context: "Last time you said: I'm currently pregnant or breastfeeding",
    });
  });

  it("unknown values are dropped, never echoed", () => {
    expect(reconfirmHints({ current_products: ["ZZINJECTZZ"] })).toEqual({});
  });

  it("the hint never becomes an answer: reuse drops both ids, and the hook keeps hints in their own state", () => {
    const reuse = reusableAnswers(saved("female"))!;
    for (const id of RECONFIRM_EACH_SCAN_IDS) expect(reuse).not.toHaveProperty(id);
    // No DOM renderer in this suite: pin at the source that hints are only
    // ever set through setLastAnswerHints, never merged into answers.
    const hook = readFileSync("lib/useSkinCheckFlow.ts", "utf8");
    expect(hook.match(/reconfirmHints\(/g)).toHaveLength(2);
    for (const line of hook.split("\n").filter((l) => l.includes("reconfirmHints("))) {
      expect(line).toContain("setLastAnswerHints(");
    }
    expect(hook).not.toMatch(/setAnswers\([^)]*[Hh]int/);
  });
});
