import { notFound } from "next/navigation";
import { CATALOGUE, getProduct } from "@/lib/catalog/catalogue";
import { PRODUCTS_COPY as C } from "@/components/products/copy";
import { ProductDetail } from "@/components/products/ProductDetail";

// Redesign screen 15: one own product, read from the static catalogue (no API,
// no user data). Shown: name, step, pack size, when to use, key ingredient,
// how to use, cautions, stock, and a link to the store page. Never the price
// (TD-34, TD-50 (g)), no cart, no other users' photos (D-12), no benefit list
// (the catalogue's claims whitelist is empty), no product photo (E20).
// The page body is components/products/ProductDetail.tsx (a client module, as
// the shared class strings in components/ui/page.tsx are).

export const dynamicParams = false;
export const generateStaticParams = () => CATALOGUE.products.filter((p) => p.dataSource === "owner").map((p) => ({ id: p.id }));

const DESCRIPTION = "How to use this Project Skin product and where to find it on the store.";

export function generateMetadata({ params }: { params: { id: string } }) {
  const title = `${getProduct(params.id)?.name ?? C.details} — The Project SKIN`;
  // Its own description, so the root one (which links a routine to results) is not inherited (D-12).
  return { title, description: DESCRIPTION, openGraph: { title, description: DESCRIPTION } };
}

export default function ProductRoute({ params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p || p.dataSource !== "owner") notFound();
  return <ProductDetail id={p.id} />;
}
