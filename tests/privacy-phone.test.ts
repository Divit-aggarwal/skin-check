import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { isStepAnswerValid, PHONE_VERIFIED, reusableAnswers } from "@/lib/skin-check-validation";
import { SECTIONS } from "@/lib/skin-check-steps";
import type { StepConfig } from "@/types/skin-check";

// H02c (D-19): phone steps store the marker "verified", never the number.
const phoneSteps = SECTIONS.flatMap((s) => s.steps).filter((s): s is StepConfig & { type: "phone" } => s.type === "phone");

describe("phone answers", () => {
  it("there are exactly the two phone steps", () => {
    expect(phoneSteps.map((s) => s.id).sort()).toEqual(["final_phone", "phone_verify"]);
  });

  it('"verified" is a valid answer for both phone steps', () => {
    for (const step of phoneSteps) expect(isStepAnswerValid(step, PHONE_VERIFIED)).toBe(true);
    expect(PHONE_VERIFIED).toBe("verified");
    expect(PHONE_VERIFIED).not.toMatch(/\d/);
  });

  it("a legacy number still validates, so old drafts restore", () => {
    for (const step of phoneSteps) {
      expect(isStepAnswerValid(step, "+919999900001")).toBe(true);
      expect(isStepAnswerValid(step, "garbage")).toBe(false);
    }
  });

  it("phone answers are never carried into a reused questionnaire", () => {
    const reused = reusableAnswers({ phone_verify: "+919999900001", final_phone: "verified", name: "A" }) ?? {};
    expect(JSON.stringify(reused)).not.toMatch(/\+?\d{10,}/);
  });

  // No DOM renderer in this suite (vitest runs in node), so the component's
  // save path is pinned at the source: both answers are the marker, and
  // user.phoneNumber is only ever displayed.
  it("PhoneAuthStep writes PHONE_VERIFIED, never user.phoneNumber, into answers", () => {
    const src = readFileSync("components/skin-check/inputs/PhoneAuthStep.tsx", "utf8");
    expect(src).toContain("const verified = PHONE_VERIFIED;");
    expect(src).toContain("{ ...answers, [step.id]: verified }");
    const phoneNumberUses = src.split("\n").filter((line) => line.includes("phoneNumber") && !line.trim().startsWith("//"));
    for (const line of phoneNumberUses) {
      expect(line, line).not.toMatch(/onChange\(|saveSkinCheck\(|verified\s*=/);
    }
  });
});
