import { NextResponse } from "next/server";
import { storeProducts } from "@/lib/store/products";
import type { StoreCard } from "@/components/products/useStoreProducts";

// TD-52: the store's live price, stock and photos for the browser screens
// (06, 14, 16). Public store data, cached 10 minutes like storeProducts().
// The store's description is dropped here: it shows on screen 15 only, which
// reads it on the server (data rule 5), so it never reaches Echo's page.
export const revalidate = 600;

export async function GET() {
  const products: StoreCard[] | null =
    (await storeProducts())?.map((p) => ({ productId: p.productId, handle: p.handle, title: p.title, images: p.images, variantId: p.variantId, price: p.price, wasPrice: p.wasPrice, available: p.available })) ?? null;
  return NextResponse.json({ products });
}
