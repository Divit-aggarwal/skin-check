import type { Metadata } from "next";
import { Suspense } from "react";
import { EchoPage } from "@/components/skin-check/EchoPage";
import { LoadingState, page } from "@/components/ui/page";

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
      <EchoPage />
    </Suspense>
  );
}
