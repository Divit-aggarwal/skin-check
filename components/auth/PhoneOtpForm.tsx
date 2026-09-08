"use client";

import { useAuth } from "@/lib/auth-context";
import { PhoneAuthForm } from "@/components/auth/PhoneAuthForm";
import { Button } from "@/components/ui/button";

// The /account surface: signed-in state, or the same phone-auth form the
// Skin Check flow uses. All of the OTP mechanics live in PhoneAuthForm /
// usePhoneAuth so the two entry points can't drift apart.
export function PhoneOtpForm() {
  const { user, loading, signOut } = useAuth();

  if (loading) {
    return <div className="h-11 w-40 animate-pulse rounded-lg bg-canvas" />;
  }

  if (user) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text/70">
          Signed in as <span className="text-text">{user.phoneNumber}</span>.
        </p>
        <Button variant="outline" size="sm" onClick={() => void signOut()} className="w-fit">
          Sign out
        </Button>
      </div>
    );
  }

  return <PhoneAuthForm />;
}
