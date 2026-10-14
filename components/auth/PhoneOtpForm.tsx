"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { PhoneAuthForm } from "@/components/auth/PhoneAuthForm";
import { btnSecondary } from "@/components/ui/page";
import { forgetHomeDevice } from "@/components/dashboard/homeSettings";

// The /account surface: signed-in state, or the same phone-auth form the
// Skin Check flow uses. All of the OTP mechanics live in PhoneAuthForm /
// usePhoneAuth so the two entry points can't drift apart.
export function PhoneOtpForm() {
  const { user, loading, signOut } = useAuth();
  const [leaving, setLeaving] = useState(false);
  if (loading) {
    return <div className="h-11 w-40 animate-pulse rounded-lg bg-brand-linen2" />;
  }

  if (user) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>
          {/* H38: the last 4 digits only, as on the check flow (G23). */}
          Signed in as phone ending <span className="font-semibold">{user.phoneNumber?.slice(-4)}</span>.
        </p>
        <button type="button" className={btnSecondary} aria-disabled={leaving} onClick={async () => {
            if (leaving) return;
            setLeaving(true);
            // TD-47: this device's weather and reminder subscription go with the sign-out (shared phones).
            await forgetHomeDevice(user).catch(() => undefined);
            await signOut().finally(() => setLeaving(false));
          }}>
          Sign out
        </button>
      </div>
    );
  }

  return <PhoneAuthForm />;
}
