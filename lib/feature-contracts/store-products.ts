// TD-52: the store's live product data, read on the server from
// https://theprojectskin.com/products.json and cached 10 minutes
// (lib/store/products.ts). Lane C draws 06, 14, 15, 16.

export const STORE_ORIGIN = "https://theprojectskin.com";
export const STORE_CACHE_SECONDS = 600;

export interface StoreImage {
  src: string;
  width: number;
  height: number;
  alt: string | null;
}

export interface StoreProduct {
  /** Catalogue id (lib/catalog) this store product maps to. */
  productId: string;
  handle: string;
  title: string;
  images: StoreImage[];
  variantId: number;
  /** Rupees, as a number (the store sends strings). */
  price: number;
  /** Shown struck through only when higher than price (TD-52 (3)); otherwise null. */
  wasPrice: number | null;
  available: boolean;
  /** Sanitised body_html: <p>, <ul>, <ol>, <li>, <strong>, <em>, <br> only. Screen 15 only (TD-52 (4)). */
  descriptionHtml: string;
}

/** Add to Cart target (TD-52 (2)); used only when cartUi() is on. */
export const cartUrl = (variantId: number) => `${STORE_ORIGIN}/cart/${variantId}:1`;
export const productUrl = (handle: string) => `${STORE_ORIGIN}/products/${handle}`;
