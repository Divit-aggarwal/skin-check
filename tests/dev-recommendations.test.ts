import { afterEach, describe, expect, it, vi } from "vitest";
import { CATALOG_VERSION, CATALOGUE, PRODUCT_NAME_EXCEPTIONS } from "@/lib/catalog/catalogue";
import { CatalogueSchema } from "@/lib/catalog/schema";
import { bannedWordsIn, nameIsExcepted } from "@/lib/catalog/wording";
import { recommend } from "@/lib/rules/recommend";
import { MISMATCHES } from "@/app/dev/recommendations/mismatches";
import { STORE_CATALOGUE, STORE_PRODUCTS, STORE_SOURCE } from "@/app/dev/recommendations/store-catalogue";

// G03 part 4: the recommendation preview (/dev/recommendations) is local only,
// and its list of mismatches between lib/rules and the store's products holds.

describe("/dev/recommendations is local development only", () => {
  afterEach(() => (vi.unstubAllEnvs(), vi.unstubAllGlobals()));

  const render = async () => {
    vi.resetModules();
    const { default: Page } = await import("@/app/dev/recommendations/page");
    return Page({ searchParams: {} });
  };

  it.each(["production", "test", ""])("NODE_ENV=%j: not found, before anything is read", async (env) => {
    vi.stubEnv("NODE_ENV", env);
    await expect(render()).rejects.toMatchObject({ digest: "NEXT_NOT_FOUND" });
  });

  it("NODE_ENV=development: the page renders", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubGlobal("React", await import("react")); // vitest compiles JSX with the classic runtime
    await expect(render()).resolves.toBeTruthy();
  });
});

const ANSWERS = {
  gender: "female",
  primary_concerns: ["blemishes"],
  breakout_pattern: ["small_bumps"],
  pih_scar_tendency: "dark_mark_fades",
  current_products: ["cleanser_moisturizer"],
  female_skin_context: ["none_not_sure"],
};
const CONFIRMED = ["current_products", "female_skin_context"];
const run = (answers: Record<string, unknown>, catalogue = STORE_CATALOGUE) => recommend({ answers, confirmedThisScan: CONFIRMED }, catalogue);
const chosen = (answers: Record<string, unknown>, catalogue = STORE_CATALOGUE) => run(answers, catalogue).items.map((i) => i.productId);
const outBecause = (answers: Record<string, unknown>, id: string) => run(answers).excluded.find((e) => e.productId === id)?.ruleId;

describe("the store catalogue", () => {
  it("is used only by the preview and the tests: nothing else imports app/dev", () => {
    const { readdirSync, readFileSync } = require("node:fs") as typeof import("node:fs");
    const { join } = require("node:path") as typeof import("node:path");
    const files = ["app", "components", "lib", "hooks"].flatMap((d) =>
      readdirSync(d, { recursive: true, encoding: "utf8" }).map((f) => join(d, f)).filter((f) => /\.(ts|tsx)$/.test(f) && !f.startsWith("app/dev/"))
    );
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/app\/dev|store-catalogue|\/dev\/recommendations/);
  });

  it("is the six store products, valid against the catalogue schema, marked as unverified", () => {
    expect(Object.keys(STORE_PRODUCTS)).toHaveLength(6);
    expect(() => CatalogueSchema.parse(STORE_CATALOGUE)).not.toThrow();
    expect(STORE_SOURCE).toBe("From the public store, not verified by the owner");
    expect(STORE_CATALOGUE.products.every((p) => !p.shopifyHandleVerified)).toBe(true);
  });

  // TD-29 (1): the app's catalogue is now the same six store products (owner data).
  it("the app catalogue is the same six store products, by store handle", () => {
    expect(CATALOGUE.version).toBe(CATALOG_VERSION);
    const handles = (ps: readonly { shopifyHandle: string | null }[]) => ps.map((p) => p.shopifyHandle).sort();
    expect(handles(CATALOGUE.products)).toEqual(handles(STORE_CATALOGUE.products));
  });
});

