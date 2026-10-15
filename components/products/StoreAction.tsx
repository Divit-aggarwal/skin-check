import { ExternalLink, ShoppingCart } from "lucide-react";
import { cartUrl, productUrl } from "@/lib/feature-contracts/store-products";
import { cartUi } from "@/lib/ui-flags";
import { PRODUCTS_COPY as C } from "./copy";
import type { StoreCard } from "./useStoreProducts";

// TD-52 (2): the one store action on 14 and 15. Out of stock: a disabled
// button. In stock: Add to cart (the store's cart link) only with cartUi() on,
// otherwise View in store. Both open the store in a new tab.
export function StoreAction({ store, name, className }: { store: StoreCard; name: string; className: string }) {
  if (!store.available)
    return (
      <button type="button" disabled className={className}>
        {C.soldOut}
      </button>
    );
  const cart = cartUi();
  return (
    <a
      href={cart ? cartUrl(store.variantId) : productUrl(store.handle)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${cart ? C.addToCartLabel(name) : C.viewInStoreLabel(name)} ${C.opensNewTab}`}
      className={className}
    >
      {cart && <ShoppingCart aria-hidden size={18} />}
      {cart ? C.addToCart : C.viewInStore}
      {!cart && <ExternalLink aria-hidden size={16} />}
    </a>
  );
}
