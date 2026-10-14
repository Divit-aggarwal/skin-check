import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// vitest compiles the components' JSX to React.createElement, so React must be global (as tests/echo-products.test.ts does).
(globalThis as { React?: typeof React }).React = React;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: () => undefined }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

import ProductRoute, { generateMetadata, generateStaticParams } from "@/app/(marketing)/products/[id]/page";
import { ProductCards } from "@/components/skin-check/ProductCards";
import { PRODUCTS_COPY } from "@/components/products/copy";
import { CATALOGUE } from "@/lib/catalog/catalogue";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { OWN_PRODUCT_INFO, OWN_PRODUCTS } from "@/lib/context/products";

// Redesign lane C, screen 15: the product page shows catalogue facts only.
// Never the price (TD-34, TD-50 (g)), no cart or buy wording, no unapproved
// description, a store link only for a product the store sells.

const render = (id: string) => renderToStaticMarkup(createElement(ProductRoute, { params: { id } }));
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : typeof v === "function" ? [String(v("Niacinamide", 5))] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

describe("product page (screen 15)", () => {
  it("has a page for each of the six own products, and no other", () => {
    expect(generateStaticParams().map((p) => p.id)).toEqual(CATALOGUE.products.map((p) => p.id));
    expect(() => render("made-up")).toThrow("NOT_FOUND");
  });

  it("shows name, pack size, how to use and cautions; never the price, a cart, a buy word or the unapproved description", () => {
    for (const p of CATALOGUE.products) {
      const html = render(p.id).replaceAll("&#x27;", "'");
      for (const part of [p.name, p.price.packSize, p.usageText, ...p.warnings]) expect(html, `${p.id}: ${part}`).toContain(part);
      expect(html, p.id).not.toMatch(/₹|\bRs\b|\bINR\b|mrp|price|cart|checkout|\bbuy\b/i);
      expect(html, p.id).not.toContain(String(p.price.mrpInr));
      expect(html, p.id).not.toContain(OWN_PRODUCT_INFO[p.id]!.description);
      expect(html, p.id).not.toMatch(/<img/);
    }
  });

  it("links to the store only for a product it sells; an out-of-stock one says so", () => {
    const sold = render("niacinamide-serum");
    expect(sold).toContain('href="https://theprojectskin.com/products/5-niacinamide-serum-acne-prone-skin"');
    expect(sold).toContain('rel="noopener noreferrer"');
    expect(sold).not.toContain(PRODUCTS_COPY.outOfStock);
    expect(render("active-boba-cream")).toContain(PRODUCTS_COPY.outOfStock);
  });

  it("sets its own description, so the root one is not inherited", () => {
    const m = generateMetadata({ params: { id: "clear-seal" } });
    expect(m.description).toBeTruthy();
    expect(m.openGraph.description).toBe(m.description);
    expect(bannedWordsIn(m.description)).toEqual([]);
  });

  it("every products string passes the D-12 word check", () => {
    const all = strings(PRODUCTS_COPY);
    expect(all.length).toBeGreaterThan(10);
    for (const s of all) expect(bannedWordsIn(s), s).toEqual([]);
  });
});

describe("Echo product cards (screen 14)", () => {
  it("each card links to its product page", () => {
    const html = renderToStaticMarkup(createElement(ProductCards, { products: OWN_PRODUCTS.map((p) => ({ productId: p.id })) }));
    for (const p of OWN_PRODUCTS) expect(html).toContain(`href="/products/${p.id}"`);
  });
});
