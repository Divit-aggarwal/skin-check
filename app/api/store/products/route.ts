import { NextResponse, type NextRequest } from "next/server";
import { checkRequestRate, consumeDailyQuota, type PublicRouteLimits } from "@/lib/rate-limit";
import { storeProducts } from "@/lib/store/products";
import type { StoreCard } from "@/components/products/useStoreProducts";

// TD-52: the store's live price, stock and photos for the browser screens
// (06, 14, 16). Public store data; storeProducts() holds the store's answer
// 10 minutes in Next's fetch cache, so a request here does not reach the store.
// The store's description is dropped here: it shows on screen 15 only, which
// reads it on the server (data rule 5), so it never reaches Echo's page.
// Per-IP limits read the request, so the route itself runs on every request
// (dynamic); the fetch cache above still applies.
export const dynamic = "force-dynamic";
const LIMITS: PublicRouteLimits = { scope: "store-products", perMinute: 60, perDay: 2000 };

export async function GET(request: NextRequest) {
  // Each request counts against the day too: there is no bad-body case to spare.
  const limited = checkRequestRate(request, LIMITS) ?? consumeDailyQuota(request, LIMITS);
  if (limited) return limited;
  const products: StoreCard[] | null =
    (await storeProducts())?.map((p) => ({ productId: p.productId, handle: p.handle, title: p.title, images: p.images, variantId: p.variantId, price: p.price, wasPrice: p.wasPrice, available: p.available })) ?? null;
  return NextResponse.json({ products });
}
