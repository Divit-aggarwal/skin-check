"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { PhoneOtpForm } from "@/components/auth/PhoneOtpForm";
import { ConsentSection } from "@/components/dashboard/ConsentSection";
import { DashboardLink } from "@/components/dashboard/DashboardLink";
import { card, h2, LoadingState, PageHeader } from "@/components/ui/page";
import { DeleteAccount } from "./DeleteAccount";
import { ACCOUNT_COPY as A } from "./copy";

// G03 3.7. Signed out: sign in (then Home, TD-24 (3)). Signed in: the sign-in,
// consent status and withdrawal (H14), and account deletion (H01b). One
// history list only, on Checks (TD-25 (6)).
export function AccountView() {
  const { user, loading } = useAuth();
  const router = useRouter();
  // TD-24 (3): a sign-in made on this page goes to Home. A visitor who arrives
  // already signed in stays here. Kept here, not in the form, because the form
  // moves on screen when the user signs in.
  const wasSignedOut = useRef(false);
  useEffect(() => {
    if (user === null) wasSignedOut.current = true;
    else if (user && wasSignedOut.current) router.replace("/dashboard");
  }, [user, router]);

  return (
    <>
      <PageHeader title={A.title} intro={user ? A.signedInIntro : A.signedOutIntro} />
      {loading ? (
        <LoadingState label={A.title} blocks={["h-40"]} />
      ) : (
        // One DeleteAccount in a fixed place: after an erase the user is signed
        // out, and its "deleted" message must stay on screen.
        <div className="flex flex-col gap-6 lg:grid lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-6">
            {!user ? (
              <section className={card}>
                <PhoneOtpForm />
              </section>
            ) : (
              <>
                <section aria-labelledby="signed-in-title" className={`${card} flex flex-col gap-4`}>
                  <h2 id="signed-in-title" className={h2}>
                    {A.signedIn}
                  </h2>
                  <PhoneOtpForm />
                  {/* O-D3: the account page links to /dashboard. */}
                  <DashboardLink />
                </section>
                {/* H14: consent status and the AI-share withdrawal (also on Home). */}
                <ConsentSection />
              </>
            )}
          </div>
          <div id="delete-account">
            <DeleteAccount />
          </div>
        </div>
      )}
    </>
  );
}
