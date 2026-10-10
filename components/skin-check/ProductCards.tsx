import { ExternalLink } from "lucide-react";
import { eyebrow } from "@/components/ui/page";
import { listedProduct, OWN_PRODUCTS_LINE, STEP_LABEL, STEP_ORDER } from "@/lib/context/products";
import { ECHO_COPY as E } from "./echoCopy";

// TD-34: the cards are drawn by our code from the catalogue, never from
// Gemini's words. Gemini's checked reason sits beside each card as "Echo's
// note". An id that is not on today's list draws nothing. No price, and no
// buy button: one plain link to the product page on the store.
export function ProductCards({ products }: { products: readonly { productId: string; reason?: string }[] }) {
  const shown = products
    .flatMap((p) => {
      const item = listedProduct(p.productId);
      return item ? [{ ...item, reason: p.reason }] : [];
    })
    .sort((a, b) => STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step));
  if (shown.length === 0) return null;

  return (
    <section aria-label={E.productsLabel} className="flex max-w-[90%] flex-col gap-3">
      <p className="text-sm font-medium text-brand-ink">{OWN_PRODUCTS_LINE}</p>
      <ul className="grid gap-3 xl:grid-cols-2">
        {shown.map((p) => (
          <li key={p.id} className="flex flex-col gap-2 rounded-2xl border border-brand-card-line bg-brand-paper p-4">
            <p className={eyebrow}>{STEP_LABEL[p.step]}</p>
            <h3 className="font-display text-base font-semibold leading-snug text-brand-title">{p.name}</h3>
            <dl className="space-y-1 text-sm text-brand-ink">
              <div>
                <dt className="inline font-semibold">{E.keyIngredient}: </dt>
                <dd className="inline">{p.keyIngredient}</dd>
              </div>
              <div>
                <dt className="inline font-semibold">{E.howToUse}: </dt>
                <dd className="inline">{p.usage}</dd>
              </div>
            </dl>
            {p.reason && (
              <p className="rounded-xl bg-brand-mist px-3 py-2 text-sm text-brand-ink">
                <span className="font-semibold">{E.echoNote}: </span>
                {p.reason}
              </p>
            )}
            <a
              href={p.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center gap-1 self-start font-medium text-brand-forest underline-offset-4 hover:underline"
            >
              {E.onStore}
              <span className="sr-only"> {E.opensNewTab}</span>
              <ExternalLink aria-hidden size={16} />
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
