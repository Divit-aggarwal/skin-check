import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import feed from "./fixtures/store-products-2026-10-15.json";

// G37 lane C (screens 06, 14, 15, 16), TD-52 and TD-53: the store's price,
// photos and action; Add to cart only behind cartUi(); the store description
// on 15 only; screen 16's states. The store is the saved feed (2026-10-15).

(globalThis as { React?: typeof React }).React = React;

const routine = vi.hoisted(() => ({ value: { data: null as unknown, failed: false } }));
const auth = vi.hoisted(() => ({ value: { user: null as unknown, loading: false } }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: () => undefined }),
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));
vi.mock("@/components/routine/useRoutine", () => ({ useRoutine: () => routine.value }));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => auth.value }));
vi.mock("@/lib/store/products", async (orig) => {
  const real = await orig<typeof import("@/lib/store/products")>();
  const saved = () => real.toStoreProducts(feed);
  return { ...real, storeProducts: async () => saved(), storeProduct: async (id: string) => saved().find((p) => p.productId === id) ?? null };
});

import ProductRoute from "@/app/(marketing)/products/[id]/page";
import { GET } from "@/app/api/store/products/route";
import { ProductCards } from "@/components/skin-check/ProductCards";
import { SinceStarted } from "@/components/products/SinceStarted";
import { PRODUCTS_COPY as C } from "@/components/products/copy";
import { toStoreProducts } from "@/lib/store/products";
import { cartUrl, productUrl } from "@/lib/feature-contracts/store-products";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { startedProducts } from "@/lib/routine/events";

const store = toStoreProducts(feed);
const by = (id: string) => store.find((p) => p.productId === id)!;
const cards = (s = store) => renderToStaticMarkup(createElement(ProductCards, { products: [{ productId: "refreshing-cleanser" }, { productId: "niacinamide-serum" }], store: s }));
const page = async (id: string) => renderToStaticMarkup(await ProductRoute({ params: { id } })).replaceAll("&#x27;", "'");
const decode = (html: string) => html.replaceAll("&amp;", "&");
const DESCRIPTION_BIT = (html: string) => html.replace(/<[^>]+>/g, " ").trim().split(/\s+/).slice(0, 4).join(" ");

afterEach(() => {
  vi.unstubAllEnvs();
  routine.value = { data: null, failed: false };
  auth.value = { user: null, loading: false };
});

describe("Echo product cards with store data (screen 14)", () => {
  it("shows the store photo and the live price, with the was-price only when higher", () => {
    const html = cards();
    expect(html).toContain("cdn.shopify.com");
    expect(html).toMatch(/₹399/);
    expect(html).toMatch(/<s[^>]*>.*₹499<\/s>/); // cleanser: 399, was 499
    expect(html).toMatch(/₹649/);
    expect(html).not.toMatch(/₹599/); // serum: compare-at 599 is lower than 649, so no was-price
  });

  it("cart flag off: View in store (the product page); on: Add to cart (the store cart link)", () => {
    const serum = by("niacinamide-serum");
    expect(decode(cards())).toContain(`href="${productUrl(serum.handle)}"`);
    expect(cards()).toContain(C.viewInStore);
    expect(cards()).not.toMatch(/Add to cart/);
    vi.stubEnv("NEXT_PUBLIC_UI_CART", "on");
    expect(decode(cards())).toContain(`href="${cartUrl(serum.variantId)}"`);
    expect(cards()).toContain(C.addToCart);
  });

  it("out of stock: a disabled Out of stock button, no store action", () => {
    const html = cards(store.map((p) => (p.productId === "niacinamide-serum" ? { ...p, available: false } : p)));
    expect(html).toMatch(/<button type="button" disabled=""[^>]*>Out of stock<\/button>/);
    expect(decode(html)).not.toContain(productUrl(by("niacinamide-serum").handle));
  });

  it("never shows the store description", () => {
    const html = cards();
    for (const p of store) if (p.descriptionHtml) expect(html).not.toContain(DESCRIPTION_BIT(p.descriptionHtml));
  });

  it("the browser's store route never carries the description", async () => {
    const body = await (await GET()).json();
    expect(body.products).toHaveLength(store.length);
    expect(JSON.stringify(body)).not.toContain("descriptionHtml");
  });
});

