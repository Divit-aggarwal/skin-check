"use client";

import { useEffect, useState } from "react";
import type { StoreProduct } from "@/lib/feature-contracts/store-products";

// TD-52: store price, stock and photos in the browser, from /api/store/products
// (never the description: that is screen 15's, read on the server). One request
// per page load, shared by every caller. undefined: loading; null: the store
// could not be read (callers keep the step icon and the plain store link).

export type StoreCard = Omit<StoreProduct, "descriptionHtml">;

let request: Promise<StoreCard[] | null> | null = null;
const load = () =>
  (request ??= fetch("/api/store/products")
    .then((r) => (r.ok ? (r.json() as Promise<{ products: StoreCard[] | null }>) : { products: null }))
    .then((b) => b.products)
    .catch(() => {
      request = null; // a later page may try again
      return null;
    }));

export function useStoreProducts(): StoreCard[] | null | undefined {
  const [products, setProducts] = useState<StoreCard[] | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    void load().then((p) => active && setProducts(p));
    return () => {
      active = false;
    };
  }, []);
  return products;
}
