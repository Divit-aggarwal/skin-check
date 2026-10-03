import { afterEach, describe, expect, it, vi } from "vitest";
import { EXTRA_CAUTION_TRIGGERS as GEMINI_EXTRA_CAUTION } from "@/lib/gemini";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { SECTIONS } from "@/lib/skin-check-steps";
import {
  ACTIVE_TRIGGERS,
  CONTRAINDICATION_MATCH,
  COPY,
  EXTRA_CAUTION_TRIGGERS,
  PREGNANCY_ACTIVES_RULE,
  PRESCRIBER_RULE,
  RED_FLAG_RULES,
  REVIEW_STATUS,
  RULESET_VERSION,
  rulesEnabledFor,
  type Condition,
} from "@/lib/rules/settings";

const STEPS = new Map(SECTIONS.flatMap((s) => s.steps).map((s) => [s.id, s]));

describe("production switch (tracker E05: off in production until clinical sign-off)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it.each([
    ["production", false],
    ["development", true],
    ["test", true],
    ["", false],
    ["staging", false],
  ])("NODE_ENV=%s -> enabled %s", async (nodeEnv, expected) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.resetModules();
    const settings = await import("@/lib/rules/settings");
    expect(settings.RULES_ENABLED).toBe(expected);
  });

  it("is off when NODE_ENV is unset (fails closed)", async () => {
    vi.stubEnv("NODE_ENV", undefined);
    vi.resetModules();
    const settings = await import("@/lib/rules/settings");
    expect(settings.RULES_ENABLED).toBe(false);
  });

  it("both public functions refuse in a production build", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.resetModules();
    const { evaluateSafety } = await import("@/lib/rules/safety");
    const { recommend } = await import("@/lib/rules/recommend");
    const { CATALOGUE } = await import("@/lib/catalog/catalogue");
    const input = { answers: {}, confirmedThisScan: [] };
    expect(() => evaluateSafety(input)).toThrow(/clinical sign-off/);
    expect(() => recommend(input, CATALOGUE)).toThrow(/clinical sign-off/);
  });

  it("stays provisional, and only a reviewed status turns it on in production", () => {
    expect(REVIEW_STATUS).toBe("provisional");
    expect(rulesEnabledFor("production", "provisional")).toBe(false);
    expect(rulesEnabledFor("production", "clinically_reviewed")).toBe(true);
    expect(rulesEnabledFor(undefined, "provisional")).toBe(false);
  });
});

describe("clinical lists", () => {
  const allConditions: Condition[] = [
    ...RED_FLAG_RULES.flatMap((r) => r.when),
    ...EXTRA_CAUTION_TRIGGERS,
    ...PRESCRIBER_RULE.when,
    ...PREGNANCY_ACTIVES_RULE.when,
    ...ACTIVE_TRIGGERS,
    ...Object.values(CONTRAINDICATION_MATCH),
  ];

  it.each(allConditions.flatMap((c) => c.anyOf.map((v) => [c.field, v])))(
    "%s=%s is a real quiz option (a renamed option must not silently disable a rule)",
    (field, value) => {
      const step = STEPS.get(field);
      expect(step && "options" in step && step.options.map((o) => o.value)).toContain(value);
    }
  );

  it("extra-caution triggers equal lib/gemini.ts (privacy decision 8; one source after integration)", () => {
    const ours = Object.fromEntries(EXTRA_CAUTION_TRIGGERS.map((c) => [c.field, [...c.anyOf]]));
    expect(ours).toEqual(GEMINI_EXTRA_CAUTION);
  });

  // The reviewer signs this exact list at this version. Changing a list means
  // bumping RULESET_VERSION and updating this pin in the same commit.
  it("is pinned to RULESET_VERSION", () => {
    expect({
      RULESET_VERSION,
      red: RED_FLAG_RULES.map((r) => [r.id, r.when.map((c) => `${c.field}:${c.anyOf.join("|")}`)]),
      caution: EXTRA_CAUTION_TRIGGERS.map((c) => `${c.field}:${c.anyOf.join("|")}`),
      prescriber: PRESCRIBER_RULE.when.map((c) => `${c.field}:${c.anyOf.join("|")}`),
      pregnancy: PREGNANCY_ACTIVES_RULE.when.map((c) => `${c.field}:${c.anyOf.join("|")}`),
      active: ACTIVE_TRIGGERS.map((c) => `${c.field}:${c.anyOf.join("|")}`),
    }).toEqual({
      RULESET_VERSION: "rules-0-provisional",
      red: [
        ["red_flag.deep_painful_breakouts", ["breakout_pattern:deep_painful"]],
        ["red_flag.scarring_breakouts", ["breakout_pattern:leaves_scars"]],
        ["red_flag.scar_or_indent", ["pih_scar_tendency:scar_or_indent"]],
        ["red_flag.lingering_dark_mark", ["pih_scar_tendency:dark_mark_lingers"]],
        ["red_flag.irregular_periods_with_breakouts", ["female_skin_context:irregular_periods", "primary_concerns:blemishes"]],
      ],
      caution: ["female_skin_context:pregnant_or_breastfeeding", "current_products:prescription"],
      prescriber: ["current_products:prescription"],
      pregnancy: ["female_skin_context:pregnant_or_breastfeeding", "current_products:actives"],
      active: ["primary_concerns:pigment|blemishes", "pih_scar_tendency:dark_mark_fades|dark_mark_lingers"],
    });
  });
});

describe("copy (D-12 word check)", () => {
  const strings = Object.entries({ ...COPY, ...COPY.excluded }).filter(([, v]) => typeof v === "string") as [string, string][];
  it.each(strings)("%s passes", (_k, text) => {
    expect(bannedWordsIn(text)).toEqual([]);
  });
});