describe("product page with store data (screen 15)", () => {
  it("gallery, price, the store's description under From the store, and View in store", async () => {
    const sun = by("protecting-sunscreen");
    const html = await page("protecting-sunscreen");
    expect(html.match(/<img/g)?.length).toBe(sun.images.length);
    expect(html).toContain("₹649");
    expect(html).toContain(C.fromStore);
    expect(html).toContain(DESCRIPTION_BIT(sun.descriptionHtml));
    expect(decode(html)).toContain(`href="${productUrl(sun.handle)}"`);
    expect(html).not.toMatch(/similar users|Visible results/i);
  });

  it("Add to cart only with the flag; out of stock is a disabled button", async () => {
    vi.stubEnv("NEXT_PUBLIC_UI_CART", "on");
    expect(decode(await page("clear-seal"))).toContain(`href="${cartUrl(by("clear-seal").variantId)}"`);
    const boba = await page("active-boba-cream");
    expect(boba).toMatch(/<button type="button" disabled=""[^>]*>Out of stock<\/button>/);
    expect(decode(boba)).not.toContain(cartUrl(by("active-boba-cream").variantId));
  });

  it("links screen 16 only when the product is in the user's routine", async () => {
    expect(await page("niacinamide-serum")).not.toContain("/products/niacinamide-serum/since");
    routine.value = { data: { routine: [{ productId: "niacinamide-serum", schedule: { slot: "AM", days: [1] }, since: "2026-09-01" }] }, failed: false };
    expect(await page("niacinamide-serum")).toContain('href="/products/niacinamide-serum/since"');
  });
});

describe("since you started (screen 16)", () => {
  const render = () => renderToStaticMarkup(createElement(SinceStarted, { id: "niacinamide-serum" })).replaceAll("&#x27;", "'");
  const user = { uid: "u1" };

  it("TD-53: the title is the one waived phrase; every other word is checked", () => {
    expect(bannedWordsIn(C.sinceTitle("5% Niacinamide Serum"))).toEqual(["since you started"]);
    expect(C.sinceTitle("X")).toBe("Since you started X");
  });

  it("no product started: an empty state that links to /routine", () => {
    auth.value = { user, loading: false };
    routine.value = { data: { routine: [] }, failed: false };
    const html = render();
    expect(html).toContain(C.emptyTitle);
    expect(html).toContain('href="/routine"');
  });

  it("this product not started: says so, with the started ones as chips", () => {
    auth.value = { user, loading: false };
    routine.value = { data: { routine: [{ productId: "refreshing-cleanser", schedule: { slot: "AM", days: [1] }, since: "2026-09-01" }] }, failed: false };
    const html = render();
    expect(html).toContain('href="/products/refreshing-cleanser/since"');
    expect(html).toContain("is not in your routine");
  });

  it("signed out: the sign-in card; never a claim word", () => {
    const html = render();
    expect(html).toContain(C.signIn);
    expect(html).not.toMatch(/working|improving|response|insight/i);
  });

  it("started products in catalogue order with their start day; other products left out", () => {
    const items = [
      { productId: "protecting-sunscreen", schedule: { slot: "AM" as const, days: [1] }, since: "2026-09-02" },
      { productId: "other-not-ours", schedule: { slot: "AM" as const, days: [1] }, since: "2026-09-03" },
      { productId: "refreshing-cleanser", schedule: { slot: "AM" as const, days: [1] }, since: "2026-09-01" },
    ];
    expect(startedProducts(items, store.map((p) => p.productId))).toEqual([
      { productId: "refreshing-cleanser", startedOn: "2026-09-01" },
      { productId: "protecting-sunscreen", startedOn: "2026-09-02" },
    ]);
  });
});

describe("H36: products follow the personalisation consent", async () => {
  const { personalisationOn } = await import("@/components/products/PersonalisedProducts");
  const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);
  const token = async () => "t";
  afterEach(() => vi.unstubAllGlobals());

  it("on only when the newest answer grants it; withdrawn, a failed read or no answer is off", async () => {
    vi.stubGlobal("fetch", answer({ consents: [{ purpose: "personalisation", granted: true }] }));
    expect(await personalisationOn("a", token)).toBe(true);
    vi.stubGlobal("fetch", answer({ consents: [{ purpose: "personalisation", granted: false }] }));
    expect(await personalisationOn("b", token)).toBe(false);
    vi.stubGlobal("fetch", answer({}, false));
    expect(await personalisationOn("c", token)).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await personalisationOn("d", token)).toBe(false);
  });
});