describe("mismatches between lib/rules and the store's products (questions for the clinical reviewer)", () => {
  it("every entry has a question", () => {
    expect(MISMATCHES.length).toBeGreaterThanOrEqual(9);
    for (const m of MISMATCHES) expect(m.question.endsWith("?"), m.id).toBe(true);
  });

  it("cleanser-has-acids: the cleanser is outside the ruleset, so no routine has a cleanser, even under a red flag", () => {
    expect(outBecause(ANSWERS, "store-refreshing-cleanser")).toBe("catalogue.not_in_ruleset");
    const red = run({ ...ANSWERS, breakout_pattern: ["deep_painful"] });
    expect(red.safety.redFlag).toBe(true);
    expect(red.items.map((i) => i.productId)).not.toContain("store-refreshing-cleanser");
  });

  it("sunscreen-has-niacinamide: the sunscreen is outside the ruleset", () => {
    expect(outBecause(ANSWERS, "store-protecting-sunscreen")).toBe("catalogue.not_in_ruleset");
  });

  it("base-is-moisturiser-only: the base routine is the moisturiser alone, with the gap limit", () => {
    const red = run({ ...ANSWERS, breakout_pattern: ["deep_painful"] });
    expect(red.items.map((i) => i.productId)).toEqual(["store-calming-moisturiser"]);
    expect(red.limits.map((l) => l.ruleId)).toContain("catalogue.gap");
  });

  it("one-treat-product: Clear Seal and Active Boba are never chosen; the serum is the only active", () => {
    expect(chosen(ANSWERS)).toEqual(["store-niacinamide-serum", "store-calming-moisturiser"]);
    expect(outBecause(ANSWERS, "store-clear-seal")).toBe("catalogue.not_in_ruleset");
  });

  it("active-boba-two-actives: unavailable now; in stock and written as a serum it is still outside the ruleset", () => {
    expect(outBecause(ANSWERS, "store-active-boba")).toBe("catalogue.unavailable");
    const asSerum = {
      ...STORE_CATALOGUE,
      products: STORE_CATALOGUE.products.map((p) => (p.id === "store-active-boba" ? { ...p, category: "serum" as const, availability: "available" as const } : p)),
    };
    expect(run(ANSWERS, asSerum).excluded.find((e) => e.productId === "store-active-boba")?.ruleId).toBe("catalogue.not_in_ruleset");
  });

  it("serum-concentration-and-extras: the serum is chosen on a trigger and left out without one, or under a gate", () => {
    expect(chosen(ANSWERS)).toContain("store-niacinamide-serum");
    // A lingering dark mark is a trigger and a red flag: the red flag wins.
    expect(outBecause({ ...ANSWERS, pih_scar_tendency: "dark_mark_lingers" }, "store-niacinamide-serum")).toBe("red_flag.lingering_dark_mark");
    expect(outBecause({ ...ANSWERS, primary_concerns: ["redness"], pih_scar_tendency: "fades_no_trace" }, "store-niacinamide-serum")).toBe("active.not_triggered");
  });

  it("salicylic-pregnancy: nothing is left out for a pregnant user; the only notice is about retinoids", () => {
    const pregnant = run({ ...ANSWERS, female_skin_context: ["pregnant_or_breastfeeding"], current_products: ["actives"] });
    expect(pregnant.excluded.filter((e) => e.ruleId === "catalogue.contraindicated")).toEqual([]);
    expect(pregnant.items.map((i) => i.productId)).not.toContain("store-niacinamide-serum");
    expect(pregnant.excluded.find((e) => e.productId === "store-niacinamide-serum")?.ruleId).toBe("extra_caution");
    expect(STORE_CATALOGUE.products.every((p) => p.contraindications.length === 0)).toBe(true);
    expect(pregnant.notices.map((n) => n.text).join(" ")).toMatch(/retinoid/);
    expect(pregnant.notices.map((n) => n.text).join(" ")).not.toMatch(/salicylic/i);
  });

  it("TD-26: the two owner questions are decided: 'Calming Moisturiser' and 'Clear Seal' are excepted names", () => {
    expect(MISMATCHES.map((m) => m.id)).not.toContain("names-with-banned-words");
    expect(MISMATCHES.map((m) => m.id)).not.toContain("treat-word");
    expect(bannedWordsIn("Calming Moisturiser")).toContain("calm*");
    expect(nameIsExcepted({ name: "Calming Moisturiser", dataSource: "owner" }, PRODUCT_NAME_EXCEPTIONS)).toBe(true);
    expect(nameIsExcepted({ name: "Clear Seal", dataSource: "owner" }, PRODUCT_NAME_EXCEPTIONS)).toBe(true);
    expect(nameIsExcepted({ name: "Calming Moisturiser", dataSource: "synthetic" }, PRODUCT_NAME_EXCEPTIONS)).toBe(false);
  });
});
