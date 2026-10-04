import { describe, expect, it } from "vitest";
import { CATALOGUE, PRODUCT_NAME_EXCEPTIONS } from "@/lib/catalog/catalogue";
import { screenExternalText } from "@/lib/context/builder";

// Wave-2 wiring 8. The context builder drops any product whose name or claim
// text fails screenExternalText, or whose id is not a slug (context report §6).
// This test makes every such drop loud: each catalogue text must pass, or be
// listed below with its tracker row. The screen is not loosened for a name.
const SLUG = /^[a-z0-9-]{1,40}$/;

/** Texts that fail today, each an owner action in the tracker. Must match the real failures exactly. */
const KNOWN_FAILURES: Record<string, string> = {
  "Sample Sunscreen SPF 50 (SYNTHETIC - replace)": "digits: any SPF number fails the no-number screen (tracker E08)",
  "Clear Seal": "owner name exception: 'clear' is a change word in the context screen (tracker E08)",
};

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
    expect(screenExternalText(text)).toBe(true);
  });

  it("the known-failure list is exactly the texts that fail (a fix or a new failure must update it)", () => {
    expect(texts.filter((t) => !screenExternalText(t)).sort()).toEqual(Object.keys(KNOWN_FAILURES).sort());
  });
});
