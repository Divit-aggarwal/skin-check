"use client";

import { useRef } from "react";
import type { User } from "firebase/auth";
import type { PhoneStep, SkinCheckAnswers } from "@/types/skin-check";
import { PhoneAuthForm } from "@/components/auth/PhoneAuthForm";
import { saveSkinCheck } from "@/lib/firebase/skin-checks";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";

interface PhoneAuthStepProps {
  step: PhoneStep;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  answers: SkinCheckAnswers;
}

// The questionnaire's final step is a real authentication boundary. Nothing
// is written to `answers.final_phone` until Firebase has verified the code,
// so the section stays incomplete — and the flow stays on this step —
// through the entire phone/OTP interaction. That's what keeps the existing
// state machine untouched: it still just sees "this step got a valid answer,
// commit it," exactly like every other step.
export function PhoneAuthStep({ step, value, onChange, onCommit, answers }: PhoneAuthStepProps) {
  const { user, loading } = useAuth();
  // The "Get my results" button below is a plain click target, and
  // saveSkinCheck is a create — two taps would write two questionnaire
  // records. Commit exactly once per mount.
  const committed = useRef(false);

  function handleAuthenticated(user: User) {
    if (committed.current) return;
    committed.current = true;
    // Firebase's verified number is the authoritative one — the typed value
    // is never promoted to an answer, so there is only ever one phone
    // identity for this session.
    const verified = user.phoneNumber ?? "";
    onChange(verified);
    onCommit();
    // Non-fatal by design: the user has authenticated and their results are
    // already computed client-side, so a failed write must not block them.
    void saveSkinCheck(user.uid, { ...answers, [step.id]: verified }).catch((error) => {
      console.error("[skin-check] session association failed", error);
    });
  }

  if (value) {
    return (
      <p className="text-body text-text/70">
        Verified <span className="whitespace-nowrap text-text">{value}</span>.
      </p>
    );
  }

  if (loading) {
    return <div className="h-11 w-40 animate-pulse rounded-lg bg-canvas" />;
  }

  // Firebase, not this component, is the source of truth for who is signed
  // in — a returning user with a live session shouldn't be made to burn an
  // SMS to prove the same number again. Still an explicit tap rather than an
  // auto-commit, so finishing the questionnaire stays the user's action.
  if (user?.phoneNumber) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text/70">
          You&rsquo;re signed in as <span className="whitespace-nowrap text-text">{user.phoneNumber}</span>.
        </p>
        <Button
          variant="ink"
          size="sm"
          onClick={() => handleAuthenticated(user)}
          className="w-fit"
        >
          Get my results
        </Button>
      </div>
    );
  }

  // The questionnaire's own copy is kept verbatim; the SMS-verification
  // disclosure Firebase asks for is appended rather than replacing it.
  const note = `${step.note} We'll send a verification code by SMS to confirm it — standard messaging rates may apply.`;

  return <PhoneAuthForm onAuthenticated={handleAuthenticated} note={note} sendLabel="Send verification code" />;
}
