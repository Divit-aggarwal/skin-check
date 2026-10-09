import { describe, expect, it } from "vitest";
import { buildContextPackage, packageFacts } from "@/lib/context/builder";
import { responseSchema } from "@/lib/context/renderer";
import { validateAnswer } from "@/lib/context/validator";
import { evaluateSafety } from "@/lib/rules/safety";
import { ECHO_REGIONS } from "@/lib/echo-regions";
import { FULL_ANSWERS, fullAnswersInput, fullSeries } from "./full-answers-user";

// F19 (2026-10-09): Gemini refused Echo's answer format (400 INVALID_ARGUMENT)
// for a real user with every answer filled in, asking about the forehead: the
// format listed every citable fact, and that list grew past Gemini's limit.
// The format sent to Gemini must not grow with the facts.

const safety = evaluateSafety({ answers: FULL_ANSWERS, confirmedThisScan: [] });
const minimal = buildContextPackage({ regionFocus: null, message: "hi", skin: null, answers: {} });
const AREAS = [...ECHO_REGIONS, null] as const;

describe("the answer format sent to Gemini does not grow with the facts (F19)", () => {
  it("the full-answers user really is the long case: a one-check series and more facts than the 2026-10-09 failure (44)", () => {
    expect(fullSeries().every((r) => r.kind === "skinstate")).toBe(true);
    const forehead = buildContextPackage(fullAnswersInput("forehead", safety));
    expect(packageFacts(forehead).length).toBeGreaterThan(packageFacts(minimal).length);
    expect(packageFacts(forehead).length).toBeGreaterThanOrEqual(44);
  });

  it.each(AREAS)("area %s: the schema equals the schema of a package with no facts at all", (area) => {
    const pkg = buildContextPackage(fullAnswersInput(area, safety));
    expect(JSON.stringify(responseSchema(pkg))).toBe(JSON.stringify(responseSchema(minimal)));
  });

  it("no fact id appears anywhere in the schema", () => {
    const pkg = buildContextPackage(fullAnswersInput("forehead", safety));
    const schema = JSON.stringify(responseSchema(pkg));
    for (const f of packageFacts(pkg)) expect(schema).not.toContain(f.id);
  });

  it("the size of the schema is fixed and small (a hard ceiling, so it cannot creep back)", () => {
    expect(JSON.stringify(responseSchema(minimal)).length).toBeLessThanOrEqual(600);
  });

  // Nothing uncited gets through now that the format accepts any string: the validator
  // still refuses an id that is not a fact of this package.
  it("a made-up fact id is still refused by the validator (unknown_fact_id)", () => {
    const pkg = buildContextPackage(fullAnswersInput("forehead", safety));
    const answer = JSON.stringify({ claims: [{ claim_type: "descriptive", text: "Redness, photo-based estimate for the forehead: Elevated", fact_ids: ["state.forehead.made_up"] }], needs_referral: false, distress: false });
    const v = validateAnswer(answer, pkg, "what does my forehead reading mean?");
    expect(v.passed).toBe(false);
    expect(v.failures.map((f) => f.check)).toContain("unknown_fact_id");
  });
});
