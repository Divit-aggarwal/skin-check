import { CATALOG_SCHEMA_VERSION, CatalogueSchema, type Catalogue, type Product } from "./schema";
import type { NameException } from "./wording";

// E01 catalogue data. SYNTHETIC until the owner supplies real products through
// lib/catalog/catalogue-template.csv (decision R-3 A). Every sample product has
// dataSource "synthetic" and "SYNTHETIC" in its name; replace before the final
// deploy. Bump CATALOG_VERSION on any data change: routine events record it.
export const CATALOG_VERSION = "catalog-0-synthetic";

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
];

const synthetic = {
  dataSource: "synthetic",
  shopifyHandleVerified: false,
  warnings: [],
  contraindications: [],
  availability: "available",
  regions: ["IN"],
  claims: [],
} as const;

export const CATALOGUE: Catalogue = CatalogueSchema.parse({
  schemaVersion: CATALOG_SCHEMA_VERSION,
  version: CATALOG_VERSION,
  products: [
    // Must equal the example row of catalogue-template.csv (tested).
    {
      ...synthetic,
      id: "sample-cleanser",
      versionId: "sample-cleanser-v1",
      name: "Sample Gentle Cleanser (SYNTHETIC - replace)",
      category: "cleanser",
      slot: "AM_PM",
      shopifyHandle: "sample-gentle-cleanser",
      ingredientClasses: ["surfactant", "humectant"],
      inci: ["Aqua", "Glycerin", "Sodium Cocoyl Isethionate"],
      active: null,
      warnings: ["Avoid contact with eyes"],
      price: { mrpInr: 349, packSize: "100 ml" },
      usageText: "Massage onto damp skin and rinse.",
      claims: [
        {
          text: "Cleanses without leaving a residue",
          evidenceLevel: "consumer-perception",
          source: "SYNTHETIC - no study",
          date: "2026-10-03",
        },
      ],
    },
    {
      ...synthetic,
      id: "sample-moisturiser",
      versionId: "sample-moisturiser-v1",
      name: "Sample Daily Moisturiser (SYNTHETIC - replace)",
      category: "moisturiser",
      slot: "AM_PM",
      shopifyHandle: null,
      ingredientClasses: ["humectant", "emollient"],
      inci: [],
      active: null,
      price: { mrpInr: 499, packSize: "50 g" },
      usageText: "Apply a small amount after cleansing.",
    },
    {
      ...synthetic,
      id: "sample-sunscreen",
      versionId: "sample-sunscreen-v1",
      name: "Sample Sunscreen SPF 50 (SYNTHETIC - replace)",
      category: "sunscreen",
      slot: "AM",
      shopifyHandle: null,
      ingredientClasses: ["uv-filter"],
      inci: [],
      active: null,
      price: { mrpInr: 599, packSize: "50 g" },
      usageText: "Apply as the last morning step, before going outdoors.",
    },
  ],
});

const BY_ID = new Map(CATALOGUE.products.map((p) => [p.id, p]));

export function getProduct(id: string): Product | undefined {
  return BY_ID.get(id);
}
