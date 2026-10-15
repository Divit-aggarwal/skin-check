"use client";

import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { getProduct } from "@/lib/catalog/catalogue";
import { OWN_PRODUCT_INFO, STEP_LABEL, STORE_URL } from "@/lib/context/products";
import type { StoreProduct } from "@/lib/feature-contracts/store-products";
import { useRoutine } from "@/components/routine/useRoutine";
import { AppHeader, PriceBlock } from "@/components/ui/kit";
import { btnPrimary, card, eyebrow, h2, page, textLink } from "@/components/ui/page";
import { PRODUCTS_COPY as C } from "./copy";
import { ProductPhoto } from "./ProductPhoto";
import { StoreAction } from "./StoreAction";
import { sinceHref } from "./ProductTile";

// Screen 15 body (route: app/(marketing)/products/[id]/page.tsx). Catalogue
// facts as before (step, pack size, when, key ingredient, how to use,
// cautions), plus the store's live data when it could be read (TD-52): photo
// gallery, price, one store action, and the store's own description under
// "From the store" (sanitised on the server; the only screen that shows it).
// No benefit list or claim tags (the claims whitelist is empty), no other
// users' photos (data rule 2). OWN_PRODUCT_INFO.description stays unshown.

export function ProductDetail({ id, store }: { id: string; store: StoreProduct | null }) {
  const p = getProduct(id);
  if (!p) return null;
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
          {!store?.images[0] && <ProductPhoto image={null} step={info?.step} width={96} />}
        </section>

        {store && store.images.length > 0 && (
          // A row of the store's photos, swiped sideways; the page itself never scrolls sideways.
          <section aria-label={C.gallery(p.name)} className="-mx-4 sm:mx-0">
            <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:px-0">
              {store.images.map((img, i) => (
                <li key={img.src} className="w-[78%] shrink-0 snap-start sm:w-[48%]">
                  <ProductPhoto image={img} step={info?.step} width={480} height={480} alt={C.photoAlt(p.name, i + 1)} priority={i === 0} className="aspect-square h-auto w-full rounded-card" />
                </li>
              ))}
            </ul>
          </section>
        )}

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

        {store?.descriptionHtml && (
          <section aria-labelledby="store-title" className={`${card} flex flex-col gap-2`}>
            <h2 id="store-title" className={h2}>
              {C.fromStore}
            </h2>
            <p className="text-sm text-brand-text-muted">{C.fromStoreNote}</p>
            {/* Sanitised on the server (lib/store/products.ts): p, ul, ol, li, strong, em, br, no attributes. */}
            <div className="flex flex-col gap-2 text-brand-text [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5" dangerouslySetInnerHTML={{ __html: store.descriptionHtml }} />
          </section>
        )}

        <SinceLink id={p.id} name={p.name} />

        {store ? (
          // The price and the one store action, kept in view above the phone's bottom bar (the mockup's price bar).
          <div className={`${card} sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 sm:static`}>
            <div className="flex items-center justify-between gap-4">
              <PriceBlock price={store.price} wasPrice={store.wasPrice} available={store.available} className="min-w-0 flex-wrap [&>span:first-child]:text-2xl" />
              <StoreAction store={store} name={p.name} className={`${btnPrimary} shrink-0`} />
            </div>
          </div>
        ) : (
          storeUrl && (
            <a href={storeUrl} target="_blank" rel="noopener noreferrer" className={`${btnPrimary} w-full`}>
              {C.onStore}
              <span className="sr-only"> {C.opensNewTab}</span>
              <ExternalLink aria-hidden size={18} />
            </a>
          )
        )}
      </div>
    </main>
  );
}

/** Screen 16's link, only when this product is in the signed-in user's routine. */
function SinceLink({ id, name }: { id: string; name: string }) {
  const { data } = useRoutine();
  if (!data?.routine.some((r) => r.productId === id)) return null;
  return (
    <Link href={sinceHref(id)} className={`${card} ${textLink} justify-between`}>
      {C.sinceTitle(name)}
      <ChevronRight aria-hidden size={18} />
    </Link>
  );
}
