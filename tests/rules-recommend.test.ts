import { describe, expect, it } from "vitest";
import { CATALOGUE } from "@/lib/catalog/catalogue";
import { CatalogueSchema, CATALOG_SCHEMA_VERSION } from "@/lib/catalog/schema";
import { bannedWordsIn } from "@/lib/catalog/wording";
import type { RecommendationResult } from "@/lib/contracts/recommendation-result";
import { recommend } from "@/lib/rules/recommend";
import { evaluateSafety } from "@/lib/rules/safety";
import { COPY } from "@/lib/rules/settings";

const product = (id: string, category: string, extra: Record<string, unknown> = {}) => ({
  id,
  versionId: `${id}-v1`,
  dataSource: "synthetic",
  name: `Test ${id}`,
  category,
  slot: category === "sunscreen" ? "AM" : "AM_PM",
  shopifyHandle: null,
  shopifyHandleVerified: false,
  ingredientClasses: [],
  inci: [],
  active: null,
  warnings: [],
  contraindications: [],
  price: { mrpInr: 100, packSize: "50 ml" },
  availability: "available",
  regions: ["IN"],
  usageText: "Use as directed on the pack.",
  claims: [],
  ...extra,
});

// Order is deliberately not the display order.
const FIXTURE = CatalogueSchema.parse({
  schemaVersion: CATALOG_SCHEMA_VERSION,
  version: "catalog-test",
  products: [
    product("sunscreen", "sunscreen"),
    product("niacinamide", "serum", { ingredientClasses: ["niacinamide"], slot: "PM" }),
    product("moisturiser", "moisturiser"),
    product("cleanser", "cleanser"),
    product("cleanser-2", "cleanser"),
    product("niacinamide-2", "serum", { ingredientClasses: ["niacinamide"] }),
    product("old-moisturiser", "moisturiser", { availability: "discontinued" }),
    product("retinoid", "serum", { ingredientClasses: ["retinoid"], contraindications: ["pregnant_or_breastfeeding"] }),
    product("toner", "other"),
  ],
});

const ALL = ["gender", "primary_concerns", "breakout_pattern", "pih_scar_tendency", "current_products", "female_skin_context"];
const CLEAN = {
  gender: "male",
  primary_concerns: ["pigment"],
  breakout_pattern: ["small_bumps"],
  pih_scar_tendency: "dark_mark_fades",
  current_products: ["none"],
};
const FEMALE = { ...CLEAN, gender: "female", female_skin_context: ["none_not_sure"] };

const run = (answers: Record<string, unknown>, confirmedThisScan: string[] = ALL) => recommend({ answers, confirmedThisScan }, FIXTURE);
const ids = (r: RecommendationResult) => r.items.map((i) => i.productId);
const reasons = (r: RecommendationResult) => Object.fromEntries(r.excluded.map((e) => [e.productId, e.ruleId]));
const firedIds = (r: RecommendationResult) => r.fired.map((f) => f.ruleId);
const BASE = ["cleanser", "moisturiser", "sunscreen"];
const ALWAYS_EXCLUDED = {
  "cleanser-2": "base.one_per_step",
  "old-moisturiser": "catalogue.unavailable",
  retinoid: "catalogue.not_in_ruleset",
  toner: "catalogue.not_in_ruleset",
};

interface Row {
  name: string;
  answers: Record<string, unknown>;
  confirmed?: string[];
  items: string[];
  fired: string[];
  limits: string[];
  notices: string[];
  unknowns: [string, string][];
  excluded: Record<string, string>;
}

