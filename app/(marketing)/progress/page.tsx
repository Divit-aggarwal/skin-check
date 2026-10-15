import { Suspense } from "react";
import { ProgressView } from "@/components/progress/ProgressView";
import { LoadingState, page } from "@/components/ui/page";

export const metadata = { title: "Progress — The Project SKIN" };

// Screen 12 (G37). useSearchParams (?view=, ?window=) needs a Suspense boundary.
export default function ProgressRoute() {
  return (
    <Suspense
      fallback={
        <main className={page}>
          <div className="pt-12">
            <LoadingState label="Loading your checks…" blocks={["h-32", "h-48", "h-56"]} />
          </div>
        </main>
      }
    >
      <ProgressView />
    </Suspense>
  );
}
