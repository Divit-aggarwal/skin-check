import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG_SCHEMA_VERSION, CatalogueSchema, IsoDate, ProductFields, ProductSchema } from "@/lib/catalog/schema";
import { CATALOG_VERSION, CATALOGUE, PRODUCT_NAME_EXCEPTIONS, getProduct } from "@/lib/catalog/catalogue";
import { bannedWordsIn, nameIsExcepted, type NameException } from "@/lib/catalog/wording";

const valid = () => ({
  id: "p-1",
  versionId: "p-1-v1",
  dataSource: "owner",
  name: "Plain Cleanser",
  category: "cleanser",
  slot: "AM_PM",
  shopifyHandle: null,
  shopifyHandleVerified: false,
  ingredientClasses: ["surfactant"],
  inci: [],
  active: { ingredient: "Niacinamide", concentrationPct: 5 },
  warnings: [],
  contraindications: [],
  price: { mrpInr: 299, packSize: "100 ml" },
  availability: "available",
  regions: ["IN"],
  usageText: "Massage onto damp skin and rinse.",
  claims: [{ text: "Gentle", evidenceLevel: "product-test", source: "Study 1", date: "2026-01-31" }],
});
const ok = (p: unknown) => ProductSchema.safeParse(p).success;

describe("E01 catalogue schema", () => {
  it("the shipped CATALOGUE passes and carries both version constants", () => {
    expect(CatalogueSchema.safeParse(CATALOGUE).success).toBe(true);
    expect(CATALOG_SCHEMA_VERSION).toBe(1);
    expect(CATALOG_VERSION).toMatch(/\S/);
    expect(CATALOGUE.version).toBe(CATALOG_VERSION);
    expect(getProduct("sample-cleanser")?.id).toBe("sample-cleanser");
    expect(getProduct("nope")).toBeUndefined();
  });

  it("the sample is visibly synthetic (R-3 A)", () => {
    for (const p of CATALOGUE.products) {
      expect(p.dataSource).toBe("synthetic");
      expect(p.name).toContain("SYNTHETIC");
    }
  });

  it("a valid minimal product passes", () => expect(ok(valid())).toBe(true));

  it("rejects an unknown top-level field", () => expect(ok({ ...valid(), extra: 1 })).toBe(false));

  it("rejects an unknown nested field in claims, price or active", () => {
    const v = valid();
    expect(ok({ ...v, claims: [{ ...v.claims[0], extra: 1 }] })).toBe(false);
    expect(ok({ ...v, price: { ...v.price, extra: 1 } })).toBe(false);
    expect(ok({ ...v, active: { ...v.active, extra: 1 } })).toBe(false);
  });

  it("rejects a duplicate id and an unknown catalogue field", () => {
    const base = { schemaVersion: 1, version: "x", products: [valid()] };
    expect(CatalogueSchema.safeParse(base).success).toBe(true);
    expect(CatalogueSchema.safeParse({ ...base, products: [valid(), valid()] }).success).toBe(false);
    expect(CatalogueSchema.safeParse({ ...base, extra: 1 }).success).toBe(false);
  });

  it("rejects a bad id slug", () => {
    for (const id of ["P-1", "p 1", "p_1", "-p", "p-", ""]) expect(ok({ ...valid(), id })).toBe(false);
  });

  it("rejects concentrationPct of 0 or above 100", () => {
    for (const concentrationPct of [0, -1, 100.1]) {
      expect(ok({ ...valid(), active: { ingredient: "X", concentrationPct } })).toBe(false);
    }
    expect(ok({ ...valid(), active: { ingredient: "X", concentrationPct: 100 } })).toBe(true);
  });

  it("rejects a negative or fractional mrpInr", () => {
    expect(ok({ ...valid(), price: { mrpInr: -1, packSize: "1" } })).toBe(false);
    expect(ok({ ...valid(), price: { mrpInr: 9.5, packSize: "1" } })).toBe(false);
  });

  it("rejects a claim date that is not a YYYY-MM-DD calendar date", () => {
    for (const date of ["2026-1-31", "31-01-2026", "2026-02-30", "2026-01-31T00:00:00Z"]) {
      expect(ok({ ...valid(), claims: [{ ...valid().claims[0], date }] })).toBe(false);
    }
  });

  it("rejects an evidenceLevel outside the enum", () => {
    expect(ok({ ...valid(), claims: [{ ...valid().claims[0], evidenceLevel: "anecdote" }] })).toBe(false);
  });

  it("rejects an unknown ingredientClass", () => {
    expect(ok({ ...valid(), ingredientClasses: ["peptide"] })).toBe(false);
  });

  it("rejects shopifyHandleVerified true with a null handle", () => {
    expect(ok({ ...valid(), shopifyHandleVerified: true })).toBe(false);
    expect(ok({ ...valid(), shopifyHandle: "h", shopifyHandleVerified: true })).toBe(true);
  });
});

// ── Template ↔ schema drift ────────────────────────────────────────────────
// Minimal RFC 4180 reader: quoted cells may hold commas and "" escapes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = "";
  };
  const endRow = () => {
    endCell();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") endCell();
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      endRow();
    } else cell += c;
  }
  if (cell !== "" || row.length) endRow();
  return rows.filter((r) => r.some((c) => c !== ""));
}

const list = (s: string) => (s === "" ? [] : s.split(";").map((x) => x.trim()));
const orNull = (s: string) => (s === "" ? null : s);

