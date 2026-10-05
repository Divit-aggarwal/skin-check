import { Suspense } from "react";
import { ChecksView } from "@/components/checks/ChecksView";

export const metadata = { title: "Checks — The Project SKIN" };

// useSearchParams (?view=timeline) needs a Suspense boundary.
export default function ChecksRoute() {
  return (
    <Suspense>
      <ChecksView openId={null} />
    </Suspense>
  );
}
