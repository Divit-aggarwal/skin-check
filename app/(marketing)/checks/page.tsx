import { Suspense } from "react";
import { ChecksView } from "@/components/checks/ChecksView";
import { LoadingState, page } from "@/components/ui/page";

export const metadata = { title: "Checks — The Project SKIN" };

// useSearchParams (?view=timeline) needs a Suspense boundary.
export default function ChecksRoute() {
  return (
    <Suspense
      fallback={
        <main className={page}>
          <div className="pt-12">
            <LoadingState label="Loading your checks…" blocks={["h-20", "h-20", "h-20"]} />
          </div>
        </main>
      }
    >
      <ChecksView openId={null} />
    </Suspense>
  );
}
