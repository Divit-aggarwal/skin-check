import { describe, expect, it } from "vitest";
import { CATALOGUE, PRODUCT_NAME_EXCEPTIONS } from "@/lib/catalog/catalogue";
import { buildContextPackage, productNamePasses, screenExternalText } from "@/lib/context/builder";
import { fullInput } from "./context-fixtures";

// Wave-2 wiring 8. The context builder drops any product whose name or claim
// text fails screenExternalText, or whose id is not a slug (context report §6).
// This test makes every such drop loud: each catalogue text must pass, or be
// listed below with its tracker row. The screen is not loosened for a name.
const SLUG = /^[a-z0-9-]{1,40}$/;

/** Texts that fail today, each an owner action in the tracker. Must match the real failures exactly. */
const KNOWN_FAILURES: Record<string, string> = {
  // TD-29 (1): the real catalogue's two names with digits. Dropped from Echo's product list while recommendations are off anyway (E05).
  "5% Niacinamide Serum": "digits: a percentage fails the no-number screen (tracker E08)",
  "Protecting Sunscreen SPF 50 PA++++": "digits: any SPF number fails the no-number screen (tracker E08)",
};

// TD-17 (2), E08: an owner-approved name passes by exact match only. Its claim text is still screened.
const passes = (t: string) => (names.has(t) ? productNamePasses(t) : screenExternalText(t));

const names = new Set([...CATALOGUE.products.map((p) => p.name), ...PRODUCT_NAME_EXCEPTIONS.map((e) => e.name)]);
const texts = [
  ...CATALOGUE.products.flatMap((p) => [p.name, ...p.claims.map((c) => c.text)]),
  // An approved own-brand name would be dropped from chat the day it enters the catalogue.
  ...PRODUCT_NAME_EXCEPTIONS.map((e) => e.name),
];

describe("every catalogue product name and claim passes the context screen (nothing dropped silently)", () => {
  it("every product id is a slug the builder accepts", () => {
    for (const p of CATALOGUE.products) expect(p.id, p.id).toMatch(SLUG);
  });

  it.each(texts.filter((t) => !(t in KNOWN_FAILURES)))("passes: %s", (text) => {
    expect(passes(text)).toBe(true);
  });

  it("the known-failure list is exactly the texts that fail (a fix or a new failure must update it)", () => {
    expect(texts.filter((t) => !passes(t)).sort()).toEqual(Object.keys(KNOWN_FAILURES).sort());
  });
});

describe("owner-approved names pass by exact match only (TD-17 (2), E08)", () => {
  it("'Clear Seal' passes the name check though the screen alone rejects it", () => {
    expect(screenExternalText("Clear Seal")).toBe(false);
    expect(productNamePasses("Clear Seal")).toBe(true);
  });

  it.each([
    "clear seal", "CLEAR SEAL", "Clear Seal ", " Clear Seal", "Clear  Seal", "Clear\u200bSeal", "Clear Seal\u200b", "Cl\u0435ar Seal",
    "Clear Seal improves", "Clear Seal Serum", "Clear Seal clears acne", "Clear Seal 2", "Clear",
  ])("a near miss is screened as usual and fails: %j", (name) => {
    expect(productNamePasses(name)).toBe(false);
  });

  it("other names are unchanged: the synthetic SPF name still fails, a clean name passes", () => {
    expect(productNamePasses("Sample Sunscreen SPF 50 (SYNTHETIC - replace)")).toBe(false);
    expect(productNamePasses("Gentle Cleanser")).toBe(true);
  });

  it("in the builder: the approved name is kept, its claim text is still screened", () => {
    const rec = (claimText: string) =>
      buildContextPackage(fullInput({
        message: "which product should I use?",
        recommendation: { result: fullInput().recommendation!.result, products: fullInput().recommendation!.products.map((p) => ({ ...p, name: "Clear Seal", claimText })) },
      })).recommendation;
    expect(rec("Feels light on the skin")?.items.map((i) => i.productName)).toContain("Clear Seal");
    expect(rec("Clears acne in 7 days")).toBeUndefined();
  });
});
