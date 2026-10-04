import { Suspense } from "react";
import { DashboardPage } from "@/components/dashboard/DashboardPage";

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
    <Suspense fallback={null}>
      <DashboardPage />
    </Suspense>
  );
}
