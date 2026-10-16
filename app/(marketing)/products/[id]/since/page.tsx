import { notFound } from "next/navigation";
import { CATALOGUE, getProduct } from "@/lib/catalog/catalogue";
import { PRODUCTS_COPY as C } from "@/components/products/copy";
import { SinceStarted } from "@/components/products/SinceStarted";

// Screen 16 (TD-53): the signed-in user's own checks since they started one
// product. Read in the browser (the user's own routine and checks); nothing
// here is prerendered with user data. Unknown id: 404, as screen 15.

export const dynamicParams = false;
export const generateStaticParams = () => CATALOGUE.products.filter((p) => p.dataSource === "owner").map((p) => ({ id: p.id }));

const DESCRIPTION = "Your own readings and photos from the checks you took after you started a product.";

export function generateMetadata({ params }: { params: { id: string } }) {
  const title = `${C.sinceTitle(getProduct(params.id)?.name ?? C.details)} — The Project SKIN`;
  return { title, description: DESCRIPTION, openGraph: { title, description: DESCRIPTION } };
}

export default function SinceRoute({ params }: { params: { id: string } }) {
  const p = getProduct(params.id);
  if (!p || p.dataSource !== "owner") notFound();
  return <SinceStarted id={p.id} />;
}
