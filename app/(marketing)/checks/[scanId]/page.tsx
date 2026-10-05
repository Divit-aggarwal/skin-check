import { Suspense } from "react";
import { ChecksView } from "@/components/checks/ChecksView";

export const metadata = { title: "Check — The Project SKIN" };

// The id is only looked up among the signed-in user's own checks (pastCheck).
export default function CheckRoute({ params }: { params: { scanId: string } }) {
  return (
    <Suspense>
      <ChecksView openId={decodeURIComponent(params.scanId)} />
    </Suspense>
  );
}
