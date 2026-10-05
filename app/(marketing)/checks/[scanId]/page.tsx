import { Suspense } from "react";
import { ChecksView } from "@/components/checks/ChecksView";
import { LoadingState, page } from "@/components/ui/page";

export const metadata = { title: "Check — The Project SKIN" };

// The id is only looked up among the signed-in user's own checks (pastCheck).
export default function CheckRoute({ params }: { params: { scanId: string } }) {
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
      <ChecksView openId={decodeURIComponent(params.scanId)} />
    </Suspense>
  );
}
