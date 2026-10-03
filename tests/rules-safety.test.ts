import { describe, expect, it } from "vitest";
import { evaluateSafety } from "@/lib/rules/safety";

const safety = (answers: Record<string, unknown>, confirmedThisScan: string[] = []) =>
  evaluateSafety({ answers, confirmedThisScan });

// Each red-flag criterion: the answer that raises it, and the answer just outside it.
describe("red flags (PROVISIONAL list, rules-design §5.1)", () => {
  it.each<[string, Record<string, unknown>, Record<string, unknown>]>([
    ["red_flag.deep_painful_breakouts", { breakout_pattern: ["deep_painful"] }, { breakout_pattern: ["red_inflamed"] }],
    ["red_flag.scarring_breakouts", { breakout_pattern: ["leaves_scars"] }, { breakout_pattern: ["leaves_dark_marks"] }],
    ["red_flag.scar_or_indent", { pih_scar_tendency: "scar_or_indent" }, { pih_scar_tendency: "dark_mark_fades" }],
    ["red_flag.lingering_dark_mark", { pih_scar_tendency: "dark_mark_lingers" }, { pih_scar_tendency: "dark_mark_fades" }],
    [
      "red_flag.irregular_periods_with_breakouts",
      { gender: "female", female_skin_context: ["irregular_periods"], primary_concerns: ["blemishes"] },
      { gender: "female", female_skin_context: ["period_related_breakouts"], primary_concerns: ["blemishes"] },
    ],
  ])("%s", (ruleId, raises, outside) => {
    expect(safety(raises)).toMatchObject({ redFlag: true, raisedBy: [ruleId] });
    expect(safety(outside)).toMatchObject({ redFlag: false });
  });

  it("irregular periods without a breakouts concern is not a red flag", () => {
    expect(safety({ gender: "female", female_skin_context: ["irregular_periods"], primary_concerns: ["pigment"] }).redFlag).toBe(false);
  });

  it.each([["menopause"], ["hormonal_contraception"], ["pregnant_or_breastfeeding"], ["none_not_sure"]])(
    "female_skin_context %s with breakouts is not a red flag",
    (value) => {
      expect(safety({ gender: "female", female_skin_context: [value], primary_concerns: ["blemishes"] }).redFlag).toBe(false);
    }
  );

  it("lists every rule that fired, in list order", () => {
    expect(safety({ breakout_pattern: ["leaves_scars", "deep_painful"], pih_scar_tendency: "scar_or_indent" })).toMatchObject({
      redFlag: true,
      raisedBy: ["red_flag.deep_painful_breakouts", "red_flag.scarring_breakouts", "red_flag.scar_or_indent"],
    });
  });

  it("gender is never checked: a non-female answer with irregular periods still raises it", () => {
    for (const gender of ["male", "other", undefined, ["female", "male"]]) {
      expect(safety({ gender, female_skin_context: ["irregular_periods"], primary_concerns: ["blemishes"] }).redFlag).toBe(true);
    }
  });

  it("a reused, invalid or contradicted answer still raises it", () => {
    expect(safety({ breakout_pattern: ["deep_painful"] }, []).redFlag).toBe(true);
    expect(safety({ breakout_pattern: ["deep_painful", "made_up", 7] }).redFlag).toBe(true);
    expect(safety({ pih_scar_tendency: ["fades_no_trace", "scar_or_indent"] }).redFlag).toBe(true);
    expect(
      safety({ gender: "female", female_skin_context: ["none_not_sure", "irregular_periods"], primary_concerns: ["blemishes"] }).redFlag
    ).toBe(true);
    expect(safety({ breakout_pattern: " DEEP_PAINFUL " }).redFlag).toBe(true);
  });

  it("no answers: no red flag (nothing is guessed)", () => {
    expect(safety({})).toEqual({ rulesetVersion: "rules-0-provisional", reviewStatus: "provisional", extraCaution: false, redFlag: false });
  });
});

describe("extra caution (privacy decision 8)", () => {
  it.each<[Record<string, unknown>, boolean]>([
    [{ gender: "female", female_skin_context: ["pregnant_or_breastfeeding"] }, true],
    [{ current_products: ["cleanser_moisturizer", "prescription"] }, true],
    [{ current_products: ["actives"] }, false],
    [{ gender: "female", female_skin_context: ["menopause"] }, false],
    [{ current_products: ["none", "prescription"] }, true], // contradicted, still counts
  ])("%j -> %s", (answers, expected) => {
    expect(safety(answers).extraCaution).toBe(expected);
  });

  it("is independent of the red flag", () => {
    expect(safety({ breakout_pattern: ["deep_painful"], current_products: ["prescription"] })).toMatchObject({
      redFlag: true,
      extraCaution: true,
    });
  });
});
