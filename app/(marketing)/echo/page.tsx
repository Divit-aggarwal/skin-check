import type { Metadata } from "next";
import { Suspense } from "react";
import { EchoPage } from "@/components/skin-check/EchoPage";

export const metadata: Metadata = {
  title: "Echo — The Project SKIN",
  description: "Ask Echo about a specific area of your skin.",
};

// useSearchParams (reads ?region=) requires a Suspense boundary around the
// client component that calls it. Matches EchoPage's own shell (max-w-lg,
// bg-surface, same header height) instead of a blank frame — AUDIT.md S3-4 —
// so there's no flash-to-blank even though the boundary itself resolves
// almost immediately (no data fetch, just the sync useSearchParams read).
function EchoRouteFallback() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg animate-pulse flex-col bg-surface px-6 pb-6 pt-6">
      <div className="flex shrink-0 items-center gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-canvas" />
        <div className="h-4 w-12 rounded bg-canvas" />
      </div>
      <div className="mt-4 flex shrink-0 gap-4">
        <div className="h-5 w-16 rounded bg-canvas" />
        <div className="h-5 w-14 rounded bg-canvas" />
        <div className="h-5 w-12 rounded bg-canvas" />
      </div>
      <div className="mt-4 h-24 shrink-0 rounded-2xl bg-canvas" />
    </div>
  );
}

export default function EchoRoute() {
  return (
    <Suspense fallback={<EchoRouteFallback />}>
      <EchoPage />
    </Suspense>
  );
}
