// Redesign lane C (screens 06, 14, 15): every new products string in one place,
// checked by tests/ui-wording.test.ts and tests/redesign-products.test.ts.
// No price, no cart, no buy wording (TD-34, TD-50 (g)); no result or benefit
// claim (D-12): the catalogue's claims whitelist is empty for all six products.

export const PRODUCTS_COPY = {
  details: "Product details",
  detailsLabel: (name: string) => `Product details: ${name}`,
  packSize: "Pack size",
  when: "When to use",
  slot: { AM: "Morning", PM: "Evening", AM_PM: "Morning and evening" },
  keyIngredient: "Key ingredient",
  active: (ingredient: string, pct: number) => `${ingredient} ${pct}%`,
  howToUse: "How to use",
  cautions: "Cautions",
  onStore: "See it on the store",
  opensNewTab: "(opens in a new tab)",
  outOfStock: "Out of stock on the store right now.",
  discontinued: "No longer sold on the store.",
  ownLine: "A Project Skin product.",
  back: "Back",
} as const;
