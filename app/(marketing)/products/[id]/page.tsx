import { notFound } from "next/navigation";
import { ExternalLink } from "lucide-react";
import { CATALOGUE, getProduct } from "@/lib/catalog/catalogue";
import { OWN_PRODUCT_INFO, STEP_LABEL, STORE_URL } from "@/lib/context/products";
import { AppHeader } from "@/components/ui/kit";
import { btnPrimary, card, eyebrow, h2, page } from "@/components/ui/page";
import { PRODUCTS_COPY as C } from "@/components/products/copy";
import { ProductTile } from "@/components/products/ProductTile";

// Redesign screen 15: one own product, read from the static catalogue (no API,
// no user data). Shown: name, step, pack size, when to use, key ingredient,
// how to use, cautions, stock, and a link to the store page. Never the price
// (TD-34, TD-50 (g)), no cart, no other users' photos (D-12), no benefit list
// (the catalogue's claims whitelist is empty), no product photo (E20).
// OWN_PRODUCT_INFO.description awaits owner approval and is not shown.

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
  const info = OWN_PRODUCT_INFO[p.id];
  const keyIngredient = info?.keyIngredient ?? (p.active ? C.active(p.active.ingredient, p.active.concentrationPct) : null);
  const storeUrl = p.shopifyHandleVerified && p.shopifyHandle && p.availability !== "discontinued" ? `${STORE_URL}${p.shopifyHandle}` : null;
  const facts = [[C.packSize, p.price.packSize], [C.when, C.slot[p.slot]], ...(keyIngredient ? [[C.keyIngredient, keyIngredient]] : [])];

  return (
    <main className={page}>
      <AppHeader back backLabel={C.back} />
      <div className="mx-auto flex max-w-2xl flex-col gap-5 pt-2">
        <section className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {info && <p className={eyebrow}>{STEP_LABEL[info.step]}</p>}
            <h1 className="break-words text-[28px] font-semibold leading-tight text-brand-text sm:text-[32px]">{p.name}</h1>
            <p className="text-brand-text-muted">{C.ownLine}</p>
          </div>
          <ProductTile step={info?.step} size={96} />
        </section>

        {p.availability !== "available" && (
          <p role="status" className="rounded-card bg-brand-50 px-4 py-3 text-brand-text">
            {p.availability === "out_of_stock" ? C.outOfStock : C.discontinued}
          </p>
        )}

        <dl className={`${card} grid grid-cols-1 gap-3 sm:grid-cols-3`}>
          {facts.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-sm text-brand-text-muted">{label}</dt>
              <dd className="break-words font-semibold text-brand-text">{value}</dd>
            </div>
          ))}
        </dl>

        <section aria-labelledby="how-title" className={`${card} flex flex-col gap-2`}>
          <h2 id="how-title" className={h2}>
            {C.howToUse}
          </h2>
          <p className="text-brand-text">{p.usageText}</p>
        </section>

        {p.warnings.length > 0 && (
          <section aria-labelledby="cautions-title" className={`${card} flex flex-col gap-2`}>
            <h2 id="cautions-title" className={h2}>
              {C.cautions}
            </h2>
            <ul className="list-disc space-y-1 pl-5 text-brand-text">
              {p.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          </section>
        )}

        {storeUrl && (
          <a href={storeUrl} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full`}>
            {C.onStore}
            <span className="sr-only"> {C.opensNewTab}</span>
            <ExternalLink aria-hidden size={18} />
          </a>
        )}
      </div>
    </main>
  );
}
