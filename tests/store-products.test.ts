import { describe, expect, it } from "vitest";
import feed from "./fixtures/store-products-2026-10-15.json";
import { sanitizeDescription, toStoreProducts } from "@/lib/store/products";
import { cartUrl } from "@/lib/contracts/store-products";

// TD-52: live store data. Feed saved from theprojectskin.com/products.json on 2026-10-15 (trimmed to the fields read).
describe("store products (TD-52)", () => {
  const products = toStoreProducts(feed);

  it("returns the six catalogue products only, never the 4-step kit", () => {
    expect(products.map((p) => p.productId)).toEqual([
      "refreshing-cleanser", "niacinamide-serum", "calming-moisturiser", "protecting-sunscreen", "active-boba-cream", "clear-seal",
    ]);
    expect(products.some((p) => p.handle.includes("kit"))).toBe(false);
  });

  it("shows a was-price only when it is higher than the price", () => {
    const by = Object.fromEntries(products.map((p) => [p.productId, p]));
    expect(by["refreshing-cleanser"]).toMatchObject({ price: 399, wasPrice: 499 });
    expect(by["active-boba-cream"]).toMatchObject({ price: 1499, wasPrice: null, available: false });
    expect(by["protecting-sunscreen"]).toMatchObject({ price: 649, wasPrice: null });
  });

  it("builds the store cart link from the variant", () => {
    expect(cartUrl(63067458535795)).toBe("https://theprojectskin.com/cart/63067458535795:1");
  });

  it("keeps only plain text tags, with no attributes, and drops scripts", () => {
    expect(sanitizeDescription('<p style="x" onclick="a()">Hi <strong>there</strong></p><script>alert(1)</script><img src=x onerror=a()><a href="javascript:x">link</a>'))
      .toBe("<p>Hi <strong>there</strong></p>link");
    expect(sanitizeDescription("<p>&nbsp;</p><p>a &lt; b</p>")).toBe("<p>a &lt; b</p>");
    expect(sanitizeDescription("1 < 2 <scr")).toBe("1 &lt; 2 &lt;scr");
    for (const p of products) expect(p.descriptionHtml).not.toMatch(/<(?!\/?(p|ul|ol|li|strong|em|br)>)/);
  });
});
