import type { Catalogue, Product } from "@/lib/catalog/schema";

// A second catalogue for the local recommendation preview only (G03 part 4).
// FROM THE PUBLIC STORE, NOT VERIFIED BY THE OWNER. Read from
// https://theprojectskin.com/products/<handle> on 2026-10-06: name, step, key
// ingredient, size and price as the product pages show them. Nothing here is
// used outside /dev/recommendations. Since TD-29 (1), 2026-10-09, the app's
// own catalogue (lib/catalog) is these six products as owner data.
//
// Each product is also written in the rules' vocabulary (category, ingredient
// classes, declared active), because that is all lib/rules reads. Those
// mappings are assumptions made from the page text, not owner data; each one
// is listed in `assumed`.

export const STORE_SOURCE = "From the public store, not verified by the owner";
export const STORE_READ_ON = "2026-10-06";
export const STORE_CATALOG_VERSION = "store-public-2026-10-06-unverified";

export type StoreStep = "Cleanse" | "Treat" | "Moisturise" | "Protect";

export interface StoreProduct {
  /** As shown on the product page. */
  name: string;
  step: StoreStep;
  keyIngredient: string;
  size: string;
  price: string;
  inStock: boolean;
  url: string;
  howToUse: string;
  /** The rules' view of this product. */
  rules: Pick<Product, "category" | "slot" | "ingredientClasses" | "active" | "availability">;
  /** What was assumed to write it in the rules' vocabulary. */
  assumed: string[];
}

const url = (handle: string) => `https://theprojectskin.com/products/${handle}`;