const ROWS: Row[] = [
  {
    name: "clean answers with a dark-marks concern: base routine plus niacinamide",
    answers: CLEAN,
    items: ["cleanser", "niacinamide", "moisturiser", "sunscreen"],
    fired: ["active.niacinamide", "base.routine"],
    limits: [],
    notices: ["notice.one_at_a_time"],
    unknowns: [],
    excluded: { ...ALWAYS_EXCLUDED, "niacinamide-2": "active.one_only" },
  },
  {
    name: "no stated concern that calls for the active",
    answers: { ...CLEAN, primary_concerns: ["redness"], pih_scar_tendency: "fades_no_trace" },
    items: BASE,
    fired: ["base.routine"],
    limits: [],
    notices: [],
    unknowns: [],
    excluded: { ...ALWAYS_EXCLUDED, niacinamide: "active.not_triggered", "niacinamide-2": "active.not_triggered" },
  },
  {
    name: "red flag overrides everything else (prescription, pregnancy, active trigger)",
    answers: {
      ...FEMALE,
      breakout_pattern: ["deep_painful"],
      current_products: ["actives", "prescription"],
      female_skin_context: ["pregnant_or_breastfeeding"],
    },
    items: BASE,
    fired: [
      "red_flag.deep_painful_breakouts",
      "extra_caution",
      "constraint.prescriber_routine",
      "notice.pregnancy_actives",
      "active.niacinamide",
      "base.routine",
    ],
    limits: ["red_flag.base_routine_only"],
    notices: ["red_flag.referral"],
    unknowns: [],
    excluded: {
      ...ALWAYS_EXCLUDED,
      niacinamide: "red_flag.deep_painful_breakouts",
      "niacinamide-2": "red_flag.deep_painful_breakouts",
      retinoid: "catalogue.contraindicated",
    },
  },
  {
    name: "a prescription removes the active and adds the prescriber line",
    answers: { ...CLEAN, current_products: ["cleanser_moisturizer", "prescription"] },
    items: BASE,
    fired: ["extra_caution", "constraint.prescriber_routine", "active.niacinamide", "base.routine"],
    limits: ["constraint.prescriber_routine", "extra_caution"],
    notices: [],
    unknowns: [],
    excluded: { ...ALWAYS_EXCLUDED, niacinamide: "constraint.prescriber_routine", "niacinamide-2": "constraint.prescriber_routine" },
  },
  {
    name: "pregnant with actives: extra caution, the notice, contraindicated product out",
    answers: { ...FEMALE, current_products: ["actives"], female_skin_context: ["pregnant_or_breastfeeding"] },
    items: BASE,
    fired: ["extra_caution", "notice.pregnancy_actives", "active.niacinamide", "base.routine"],
    limits: ["extra_caution"],
    notices: ["notice.pregnancy_actives"],
    unknowns: [],
    excluded: { ...ALWAYS_EXCLUDED, niacinamide: "extra_caution", "niacinamide-2": "extra_caution", retinoid: "catalogue.contraindicated" },
  },
  {
    name: "current products reused from an earlier check: active withheld",
    answers: CLEAN,
    confirmed: ALL.filter((f) => f !== "current_products"),
    items: BASE,
    fired: ["active.niacinamide", "base.routine"],
    limits: ["active.needs_confirmation", "active.needs_answers"],
    notices: [],
    unknowns: [["current_products", COPY.unknownStale]],
    excluded: { ...ALWAYS_EXCLUDED, niacinamide: "active.needs_confirmation", "niacinamide-2": "active.needs_confirmation" },
  },
  {
    name: "female context reused from an earlier check: active withheld",
    answers: FEMALE,
    confirmed: ALL.filter((f) => f !== "female_skin_context"),
    items: BASE,
    fired: ["active.niacinamide", "base.routine"],
    limits: ["active.needs_confirmation", "active.needs_answers"],
    notices: [],
    unknowns: [["female_skin_context", COPY.unknownStale]],
    excluded: { ...ALWAYS_EXCLUDED, niacinamide: "active.needs_confirmation", "niacinamide-2": "active.needs_confirmation" },
  },
  {
    name: "a reused breakout answer is fine (only the re-confirm fields must be fresh)",
    answers: CLEAN,
    confirmed: ["current_products"],
    items: ["cleanser", "niacinamide", "moisturiser", "sunscreen"],
    fired: ["active.niacinamide", "base.routine"],
    limits: [],
    notices: ["notice.one_at_a_time"],
    unknowns: [],
    excluded: { ...ALWAYS_EXCLUDED, "niacinamide-2": "active.one_only" },
  },
  {
    name: "a missing breakout answer is unknown, never guessed",
    answers: { ...CLEAN, breakout_pattern: [] },
    items: BASE,
    fired: ["active.niacinamide", "base.routine"],
    limits: ["active.needs_answers"],
    notices: [],
    unknowns: [["breakout_pattern", COPY.unknownMissing]],
    excluded: { ...ALWAYS_EXCLUDED, niacinamide: "active.needs_answers", "niacinamide-2": "active.needs_answers" },
  },
  {
    name: "no gender: gender and the female context are unknown",
    answers: { ...CLEAN, gender: undefined },
    items: BASE,
    fired: ["active.niacinamide", "base.routine"],
    limits: ["active.needs_answers"],
    notices: [],
    unknowns: [
      ["gender", COPY.unknownMissing],
      ["female_skin_context", COPY.unknownMissing],
    ],
    excluded: { ...ALWAYS_EXCLUDED, niacinamide: "active.needs_answers", "niacinamide-2": "active.needs_answers" },
  },
  {
    name: "a contradictory current products answer is unreadable, but its prescription still counts",
    answers: { ...CLEAN, current_products: ["none", "prescription"] },
    items: BASE,
    fired: ["extra_caution", "constraint.prescriber_routine", "active.niacinamide", "base.routine"],
    limits: ["constraint.prescriber_routine", "extra_caution", "active.needs_answers"],
    notices: [],
    unknowns: [["current_products", COPY.unknownInvalid]],
    excluded: { ...ALWAYS_EXCLUDED, niacinamide: "constraint.prescriber_routine", "niacinamide-2": "constraint.prescriber_routine" },
  },
];

