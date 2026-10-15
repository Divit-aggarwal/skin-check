import type { Metadata } from "next";
import { Suspense } from "react";
import { EchoWithConsent } from "@/components/products/PersonalisedProducts";
import { LoadingState, page } from "@/components/ui/page";
import { echoOn } from "@/lib/context/switch";
import { echoProductsOn } from "@/lib/context/products";

export const metadata: Metadata = {
  title: "Echo — The Project SKIN",
  description: "Ask Echo about a specific area of your skin.",
};

// useSearchParams (reads ?region=) requires a Suspense boundary around the
// client component that calls it; the fallback is the designed loading state.
export default function EchoRoute() {
  return (
    <Suspense
      fallback={
        <main className={page}>
          <div className="pt-12">
            <LoadingState label="Loading Echo…" blocks={["h-24", "h-64"]} />
          </div>
        </main>
      }
    >
      {/* H36: also off when the user withdrew personalisation (PersonalisedProducts). Read at build time: a Vercel setting change takes effect with the next deployment (TD-29 (5)). */}
      <EchoWithConsent echoOn={echoOn()} productsOn={echoProductsOn()} />
    </Suspense>
  );
}
