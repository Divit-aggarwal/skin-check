import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useId } from "react";
import { btnSecondary, card, textLink } from "@/components/ui/page";
import { PriceBlock } from "@/components/ui/kit";
import { PRODUCTS_COPY as P } from "@/components/products/copy";
import { productHref } from "@/components/products/ProductTile";
import { ProductPhoto } from "@/components/products/ProductPhoto";
import { StoreAction } from "@/components/products/StoreAction";
import { useStoreProducts, type StoreCard } from "@/components/products/useStoreProducts";
import { PRODUCT_DOCTOR_LINE } from "@/lib/context/products";
import { cardsFor, OWN_PRODUCTS_LINE, STEP_LABEL } from "@/lib/context/products";
import { COPY } from "@/lib/rules/settings";
import { ECHO_COPY as E } from "./echoCopy";

// TD-34: the cards are drawn by our code from the catalogue, never from
// Gemini's words. Gemini's checked reason sits beside each card as "Echo's
// note". An id that is not on today's list draws nothing. TD-52: the store's
// photo, live price and one store action (StoreAction: Add to cart only with
// cartUi(), else View in store; out of stock disabled), read by our code from
// the store, never from Gemini. No store description here (screen 15 only).
// Store not read: the step tile and the plain store link, no price.
/**
 * The doctor line (TD-34 guard) as its own fixed panel above the cards, not
 * the last line of a bubble. The reply still carries it as text.
 */
export function splitDoctorLine(text: string): { text: string; doctorLine: boolean } {
  const tail = `\n${PRODUCT_DOCTOR_LINE}`;
  return text.endsWith(tail) ? { text: text.slice(0, -tail.length), doctorLine: true } : { text, doctorLine: false };
}

/** TD-45: the opening's dermatologist note (a questionnaire red flag), shown once as its own short panel. */
export function splitRedFlagNote(text: string): { text: string; note: boolean } {
  const head = `${COPY.referral}\n`;
  return text.startsWith(head) ? { text: text.slice(head.length), note: true } : { text, note: false };
}

export function ProductCards({ products, doctorLine = false, store }: { products: readonly { productId: string; reason?: string }[]; doctorLine?: boolean; store?: StoreCard[] | null }) {
  const headingId = useId();
  const live = useStoreProducts();
  const stock = store === undefined ? live : store;
  const shown = cardsFor(products);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex max-w-full flex-col gap-4 sm:max-w-[90%]">
      <h2 id={headingId} className="sr-only">
        {E.productsLabel}
      </h2>
      {doctorLine && <p className="rounded-card bg-brand-mist px-4 py-3 text-brand-ink">{PRODUCT_DOCTOR_LINE}</p>}
      <p className="text-sm font-medium text-brand-ink">{OWN_PRODUCTS_LINE}</p>
      {/* Screen 14's card: the store photo down the left, the step as a tag, the name, our facts, the live price. */}
      <ul className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        {shown.map((p) => {
          const sp = stock?.find((s) => s.productId === p.id);
          return (
            <li key={p.id} className={`${card} flex min-w-0 overflow-hidden p-0 sm:p-0`}>
              <div className="relative w-28 shrink-0 bg-brand-50 sm:w-36">
                {sp?.images[0] ? (
                  <ProductPhoto image={sp.images[0]} step={p.step} width={144} height={192} className="absolute inset-0 h-full w-full rounded-none" />
                ) : (
                  <ProductPhoto image={null} step={p.step} width={56} className="m-3" />
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 p-3 sm:p-4">
                <p className="self-start rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{STEP_LABEL[p.step]}</p>
                <h3 className="break-words text-base font-semibold leading-snug text-brand-text">{p.name}</h3>
                {sp && <PriceBlock price={sp.price} wasPrice={sp.wasPrice} available={sp.available} />}
                <dl className="space-y-1 text-sm text-brand-text-muted">
                  <div>
                    <dt className="inline font-semibold text-brand-text">{E.keyIngredient}: </dt>
                    <dd className="inline">{p.keyIngredient}</dd>
                  </div>
                  <div>
                    <dt className="inline font-semibold text-brand-text">{E.howToUse}: </dt>
                    <dd className="inline">{p.usage}</dd>
                  </div>
                </dl>
                {p.reason && (
                  <p className="rounded-tile bg-brand-50 px-3 py-2 text-sm text-brand-text">
                    <span className="font-semibold">{E.echoNote}: </span>
                    {p.reason}
                  </p>
                )}
                {sp && <StoreAction store={sp} name={p.name} className={`${btnSecondary} min-h-11 self-start px-4 text-sm`} />}
                <div className="flex flex-wrap gap-x-4">
                  <Link href={productHref(p.id)} aria-label={P.detailsLabel(p.name)} className={textLink}>
                    {P.details}
                    <ChevronRight aria-hidden size={16} />
                  </Link>
                  {!sp && (
                    <a href={p.url} target="_blank" rel="noopener noreferrer" className={textLink}>
                      {E.onStore}
                      <span className="sr-only"> {E.opensNewTab}</span>
                      <ExternalLink aria-hidden size={16} />
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
