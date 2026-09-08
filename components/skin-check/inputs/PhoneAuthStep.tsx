"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { PhoneStep, SkinCheckAnswers } from "@/types/skin-check";
import type { SkinScanState } from "@/types/skin-scan";
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
  /** Stable id for this scan attempt — becomes the Firestore document id. */
  scanId: string;
  scan: SkinScanState;
  /** Clears the local draft once the scan is safely persisted. */
  onSaved: () => void;
}

// This component now serves the flow's TWO phone steps, which are the same
// interaction with different consequences:
//
//   - `phone_verify` (section "verify", before image capture) — PHASE 1's
//     authentication boundary. Authenticates and nothing else. Nothing is
//     written to `answers.phone_verify` until Firebase has verified the code,
//     so the section stays incomplete — and the flow stays on this step, one
//     section short of the camera — through the entire phone/OTP interaction.
//   - `final_phone` (section "get-your-results", `savesScan: true`) — the
//     unchanged end of the questionnaire: an explicit tap that writes the
//     finished scan to Firestore.
//
// That keeps the existing state machine untouched: it still just sees "this
// step got a valid answer, commit it," exactly like every other step.
export function PhoneAuthStep({
  step,
  value,
  onChange,
  onCommit,
  answers,
  scanId,
  scan,
  onSaved,
}: PhoneAuthStepProps) {
  const { user, loading } = useAuth();
  // First of two guards against a double-tap on "Get my results". This one
  // is per-mount and only stops the cheap case; the real guarantee is that
  // saveSkinCheck writes to a document keyed by `scanId`, so a second write
  // — from a remount, a retry, or a second tab — addresses the SAME document
  // and is refused server-side by firestore.rules (`update: if false`).
  const committed = useRef(false);
  // onAuthStateChanged is what feeds `user`, and it lands a tick or two after
  // confirm() resolves. Without holding the verified user locally, the render
  // between "we authenticated" and "the context caught up" would fall back to
  // a blank PhoneAuthForm — a visible flash on the one screen where it would
  // read as "your code didn't work".
  const [justAuthed, setJustAuthed] = useState<User | null>(null);
  const activeUser = user ?? justAuthed;

  function handleAuthenticated(user: User) {
    if (committed.current) return;
    committed.current = true;
    setJustAuthed(user);
    // Firebase's verified number is the authoritative one — the typed value
    // is never promoted to an answer, so there is only ever one phone
    // identity for this session.
    const verified = user.phoneNumber ?? "";
    onChange(verified);
    onCommit();
    if (!step.savesScan) return;
    // Non-fatal by design: the user has authenticated and their results are
    // already computed client-side, so a failed write must not block them.
    void saveSkinCheck(user.uid, scanId, { ...answers, [step.id]: verified }, scan)
      // The draft has served its purpose once the scan belongs to a real
      // uid. Cleared only on success, so a failed write leaves the user's
      // answers recoverable rather than silently dropping them.
      .then(onSaved)
      .catch((error) => {
        console.error("[skin-check] session association failed", error);
      });
  }

  // A returning user whose Firebase session was restored must not be made to
  // burn a second SMS proving the same number. For the pre-capture verify
  // step that means passing straight through — no screen, no tap — since
  // there is nothing here for them to confirm. `savesScan` steps are excluded
  // deliberately: submitting the finished scan stays an explicit action.
  //
  // `!value` is what makes this fire once. Note the answer is deliberately
  // NOT persisted to the draft (lib/skin-check-draft.ts), so "already
  // verified" is only ever asserted by Firebase, never by localStorage.
  useEffect(() => {
    if (step.savesScan || value || committed.current) return;
    if (!user?.phoneNumber) return;
    handleAuthenticated(user);
    // handleAuthenticated closes over props that are stable per render; the
    // committed ref makes a re-run a no-op regardless.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, value, step.savesScan]);

  // undefined = Firebase hasn't reported yet. Rendering the phone form here
  // would show a signed-in user an OTP screen for the split second before
  // restoration lands, so hold the frame instead (failure case 6).
  if (loading) {
    return <div className="h-11 w-40 animate-pulse rounded-lg bg-canvas" />;
  }

  if (value) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text/70">
          Verified <span className="whitespace-nowrap text-text">{value}</span>.
        </p>
        {/* The flow has no Continue button — forward motion comes only from
            `advanceSignal`, which `commitStep` ticks. Every other section is
            escapable by re-tapping an option; this one would be a dead end
            without this, since tapping back from the camera lands here with
            the answer already filled in and nothing tappable on screen.
            Excluded on the `savesScan` step, whose own already-signed-in
            branch below is the deliberate submit action. */}
        {!step.savesScan && (
          <Button variant="ink" size="sm" onClick={onCommit} className="w-fit">
            Continue
          </Button>
        )}
      </div>
    );
  }

  // Firebase, not this component, is the source of truth for who is signed
  // in. On the final step that's still an explicit tap rather than an
  // auto-commit, so finishing the questionnaire stays the user's action.
  if (activeUser?.phoneNumber) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text/70">
          You&rsquo;re signed in as <span className="whitespace-nowrap text-text">{activeUser.phoneNumber}</span>.
        </p>
        <Button
          variant="ink"
          size="sm"
          onClick={() => handleAuthenticated(activeUser)}
          className="w-fit"
        >
          {step.savesScan ? "Get my results" : "Continue"}
        </Button>
      </div>
    );
  }

  // The questionnaire's own copy is kept verbatim; the SMS-verification
  // disclosure Firebase asks for is appended rather than replacing it.
  const note = `${step.note} We'll send a verification code by SMS to confirm it — standard messaging rates may apply.`;

  return <PhoneAuthForm onAuthenticated={handleAuthenticated} note={note} sendLabel="Send verification code" />;
}
