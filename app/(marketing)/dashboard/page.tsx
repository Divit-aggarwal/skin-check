import { Suspense } from "react";
import { DashboardWithConsent } from "@/components/products/PersonalisedProducts";
import { LoadingState, page } from "@/components/ui/page";
import { echoProductsOn } from "@/lib/echo-limits";

// description and openGraph are set here so the root description is not
// inherited (D-12; same reason as /routine).
export const metadata = {
  title: "Your skin checks — The Project SKIN",
  description: "Your own skin checks, one at a time.",
  openGraph: { title: "Your skin checks — The Project SKIN", description: "Your own skin checks, one at a time." },
};

// useSearchParams (?check=) needs a Suspense boundary.
export default function DashboardRoute() {
  return (
    <Suspense
      fallback={
        <main className={page}>
          <div className="pt-12">
            <LoadingState label="Loading your checks…" blocks={["h-96", "h-40"]} />
          </div>
        </main>
      }
    >
      {/* H36: also off when the user withdrew personalisation (PersonalisedProducts). Read at build time, like /echo: the starter questions hide product questions while suggestions are off. */}
      <DashboardWithConsent productsOn={echoProductsOn()} />
    </Suspense>
  );
}
