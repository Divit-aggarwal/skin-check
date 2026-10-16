// SERVER ONLY. TD-52: the store's live products (price, stock, images, the
// store's own description), read from products.json and cached 10 minutes by
// Next's fetch cache. Only products in our catalogue are returned (the 4-step
// kit is not), matched by the catalogue's verified shopifyHandle.

import { readFile } from "node:fs/promises";
import { z } from "zod";
import { CATALOGUE } from "@/lib/catalog/catalogue";
import { STORE_CACHE_SECONDS, STORE_ORIGIN, type StoreProduct } from "@/lib/feature-contracts/store-products";

const Money = z.string().regex(/^\d+(\.\d+)?$/).transform(Number);
const FeedSchema = z.object({
  products: z.array(
    z.object({
      handle: z.string(),
      title: z.string(),
      body_html: z.string().nullable(),
      images: z.array(z.object({ src: z.string().url(), width: z.number(), height: z.number(), alt: z.string().nullable().optional() })),
      variants: z.array(z.object({ id: z.number(), price: Money, compare_at_price: Money.nullable(), available: z.boolean() })).min(1),
    }),
  ),
});
export type StoreFeed = z.input<typeof FeedSchema>;

const ALLOWED = new Set(["p", "ul", "ol", "li", "strong", "em", "br"]);

/** Keeps only ALLOWED tags, with no attributes; drops script and style with their content. */
export function sanitizeDescription(html: string): string {
  const noCode = html.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, "");
  return noCode
    .split(/(<\/?[a-zA-Z][a-zA-Z0-9]*\b[^>]*>)/)
    .map((part) => {
      const tag = /^<(\/?)([a-zA-Z][a-zA-Z0-9]*)/.exec(part);
      if (tag && part.endsWith(">")) {
        const name = (tag[2] ?? "").toLowerCase();
        return ALLOWED.has(name) ? `<${tag[1]}${name}>` : "";
      }
      return part.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    })
    .join("")
    .replace(/(<p>\s*(&nbsp;|\s)*<\/p>)+/g, "")
    .trim();
}

/** Feed → our products, in catalogue order. Pure, for tests. */
export function toStoreProducts(feed: StoreFeed): StoreProduct[] {
  const parsed = FeedSchema.parse(feed);
  const byHandle = new Map(parsed.products.map((p) => [p.handle, p]));
  return CATALOGUE.products.flatMap((c) => {
    const p = c.shopifyHandle ? byHandle.get(c.shopifyHandle) : undefined;
    const v = p?.variants[0];
    if (!p || !v) return [];
    return [
      {
        productId: c.id,
        handle: p.handle,
        title: c.name,
        images: p.images.map((i) => ({ src: i.src, width: i.width, height: i.height, alt: i.alt ?? null })),
        variantId: v.id,
        price: v.price,
        wasPrice: v.compare_at_price !== null && v.compare_at_price > v.price ? v.compare_at_price : null,
        available: v.available,
        descriptionHtml: sanitizeDescription(p.body_html ?? ""),
      },
    ];
  });
}

/** Live products, or null when the store cannot be read (callers show the store link only). */
export async function storeProducts(): Promise<StoreProduct[] | null> {
  // C-mm-1: the local stack reads a saved feed, never the live store. Never in a production build.
  const local = process.env.NODE_ENV !== "production" ? process.env.STORE_LOCAL_FEED : undefined;
  if (local) return toStoreProducts(JSON.parse(await readFile(local, "utf8")));
  try {
    const res = await fetch(`${STORE_ORIGIN}/products.json`, { next: { revalidate: STORE_CACHE_SECONDS }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    return toStoreProducts(await res.json());
  } catch (err) {
    console.error("store products:", (err as Error)?.name ?? "unknown");
    return null;
  }
}

export async function storeProduct(productId: string): Promise<StoreProduct | null> {
  return (await storeProducts())?.find((p) => p.productId === productId) ?? null;
}
