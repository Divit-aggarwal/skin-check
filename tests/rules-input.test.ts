import { describe, expect, it } from "vitest";
import { inputSha256, readInput, type RulesInput } from "@/lib/rules/input";

const read = (answers: Record<string, unknown>, confirmedThisScan: string[] = []) =>
  readInput({ answers, confirmedThisScan });

describe("readInput", () => {
  it("accepts a string or a list, and sorts and de-duplicates", () => {
    expect(read({ breakout_pattern: "deep_painful" }).breakout_pattern).toMatchObject({ values: ["deep_painful"], valid: true });
    expect(read({ breakout_pattern: ["small_bumps", "deep_painful", "deep_painful"] }).breakout_pattern).toMatchObject({
      values: ["deep_painful", "small_bumps"],
      valid: true,
    });
  });

  it("a case or whitespace variant matches for caution but is never valid", () => {
    expect(read({ breakout_pattern: [" Small_Bumps", "deep_painful"] }).breakout_pattern).toMatchObject({
      values: ["deep_painful", "small_bumps"],
      present: true,
      valid: false,
    });
    expect(read({ primary_concerns: ["PIGMENT"] }).primary_concerns).toMatchObject({ values: ["pigment"], valid: false });
  });

  it("more than maxSelections is invalid", () => {
    expect(read({ primary_concerns: ["redness", "texture", "pores"] }).primary_concerns.valid).toBe(true);
    expect(read({ primary_concerns: ["redness", "texture", "pores", "pigment"] }).primary_concerns.valid).toBe(false);
  });

  it("an empty list or blank string is not answered", () => {
    expect(read({ primary_concerns: [] }).primary_concerns).toMatchObject({ present: false, valid: false });
    expect(read({ pih_scar_tendency: "  " }).pih_scar_tendency).toMatchObject({ present: false, valid: false });
  });

  it("non-string elements make the field invalid but keep the string values", () => {
    expect(read({ breakout_pattern: ["deep_painful", 5, null] }).breakout_pattern).toMatchObject({
      values: ["deep_painful"],
      present: true,
      valid: false,
    });
  });

  it("an unknown option, two single-select values, or an exclusive conflict is invalid", () => {
    expect(read({ breakout_pattern: ["deep_painful", "made_up"] }).breakout_pattern.valid).toBe(false);
    expect(read({ pih_scar_tendency: ["dark_mark_fades", "scar_or_indent"] }).pih_scar_tendency.valid).toBe(false);
    expect(read({ current_products: ["none", "prescription"] }).current_products).toMatchObject({
      values: ["none", "prescription"],
      valid: false,
    });
  });

  it("reads own keys only", () => {
    const answers = Object.assign(Object.create({ breakout_pattern: ["deep_painful"] }), { gender: "male" });
    expect(read(answers).breakout_pattern.present).toBe(false);
  });

  it("throws when none of the rule fields is present (a wrapper or snapshot, not answers)", () => {
    expect(() => read({ answers: { breakout_pattern: "deep_painful" } })).toThrow(/none of the rule fields/);
    expect(() => read({})).toThrow(TypeError);
  });

  it("freshness is opt-in: unlisted fields are reused", () => {
    const r = read({ current_products: ["none"], breakout_pattern: ["small_bumps"] }, ["current_products"]);
    expect(r.current_products.fresh).toBe(true);
    expect(r.breakout_pattern.fresh).toBe(false);
  });

  it("female_skin_context is asked only for female, unknown without a gender", () => {
    expect(read({ gender: "female" }).female_skin_context.asked).toBe(true);
    expect(read({ gender: "male" }).female_skin_context.asked).toBe(false);
    expect(read({ primary_concerns: ["pigment"] }).female_skin_context.asked).toBe("unknown");
    expect(read({ gender: ["female", "male"] }).female_skin_context.asked).toBe("unknown");
  });

  it.each([null, undefined, 5, "x", []])("throws on answers=%j instead of answering", (answers) => {
    expect(() => readInput({ answers, confirmedThisScan: [] } as unknown as RulesInput)).toThrow(TypeError);
  });

  it("throws when confirmedThisScan is not a list", () => {
    expect(() => readInput({ answers: {}, confirmedThisScan: "current_products" } as unknown as RulesInput)).toThrow(TypeError);
  });
});

const CAT = { version: "c", products: [] as unknown[] };

describe("inputSha256", () => {
  const base = { gender: "female", primary_concerns: ["pigment", "blemishes"], current_products: ["none"] };
  const hash = (answers: Record<string, unknown>, confirmed = ["current_products"]) =>
    inputSha256(read(answers, confirmed), "r", CAT);

  it("ignores fields the rules do not read, and array and key order", () => {
    expect(hash({ ...base, name: "A", phone_verify: "verified" })).toBe(hash(base));
    expect(hash({ current_products: ["none"], primary_concerns: ["blemishes", "pigment"], gender: "female" })).toBe(hash(base));
  });

  it("changes with a value, freshness or a version", () => {
    expect(hash({ ...base, primary_concerns: ["pigment"] })).not.toBe(hash(base));
    expect(hash(base, [])).not.toBe(hash(base));
    expect(inputSha256(read(base), "r2", CAT)).not.toBe(inputSha256(read(base), "r", CAT));
    expect(inputSha256(read(base), "r", { ...CAT, version: "c2" })).not.toBe(inputSha256(read(base), "r", CAT));
  });

  it("changes with the catalogue's content even under the same version string", () => {
    expect(inputSha256(read(base), "r", { ...CAT, products: [{ id: "x" }] })).not.toBe(inputSha256(read(base), "r", CAT));
  });

  it("is pinned", () => {
    expect(hash(base)).toBe("7614c9d214f081a003fb266369aac2da9ee7cec8e2dcee1d5180cd73a87c6936");
  });
});