describe("recommend: answer sets to results", () => {
  it.each(ROWS.map((r) => [r.name, r] as const))("%s", (_name, row) => {
    const r = run(row.answers, row.confirmed);
    expect(ids(r)).toEqual(row.items);
    expect(firedIds(r)).toEqual(row.fired);
    expect(r.limits.map((l) => l.ruleId)).toEqual(row.limits);
    expect(r.notices.map((n) => n.ruleId)).toEqual(row.notices);
    expect(r.unknowns.map((u) => [u.field, u.text])).toEqual(row.unknowns);
    expect(reasons(r)).toEqual(row.excluded);
    expect(r.excluded.every((e) => e.reason.length > 0)).toBe(true);
  });

  it.each(ROWS.map((r) => [r.name, r] as const))("invariants: %s", (_name, row) => {
    const confirmedThisScan = row.confirmed ?? ALL;
    const r = run(row.answers, row.confirmed);
    // The safety state it was built under is exactly the interlock's answer.
    expect(r.safety).toEqual(evaluateSafety({ answers: row.answers, confirmedThisScan }));
    // A red flag means base routine plus referral only.
    if (r.safety.redFlag) {
      expect(r.items.every((i) => i.ruleId === "base.routine")).toBe(true);
      expect(r.notices).toEqual([{ ruleId: "red_flag.referral", text: COPY.referral }]);
    }
    // Every product is selected or excluded, exactly once.
    expect([...ids(r), ...r.excluded.map((e) => e.productId)].sort()).toEqual(FIXTURE.products.map((p) => p.id).sort());
    expect(r.items.map((i) => i.position)).toEqual(r.items.map((_, i) => i + 1));
    expect(r).toMatchObject({ rulesetVersion: "rules-0-provisional", catalogVersion: "catalog-test", reviewStatus: "provisional" });
    // D-12 word check on every user-facing string.
    for (const text of [...r.limits, ...r.notices, ...r.unknowns].map((x) => x.text).concat(r.excluded.map((e) => e.reason))) {
      expect(bannedWordsIn(text)).toEqual([]);
    }
  });
});

describe("recommend: details", () => {
  it("records each trigger with its freshness", () => {
    const r = run({ ...CLEAN, current_products: ["prescription"] }, ["primary_concerns"]);
    expect(r.fired.find((f) => f.ruleId === "constraint.prescriber_routine")?.triggeredBy).toEqual([
      { source: "self_reported", field: "current_products", value: "prescription", fresh: false },
    ]);
    expect(r.fired.find((f) => f.ruleId === "active.niacinamide")?.triggeredBy).toEqual([
      { source: "self_reported", field: "primary_concerns", value: "pigment", fresh: true },
      { source: "self_reported", field: "pih_scar_tendency", value: "dark_mark_fades", fresh: false },
    ]);
  });

  it("slots come from the product, positions follow the routine order", () => {
    expect(run(CLEAN).items).toEqual([
      { productId: "cleanser", productVersionId: "cleanser-v1", slot: "AM_PM", position: 1, ruleId: "base.routine" },
      { productId: "niacinamide", productVersionId: "niacinamide-v1", slot: "PM", position: 2, ruleId: "active.niacinamide" },
      { productId: "moisturiser", productVersionId: "moisturiser-v1", slot: "AM_PM", position: 3, ruleId: "base.routine" },
      { productId: "sunscreen", productVersionId: "sunscreen-v1", slot: "AM", position: 4, ruleId: "base.routine" },
    ]);
  });

  it("the real synthetic catalogue has no serum: the active fires with no item and a gap line", () => {
    const r = recommend({ answers: CLEAN, confirmedThisScan: ALL }, CATALOGUE);
    expect(ids(r)).toEqual(["sample-cleanser", "sample-moisturiser", "sample-sunscreen"]);
    expect(firedIds(r)).toContain("active.niacinamide");
    expect(r.limits).toEqual([{ ruleId: "catalogue.gap", text: COPY.gap }]);
    expect(r.notices).toEqual([]);
    expect(r.catalogVersion).toBe(CATALOGUE.version);
  });

  it("a catalogue with no sunscreen says so", () => {
    const noSun = { ...FIXTURE, products: FIXTURE.products.filter((p) => p.category !== "sunscreen") };
    const r = recommend({ answers: { ...CLEAN, breakout_pattern: ["deep_painful"] }, confirmedThisScan: ALL }, noSun);
    expect(r.limits.map((l) => l.ruleId)).toEqual(["red_flag.base_routine_only", "catalogue.gap"]);
  });
});

describe("recommend: determinism", () => {
  const answers = { ...FEMALE, primary_concerns: ["blemishes", "pigment"], current_products: ["actives", "cleanser_moisturizer"] };

  it("the same input gives the same result, every time", () => {
    const first = run(answers);
    for (let i = 0; i < 5; i++) expect(run(answers)).toEqual(first);
  });

  it("key order, array order and fields the rules do not read change nothing", () => {
    const shuffled = {
      name: "Someone",
      current_products: ["cleanser_moisturizer", "actives"],
      female_skin_context: ["none_not_sure"],
      primary_concerns: ["pigment", "blemishes"],
      pih_scar_tendency: "dark_mark_fades",
      breakout_pattern: ["small_bumps"],
      gender: "female",
      diet: ["dairy"],
    };
    expect(run(shuffled, [...ALL].reverse())).toEqual(run(answers));
  });
});
