import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useId } from "react";
import { card, textLink } from "@/components/ui/page";
import { PRODUCTS_COPY as P } from "@/components/products/copy";
import { ProductTile, productHref } from "@/components/products/ProductTile";
import { PRODUCT_DOCTOR_LINE } from "@/lib/context/products";
import { cardsFor, OWN_PRODUCTS_LINE, STEP_LABEL } from "@/lib/context/products";
import { COPY } from "@/lib/rules/settings";
import { ECHO_COPY as E } from "./echoCopy";

// TD-34: the cards are drawn by our code from the catalogue, never from
// Gemini's words. Gemini's checked reason sits beside each card as "Echo's
// note". An id that is not on today's list draws nothing. No price, and no
// buy button: one plain link to the product page on the store, and one to
// our own product page (/products/[id], screen 15).
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

export function ProductCards({ products, doctorLine = false }: { products: readonly { productId: string; reason?: string }[]; doctorLine?: boolean }) {
  const headingId = useId();
  const shown = cardsFor(products);
  if (shown.length === 0) return null;

  return (
    <section aria-labelledby={headingId} className="flex max-w-full flex-col gap-4 sm:max-w-[90%]">
      <h2 id={headingId} className="sr-only">
        {E.productsLabel}
      </h2>
      {doctorLine && <p className="rounded-card bg-brand-mist px-4 py-3 text-brand-ink">{PRODUCT_DOCTOR_LINE}</p>}
      <p className="text-sm font-medium text-brand-ink">{OWN_PRODUCTS_LINE}</p>
      {/* Screen 14's card: a neutral step tile (no product photos, E20), the step as a tag, the name, our facts. */}
      <ul className="grid gap-3 sm:gap-4 xl:grid-cols-2">
        {shown.map((p) => (
          <li key={p.id} className={`${card} flex min-w-0 gap-3 sm:gap-4`}>
            <ProductTile step={p.step} />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="self-start rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{STEP_LABEL[p.step]}</p>
              <h3 className="break-words text-base font-semibold leading-snug text-brand-text">{p.name}</h3>
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
              <div className="flex flex-wrap gap-x-4">
                <Link href={productHref(p.id)} aria-label={P.detailsLabel(p.name)} className={textLink}>
                  {P.details}
                  <ChevronRight aria-hidden size={16} />
                </Link>
                <a href={p.url} target="_blank" rel="noopener noreferrer" className={textLink}>
                  {E.onStore}
                  <span className="sr-only"> {E.opensNewTab}</span>
                  <ExternalLink aria-hidden size={16} />
                </a>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
