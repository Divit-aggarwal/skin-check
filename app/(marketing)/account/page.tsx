import { Suspense } from "react";
import { LoadingState, page } from "@/components/ui/page";
import { storeProducts } from "@/lib/store/products";
import { notificationTypesUi } from "@/lib/ui-flags";
import { AccountView } from "./AccountView";
import type { ProductInfo } from "./NotificationsScreen";
import { ACCOUNT_COPY as A } from "./copy";

export const metadata = {
  title: "Account — The Project SKIN",
};

// Redesign 20–22: the section is in ?tab=, read in the browser (useSearchParams
// needs this Suspense boundary to keep the page static).
export default async function AccountPage() {
  // Mockup 20 (G31): store titles and photos for the product reminder rows, only with its flag on.
  const products: ProductInfo = notificationTypesUi()
    ? Object.fromEntries(((await storeProducts()) ?? []).map((p) => [p.productId, { title: p.title, image: p.images[0]?.src ?? null }]))
    : {};
  return (
    <main className={page}>
      <Suspense fallback={<LoadingState label={A.title} blocks={["h-40"]} />}>
        {/* Flag off: unchanged (tests/privacy-delete-account.test.ts pins this element). */}
        {notificationTypesUi() ? <AccountView products={products} /> : <AccountView />}
      </Suspense>
    </main>
  );
}
