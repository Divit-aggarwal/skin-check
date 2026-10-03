"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import type { PhoneStep, SkinCheckAnswers } from "@/types/skin-check";
import type { SkinScanState } from "@/types/skin-scan";
import { PhoneAuthForm } from "@/components/auth/PhoneAuthForm";
import { saveSkinCheck } from "@/lib/firebase/skin-checks";
import { useAuth } from "@/lib/auth-context";
import { canSaveScan, completeSave, withTimeout } from "@/lib/useSkinCheckFlow";
import { Button } from "@/components/ui/button";
import { AGE_ATTESTATION_VERSION } from "@/lib/consent";
import { PHONE_VERIFIED } from "@/lib/skin-check-validation";

const SAVE_TIMEOUT_MS = 15_000;

interface PhoneAuthStepProps {
  step: PhoneStep;
  value: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  answers: SkinCheckAnswers;
  /** Stable id for this scan attempt — becomes the Firestore document id. */
  scanId: string;
  scan: SkinScanState;
  /**
   * Clears the local draft once the scan is safely persisted. False when the
   * flow has since moved to another scan (a retake mid-save).
   */
  onSaved: (forScanId: string) => boolean;
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
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  function handleAuthenticated(user: User) {
    if (committed.current) return;
    setJustAuthed(user);
    // Checked here as well as on the button: the signed-out PhoneAuthForm
    // path calls this directly.
    if (step.savesScan && !canSaveScan(scan, answers)) return;
    committed.current = true;
    // D-19: the answer is a marker, never the number. Firebase's verified
    // number stays in Firebase Auth and users/{uid}.phoneNumber, so the
    // phone is not copied into every questionnaire.
    const verified = PHONE_VERIFIED;
    if (!step.savesScan) {
      // H02a (D-19): the server keeps its own record of the age answer, now
      // that there is a verified uid to attach it to. Best-effort: the scan
      // never waits on it (D-03a), and chat refuses until it has landed.
      void postAgeAttestation(user, answers.age);
      onChange(verified);
      onCommit();
      return;
    }
    // The results only open once the write lands. Advancing first would
    // leave a failed save with no retry (this step unmounts) and let "Take
    // a new scan" clear the only copy of an unsaved scan. A retry is safe:
    // a write that already landed comes back as permission-denied, which
    // saveSkinCheck treats as saved once it confirms the doc exists.
    // Offline, setDoc stays pending instead of rejecting, so the wait is
    // capped; a write that lands after the timeout is covered by the same
    // permission-denied rule on retry.
    setSaving(true);
    setSaveFailed(false);
    withTimeout(saveSkinCheck(user.uid, scanId, { ...answers, [step.id]: verified }, scan), SAVE_TIMEOUT_MS)
      .then(() => {
        // The draft has served its purpose once the scan belongs to a real
        // uid. Cleared only on success, so a failed write leaves the user's
        // answers recoverable rather than silently dropping them. A stale
        // save (retake while it was in flight) leaves the new scan alone.
        completeSave(onSaved, scanId, () => {
          onChange(verified);
          onCommit();
        });
      })
      .catch((error) => {
        console.error("[skin-check] session association failed", error);
        committed.current = false;
        setSaveFailed(true);
      })
      .finally(() => setSaving(false));
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
          Verified{activeUser?.phoneNumber ? <> <span className="whitespace-nowrap text-text">{activeUser.phoneNumber}</span></> : null}.
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
    // Saving before the analysis has finished (or with no photo, e.g. after
    // a refresh mid-scan) would permanently record the scan without its
    // result. Reachable quickly when a reused questionnaire goes straight
    // from the photo to this step.
    const analyzing = Boolean(step.savesScan) && scan.status === "loading";
    const blocked = Boolean(step.savesScan) && !canSaveScan(scan, answers);
    return (
      <div className="flex flex-col gap-3">
        <p className="text-body text-text/70">
          You&rsquo;re signed in as <span className="whitespace-nowrap text-text">{activeUser.phoneNumber}</span>.
        </p>
        <Button
          variant="ink"
          size="sm"
          disabled={blocked || saving}
          onClick={() => handleAuthenticated(activeUser)}
          className="w-fit"
        >
          {analyzing
            ? "Analyzing your photo…"
            : saving
              ? "Saving…"
              : step.savesScan
                ? "Get my results"
                : "Continue"}
        </Button>
        {saveFailed && (
          <p className="text-sm text-text/70">We couldn&rsquo;t save your results. Check your connection and try again.</p>
        )}
      </div>
    );
  }

  // The questionnaire's own copy is kept verbatim; the SMS-verification
  // disclosure Firebase asks for is appended rather than replacing it.
  const note = `${step.note} We'll send a verification code by SMS to confirm it — standard messaging rates may apply.`;

  return <PhoneAuthForm onAuthenticated={handleAuthenticated} note={note} sendLabel="Send verification code" />;
}

async function postAgeAttestation(user: User, ageBucket: unknown): Promise<void> {
  if (typeof ageBucket !== "string" || !ageBucket) return;
  try {
    await fetch("/api/account/attestation", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${await user.getIdToken()}` },
      body: JSON.stringify({ ageBucket, version: AGE_ATTESTATION_VERSION }),
    });
  } catch (error) {
    console.warn("[skin-check] age attestation not recorded", error);
  }
}
