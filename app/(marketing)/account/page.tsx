import { Suspense } from "react";
import { LoadingState, page } from "@/components/ui/page";
import { AccountView } from "./AccountView";
import { ACCOUNT_COPY as A } from "./copy";

export const metadata = {
  title: "Account — The Project SKIN",
};

// Redesign 20–22: the section is in ?tab=, read in the browser (useSearchParams
// needs this Suspense boundary to keep the page static).
export default function AccountPage() {
  return (
    <main className={page}>
      <Suspense fallback={<LoadingState label={A.title} blocks={["h-40"]} />}>
        <AccountView />
      </Suspense>
    </main>
  );
}