// Each CSV column → the schema field it fills. Claims use claim_<n>_*.
const COLUMN_FIELD: Record<string, string> = {
  id: "id",
  version_id: "versionId",
  data_source: "dataSource",
  name: "name",
  category: "category",
  slot: "slot",
  shopify_handle: "shopifyHandle",
  shopify_handle_verified: "shopifyHandleVerified",
  ingredient_classes: "ingredientClasses",
  inci: "inci",
  active_ingredient: "active.ingredient",
  active_concentration_pct: "active.concentrationPct",
  warnings: "warnings",
  contraindications: "contraindications",
  mrp_inr: "price.mrpInr",
  pack_size: "price.packSize",
  availability: "availability",
  regions: "regions",
  usage_text: "usageText",
};
const CLAIM_FIELD: Record<string, string> = { text: "text", evidence_level: "evidenceLevel", source: "source", date: "date" };

function rowToProduct(header: string[], cells: string[]) {
  const c = Object.fromEntries(header.map((h, i) => [h, cells[i]!.trim()]));
  const claims = [];
  for (let n = 1; c[`claim_${n}_text`] !== undefined; n++) {
    if (c[`claim_${n}_text`] === "") continue;
    claims.push({
      text: c[`claim_${n}_text`],
      evidenceLevel: c[`claim_${n}_evidence_level`],
      source: c[`claim_${n}_source`],
      date: c[`claim_${n}_date`],
    });
  }
  return {
    id: c.id,
    versionId: c.version_id,
    dataSource: c.data_source,
    name: c.name,
    category: c.category,
    slot: c.slot,
    shopifyHandle: orNull(c.shopify_handle!),
    shopifyHandleVerified: c.shopify_handle_verified === "yes",
    ingredientClasses: list(c.ingredient_classes!),
    inci: list(c.inci!),
    active: c.active_ingredient
      ? { ingredient: c.active_ingredient, concentrationPct: Number(c.active_concentration_pct) }
      : null,
    warnings: list(c.warnings!),
    contraindications: list(c.contraindications!),
    price: { mrpInr: Number(c.mrp_inr), packSize: c.pack_size },
    availability: c.availability,
    regions: list(c.regions!),
    usageText: c.usage_text,
    claims,
  };
}

describe("E01 catalogue-template.csv", () => {
  const [header, ...rows] = parseCsv(readFileSync("lib/catalog/catalogue-template.csv", "utf8"));

  it("every row has the header's column count", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r).toHaveLength(header!.length);
  });

  it("every column maps to a schema field, and every schema field has a column", () => {
    const mapped = new Set<string>();
    for (const h of header!) {
      const claim = /^claim_\d+_(.+)$/.exec(h);
      const field = claim ? `claims[].${CLAIM_FIELD[claim[1]!]}` : COLUMN_FIELD[h];
      expect(field && !field.endsWith("undefined"), `column ${h} has no mapping`).toBe(true);
      mapped.add(field!);
    }
    const leaves = Object.entries(ProductFields.shape).flatMap(([k, s]) => {
      if (k === "active") return ["active.ingredient", "active.concentrationPct"];
      if (k === "price") return ["price.mrpInr", "price.packSize"];
      if (k === "claims") return ["claims[].text", "claims[].evidenceLevel", "claims[].source", "claims[].date"];
      void s;
      return [k];
    });
    for (const f of leaves) expect(mapped.has(f), `schema field ${f} has no column`).toBe(true);
    expect(mapped.size).toBe(leaves.length);
  });

  it("each row converts to a valid product; the example row equals the shipped sample", () => {
    for (const r of rows) expect(ProductSchema.safeParse(rowToProduct(header!, r)).error).toBeUndefined();
    expect(rowToProduct(header!, rows[0]!)).toEqual(getProduct("sample-cleanser"));
  });

  it("extra claim_<n>_* columns map by pattern", () => {
    const h = [...header!, "claim_4_text", "claim_4_evidence_level", "claim_4_source", "claim_4_date"];
    const p = rowToProduct(h, [...rows[0]!, "Feels light", "consumer-perception", "Survey 2", "2026-09-01"]);
    expect(p.claims).toHaveLength(2);
    expect(ProductSchema.safeParse(p).success).toBe(true);
  });
});

describe("E01 catalogue wording (D-12)", () => {
  it("names (except owner exceptions) and usage text carry no banned word", () => {
    for (const p of CATALOGUE.products) {
      expect(nameIsExcepted(p, PRODUCT_NAME_EXCEPTIONS) || bannedWordsIn(p.name).length === 0, p.name).toBe(true);
      expect(bannedWordsIn(p.usageText), p.usageText).toEqual([]);
    }
  });

  it("every exception carries owner approval, a date and a reason", () => {
    for (const e of PRODUCT_NAME_EXCEPTIONS) {
      expect(e.approvedBy).toBe("owner");
      expect(IsoDate.safeParse(e.date).success).toBe(true);
      expect(e.reason.trim()).not.toBe("");
    }
  });

  it("self-check: the exception is exact, whole-name, owner-only, and never covers usage text", () => {
    const planted: NameException[] = [{ name: "Clear Seal", approvedBy: "owner", date: "2026-10-03", reason: "test" }];
    const owner = (name: string) => ({ name, dataSource: "owner" as const });
    expect(bannedWordsIn("Clear Seal")).not.toEqual([]);
    expect(nameIsExcepted(owner("Clear Seal"), planted)).toBe(true);
    expect(nameIsExcepted(owner("Clear Seal Serum"), planted)).toBe(false);
    expect(nameIsExcepted(owner("clear seal"), planted)).toBe(false);
    expect(nameIsExcepted({ name: "Clear Seal", dataSource: "synthetic" }, planted)).toBe(false);
    expect(nameIsExcepted(owner("Clear Seal"), [])).toBe(false);
    expect(bannedWordsIn("Use Clear Seal for clearer skin")).not.toEqual([]);
  });
});
