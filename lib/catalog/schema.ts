import { z } from "zod";

// E01. The shape of one own-brand product (docs/lanes/routine-design.md §2.1).
// Strict at every level: an unknown field anywhere is a rejected entry, not a
// silently dropped one. Bump CATALOG_SCHEMA_VERSION when this shape changes;
// bump CATALOG_VERSION (catalogue.ts) when the data changes.
export const CATALOG_SCHEMA_VERSION = 1 as const;

/** A real calendar date written as "YYYY-MM-DD" (rejects 2026-02-30). */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((s) => {
    // zod runs this even when the regex failed, so an invalid Date must not throw.
    const t = Date.parse(`${s}T00:00:00Z`);
    return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === s;
  }, "not a calendar date");

export const INGREDIENT_CLASSES = [
  "surfactant", "humectant", "emollient", "occlusive", "uv-filter", "niacinamide",
  "retinoid", "aha", "bha", "vitamin-c", "fragrance", "other",
] as const;

export const SlotSchema = z.enum(["AM", "PM", "AM_PM"]);

export const ClaimSchema = z.strictObject({
  text: z.string().trim().min(1),
  evidenceLevel: z.enum(["product-test", "consumer-perception", "ingredient+concentration"]),
  source: z.string().trim().min(1),
  date: IsoDate,
});

/** Without the cross-field check, so tests can list its fields via `.shape`. */
export const ProductFields = z.strictObject({
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  versionId: z.string().trim().min(1),
  dataSource: z.enum(["synthetic", "owner"]),
  name: z.string().trim().min(1).max(120),
  category: z.enum(["cleanser", "moisturiser", "sunscreen", "serum", "other"]),
  slot: SlotSchema,
  shopifyHandle: z.string().trim().min(1).nullable(),
  shopifyHandleVerified: z.boolean(),
  ingredientClasses: z.array(z.enum(INGREDIENT_CLASSES)),
  inci: z.array(z.string().trim().min(1)),
  active: z
    .strictObject({ ingredient: z.string().trim().min(1), concentrationPct: z.number().gt(0).lte(100) })
    .nullable(),
  warnings: z.array(z.string().trim().min(1)),
  contraindications: z.array(z.enum(["pregnant_or_breastfeeding", "prescription_in_use"])),
  price: z.strictObject({ mrpInr: z.number().int().nonnegative(), packSize: z.string().trim().min(1) }),
  availability: z.enum(["available", "out_of_stock", "discontinued"]),
  regions: z.array(z.enum(["IN"])).min(1),
  usageText: z.string().trim().min(1),
  claims: z.array(ClaimSchema),
});

export const ProductSchema = ProductFields.refine((p) => !p.shopifyHandleVerified || p.shopifyHandle !== null, {
  message: "shopifyHandleVerified needs a shopifyHandle",
  path: ["shopifyHandleVerified"],
});

export const CatalogueSchema = z
  .strictObject({
    schemaVersion: z.literal(CATALOG_SCHEMA_VERSION),
    version: z.string().trim().min(1),
    products: z.array(ProductSchema),
  })
  .refine((c) => new Set(c.products.map((p) => p.id)).size === c.products.length, {
    message: "duplicate product id",
    path: ["products"],
  });

export type Product = z.infer<typeof ProductSchema>;
export type Catalogue = z.infer<typeof CatalogueSchema>;
export type Slot = z.infer<typeof SlotSchema>;