export const STORE_PRODUCTS: Record<string, StoreProduct> = {
  "store-refreshing-cleanser": {
    name: "Refreshing Cleanser",
    step: "Cleanse",
    keyIngredient: "2% Salicylic Acid (BHA), with 1% Glycolic Acid",
    size: "100ml",
    price: "Rs. 399.00",
    inStock: true,
    url: url("refreshing-cleanser-acne-prone-skin"),
    howToUse: "Massage onto damp skin morning and/or night, rinse thoroughly.",
    rules: { category: "cleanser", slot: "AM_PM", ingredientClasses: ["surfactant", "bha", "aha"], active: { ingredient: "Salicylic Acid", concentrationPct: 2 }, availability: "available" },
    assumed: ["Salicylic Acid is class bha and Glycolic Acid is class aha.", "Declared active: Salicylic Acid 2% (the page's headline ingredient)."],
  },
  "store-niacinamide-serum": {
    name: "5% Niacinamide Serum",
    step: "Treat",
    keyIngredient: "5% Niacinamide + Zinc PCA",
    size: "30 ml",
    price: "Rs. 649.00",
    inStock: true,
    url: url("5-niacinamide-serum-acne-prone-skin"),
    howToUse: "Cleanse, 2–3 drops on dry skin, moisturise, SPF in the morning. Start once daily if your barrier is reactive. Patch test first.",
    rules: { category: "serum", slot: "AM_PM", ingredientClasses: ["niacinamide", "humectant", "other"], active: { ingredient: "Niacinamide", concentrationPct: 5 }, availability: "available" },
    assumed: ["Morning and evening, from the kit's how-to-use.", "Zinc PCA, SEPICONCONTROL A5 and PDRN have no ingredient class; written as 'other'."],
  },
  "store-clear-seal": {
    name: "Clear Seal",
    step: "Treat",
    keyIngredient: "Liquid hydrocolloid shield: Salicylic Acid + Glycolic Acid + Niacinamide",
    size: "20 ml",
    price: "Rs. 399.00",
    inStock: true,
    url: url("clear-seal"),
    howToUse: "Apply a thin layer on a clean, dry breakout. Allow to dry to a clear film. Use spot-wise.",
    rules: { category: "other", slot: "AM_PM", ingredientClasses: ["bha", "aha", "niacinamide", "other"], active: null, availability: "available" },
    assumed: ["A spot product has no category in the rules; written as 'other'.", "No concentration is shown, so no declared active.", "Spot use at any time; written as morning and evening."],
  },
  "store-active-boba": {
    name: "Active Boba",
    step: "Treat",
    keyIngredient: "Micro-encapsulated actives: Niacinamide, Salicylic Acid, Zinc PCA, with ceramides",
    size: "70 gms",
    price: "Rs. 1,499.00",
    inStock: false,
    url: url("active-boba-encapsulated-cream-acne-prone-skin"),
    howToUse: "After cleansing, activate a capsule and apply as directed. Follow with moisturiser if needed and SPF in the morning.",
    rules: { category: "other", slot: "AM_PM", ingredientClasses: ["niacinamide", "bha", "emollient", "other"], active: null, availability: "out_of_stock" },
    assumed: ["A treatment cream has no category in the rules; written as 'other'.", "No concentration is shown, so no declared active.", "The page showed 'Sold out' on 2026-10-06."],
  },
  "store-calming-moisturiser": {
    name: "Calming Moisturiser",
    step: "Moisturise",
    keyIngredient: "Ceramide NP barrier complex",
    size: "60 gms",
    price: "Rs. 449.00",
    inStock: true,
    url: url("calming-moisturiser-acne-prone-skin"),
    howToUse: "After the treat step (or after cleanse), apply a thin layer morning and night. In the morning, follow with sunscreen.",
    rules: { category: "moisturiser", slot: "AM_PM", ingredientClasses: ["emollient", "humectant", "other"], active: null, availability: "available" },
    assumed: ["Ceramides, C15-19 Alkane and the six-botanical complex (with Phytic Acid) have no active class; written as emollient, humectant and 'other'."],
  },
  "store-protecting-sunscreen": {
    name: "Protecting Sunscreen",
    step: "Protect",
    keyIngredient: "SPF 50+ PA++++ hybrid (Tinosorb S), 0.5% Zinc PCA, Niacinamide",
    size: "60 gms",
    price: "Rs. 649.00",
    inStock: true,
    url: url("protecting-sunscreen-acne-prone-skin"),
    howToUse: "Apply generously as the last morning step after moisturiser.",
    rules: { category: "sunscreen", slot: "AM", ingredientClasses: ["uv-filter", "niacinamide", "other"], active: null, availability: "available" },
    assumed: ["The page lists Niacinamide among its 'key filters and supports'; written as class niacinamide.", "Zinc PCA 0.5% has no class; written as 'other'."],
  },
};

/** Left out: a bundle of four of the products above, not a product of its own. */
export const STORE_LEFT_OUT = [{ name: "Project Skin Complete 4-Step Skincare Routine Kit", price: "Rs. 1,699.00", why: "A bundle of the cleanser, serum, moisturiser and sunscreen above." }];

/**
 * The store products in the rules' Catalogue shape. dataSource has only
 * "synthetic" or "owner"; neither is true here, and recommend() never reads it.
 * "synthetic" (not owner-supplied) is used, and STORE_SOURCE says what the
 * data really is everywhere it is shown.
 */
export const STORE_CATALOGUE: Catalogue = {
  schemaVersion: 1,
  version: STORE_CATALOG_VERSION,
  products: Object.entries(STORE_PRODUCTS).map(([id, p]) => ({
    id,
    versionId: `${id}-${STORE_READ_ON}`,
    dataSource: "synthetic",
    name: p.name,
    ...p.rules,
    shopifyHandle: p.url.split("/").pop()!,
    shopifyHandleVerified: false,
    inci: [],
    warnings: [],
    contraindications: [],
    price: { mrpInr: Math.round(Number(/[\d,]+(\.\d+)?/.exec(p.price)![0].replace(/,/g, ""))), packSize: p.size },
    regions: ["IN"],
    usageText: p.howToUse,
    claims: [],
  })),
};
