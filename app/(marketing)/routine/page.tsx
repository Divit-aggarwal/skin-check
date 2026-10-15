import { RoutinePage } from "@/components/routine/RoutinePage";
import { page } from "@/components/ui/page";
import { AppHeader } from "@/components/ui/kit";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { storeProducts } from "@/lib/store/products";
import type { StoreImage } from "@/lib/feature-contracts/store-products";

// description and openGraph are set here so the root description, which links
// a routine to results, is not inherited (D-12, R-4 A).
export const metadata = {
  title: "Routine — The Project SKIN",
  description: C.purpose,
  openGraph: { title: "Routine — The Project SKIN", description: C.purpose },
};

// Reached from the main navigation, Home's routine card and the timeline.
// G37 (screen 03): each product's first store photo (TD-52, server side, 10-minute
// cache); none when the store cannot be read, and the step tile shows instead.
// Off unless NEXT_PUBLIC_UI_ROUTINE_PHOTOS is "on": flows.spec.ts asserts no <img> on /routine
// (kit request D-3, and D-4 to move this switch into lib/ui-flags.ts).
export default async function RoutineRoute() {
  const store = process.env.NEXT_PUBLIC_UI_ROUTINE_PHOTOS === "on" ? await storeProducts() : null;
  const photos: Record<string, StoreImage> = Object.fromEntries(store?.flatMap((p) => (p.images[0] ? [[p.productId, p.images[0]]] : [])) ?? []);
  return (
    <main className={page}>
      {/* Phones: the wordmark bar (redesign); the rail and side bar carry it from 640px. */}
      <div className="sm:hidden">
        <AppHeader back="/dashboard" backLabel="Back to Today" />
      </div>
      <RoutinePage photos={photos} />
    </main>
  );
}
