"use client";

import { useAuth } from "@/lib/auth-context";
import { PhoneAuthForm } from "@/components/auth/PhoneAuthForm";
import { btnSecondary } from "@/components/ui/page";

// The /account surface: signed-in state, or the same phone-auth form the
// Skin Check flow uses. All of the OTP mechanics live in PhoneAuthForm /
// usePhoneAuth so the two entry points can't drift apart.
export function PhoneOtpForm() {
  const { user, loading, signOut } = useAuth();
  if (loading) {
    return <div className="h-11 w-40 animate-pulse rounded-lg bg-brand-linen2" />;
  }

  if (user) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p>
          Signed in as <span className="font-semibold">{user.phoneNumber}</span>.
        </p>
        <button type="button" className={btnSecondary} onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return <PhoneAuthForm />;
}
