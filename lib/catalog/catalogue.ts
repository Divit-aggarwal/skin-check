import { CATALOG_SCHEMA_VERSION, CatalogueSchema, type Catalogue, type Product } from "./schema";
import type { NameException } from "./wording";

// E01 catalogue data. Owner decision TD-29 (1), 2026-10-09: the six products
// on the public store (theprojectskin.com, read on 2026-10-09 from its
// products.json and each product page; the 4-step kit is a bundle of these,
// not a product) are the real catalogue. Ingredient classes, the declared
// active and the usage text follow each product page's "Key actives" and
// "How to use"; usage and warnings are reworded only where the page uses a
// D-12 word ("treat", "clear", "reduce"). Names are the store titles without the store's "- Acne
// Prone Skin" suffix (a D-12 word, and not part of the product name); the
// two owner name exceptions below are kept. claims is empty: store marketing
// text is not evidence (D-12). inci is empty where the store lists none, and
// active is set only where the name states the concentration. Usage text is
// a neutral instruction, checked against the D-12 word list. mrpInr is the
// higher of the store's price and compare-at price. Product recommendations
// stay off (E05). Bump CATALOG_VERSION on any data change: routine events
// record it.
export const CATALOG_VERSION = "catalog-1-store-2026-10-09";

/**
 * Registered own-brand product names that may contain a word the D-12 word
 * check bans (owner decision 2026-10-03; proposed as a D-12 clarification: a
 * registered brand name is not by itself a claim). Applies only to a product
 * with dataSource "owner" whose whole name equals `name` (see
 * nameIsExcepted). Usage text and all other wording stay checked. A name that
 * is itself an efficacy statement needs explicit D-12 sign-off, not an entry.
 */
export const PRODUCT_NAME_EXCEPTIONS: readonly NameException[] = [
  { name: "Clear Seal", approvedBy: "owner", date: "2026-10-03", reason: "Registered own-brand product name" },
  { name: "Calming Moisturiser", approvedBy: "owner", date: "2026-10-06", reason: "Own-brand product name, same exact-name rule as Clear Seal (TD-26 (2))" },
];

const own = {
  dataSource: "owner",
  shopifyHandleVerified: true,
  inci: [],
  warnings: [],
  contraindications: [],
  regions: ["IN"],
  claims: [],
} as const;

export const CATALOGUE: Catalogue = CatalogueSchema.parse({
  schemaVersion: CATALOG_SCHEMA_VERSION,
  version: CATALOG_VERSION,
  products: [
    // Must equal the example row of catalogue-template.csv (tested).
    {
      ...own,
      id: "refreshing-cleanser",
      versionId: "refreshing-cleanser-2026-10-09",
      name: "Refreshing Cleanser",
      category: "cleanser",
      slot: "AM_PM",
      shopifyHandle: "refreshing-cleanser-acne-prone-skin",
      ingredientClasses: ["surfactant", "bha", "aha"],
      active: { ingredient: "Salicylic Acid", concentrationPct: 2 },
      warnings: ["If skin feels tight, use once a day and use moisturiser."],
      price: { mrpInr: 499, packSize: "100 ml" },
      availability: "available",
      usageText: "Massage onto damp skin morning and/or night, then rinse thoroughly.",
    },
    {
      ...own,
      id: "niacinamide-serum",
      versionId: "niacinamide-serum-2026-10-09",
      name: "5% Niacinamide Serum",
      category: "serum",
      slot: "AM_PM",
      shopifyHandle: "5-niacinamide-serum-acne-prone-skin",
      ingredientClasses: ["niacinamide", "humectant", "other"],
      active: { ingredient: "Niacinamide", concentrationPct: 5 },
      warnings: ["Patch test first.", "Start once a day if your skin barrier is reactive."],
      price: { mrpInr: 649, packSize: "30 ml" },
      availability: "available",
      usageText: "After cleansing, apply 2 to 3 drops to dry skin, then moisturiser, and sunscreen in the morning.",
    },
    {
      ...own,
      id: "calming-moisturiser",
      versionId: "calming-moisturiser-2026-10-09",
      name: "Calming Moisturiser",
      category: "moisturiser",
      slot: "AM_PM",
      shopifyHandle: "calming-moisturiser-acne-prone-skin",
      ingredientClasses: ["emollient", "humectant", "other"],
      active: null,
      price: { mrpInr: 449, packSize: "60 g" },
      availability: "available",
      usageText: "After the serum (or after cleansing), apply a thin layer morning and night. In the morning, follow with sunscreen.",
    },
    {
      ...own,
      id: "protecting-sunscreen",
      versionId: "protecting-sunscreen-2026-10-09",
      name: "Protecting Sunscreen SPF 50 PA++++",
      category: "sunscreen",
      slot: "AM",
      shopifyHandle: "protecting-sunscreen-acne-prone-skin",
      ingredientClasses: ["uv-filter", "niacinamide", "other"],
      active: null,
      price: { mrpInr: 649, packSize: "60 g" },
      availability: "available",
      usageText: "Apply generously as the last morning step, after moisturiser. Apply again after sweating or a long time outdoors.",
    },
    {
      ...own,
      id: "active-boba-cream",
      versionId: "active-boba-cream-2026-10-09",
      name: "Active Boba Encapsulated Cream",
      category: "other",
      slot: "AM_PM",
      shopifyHandle: "active-boba-encapsulated-cream-acne-prone-skin",
      ingredientClasses: ["niacinamide", "bha", "emollient", "other"],
      active: null,
      warnings: ["Introduce slowly if your skin barrier is compromised."],
      price: { mrpInr: 1499, packSize: "70 g" },
      availability: "out_of_stock",
      usageText: "After cleansing, activate a capsule and apply as directed. Follow with moisturiser if needed, and sunscreen in the morning.",
    },
    {
      ...own,
      id: "clear-seal",
      versionId: "clear-seal-2026-10-09",
      name: "Clear Seal",
      category: "other",
      slot: "AM_PM",
      shopifyHandle: "clear-seal",
      ingredientClasses: ["bha", "aha", "niacinamide", "other"],
      active: null,
      price: { mrpInr: 399, packSize: "20 ml" },
      availability: "available",
      usageText: "Apply a thin layer on a clean, dry spot and let it dry to a film. Use on single spots; use moisturiser around the area if needed.",
    },
  ],
});

const BY_ID = new Map(CATALOGUE.products.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return BY_ID.get(id);
}
