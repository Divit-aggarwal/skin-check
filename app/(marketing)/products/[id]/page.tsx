import { notFound } from "next/navigation";
import { CATALOGUE, getProduct } from "@/lib/catalog/catalogue";
import { PRODUCTS_COPY as C } from "@/components/products/copy";
import { ProductDetail } from "@/components/products/ProductDetail";
import { storeProduct } from "@/lib/store/products";

// Screen 15: one own product from the static catalogue (step, pack size, when
// to use, key ingredient, how to use, cautions, stock), plus the store's live
// data read here on the server (TD-52, 10-minute cache): photos, price, the
// store action, and the store's own description (this page only). Store not
// read: the catalogue facts and the store link, as before. No other users'
// photos (D-12), no benefit list (the catalogue's claims whitelist is empty).

export const dynamicParams = false;
export const generateStaticParams = () => CATALOGUE.products.filter((p) => p.dataSource === "owner").map((p) => ({ id: p.id }));

const DESCRIPTION = "How to use this Project Skin product and where to find it on the store.";

export function generateMetadata({ params }: { params: { id: string } }) {
  const title = `${getProduct(params.id)?.name ?? C.details} — The Project SKIN`;
  // Its own description, so the root one (which links a routine to results) is not inherited (D-12).
  return { title, description: DESCRIPTION, openGraph: { title, description: DESCRIPTION } };
}

export default async function ProductRoute({ params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p || p.dataSource !== "owner") notFound();
  return <ProductDetail id={p.id} store={await storeProduct(p.id)} />;
}
