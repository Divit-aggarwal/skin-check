import type { Metadata } from "next";
import { Suspense } from "react";
import { EchoPage } from "@/components/skin-check/EchoPage";

export const metadata: Metadata = {
  title: "Echo — The Project SKIN",
  description: "Ask Echo about a specific area of your skin.",
};

// useSearchParams (reads ?region=) requires a Suspense boundary around the
// client component that calls it.
export default function EchoRoute() {
  return (
    <Suspense fallback={null}>
      <EchoPage />
    </Suspense>
  );
}
