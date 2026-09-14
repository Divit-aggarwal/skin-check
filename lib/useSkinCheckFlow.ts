"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SECTIONS } from "@/lib/skin-check-steps";
import { defaultAnswerFor, isStepAnswerValid, PER_SCAN_SECTION_IDS, reusableAnswers } from "@/lib/skin-check-validation";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import { useAuth } from "@/lib/auth-context";
import { latestSkinCheckAnswers } from "@/lib/firebase/skin-checks";
import {
  clearDraft,
  loadDraft,
  loadDraftScan,
  newScanId,
  saveDraft,
  saveDraftScan,
} from "@/lib/skin-check-draft";
import type { SectionConfig, SkinCheckAnswers, StepAnswerValue, StepConfig } from "@/types/skin-check";
import type { SkinScanState } from "@/types/skin-scan";

// Steps whose `condition` predicate fails for the current answers (e.g. the
// opposite gender's branch questions) are excluded entirely — reveal
// counts, completion, and progress fill are all computed against only what
// this user will actually be asked.
function eligibleStepsFor(section: SectionConfig, answers: SkinCheckAnswers): StepConfig[] {
  return section.steps.filter((step) => !step.condition || step.condition(answers));
}

// How many of a section's eligible questions should be visible: every
// contiguously answered step from the start, plus one more to reveal next.
export function revealCountFor(section: SectionConfig, answers: SkinCheckAnswers): number {
  const eligible = eligibleStepsFor(section, answers);
  let answeredCount = 0;
  for (const step of eligible) {
    if (!isStepAnswerValid(step, answers[step.id] ?? defaultAnswerFor(step))) break;
    answeredCount++;
  }
  return Math.min(answeredCount + 1, eligible.length);
}

// A section can in principle end up with zero eligible steps for a given
// user if every one of its steps carries a `condition` that fails — skip
// straight past it instead of rendering an empty section with a vacuously
// "complete" Continue button. No section hits this today (personal-context's
// skin_factors step is unconditional, so that section is never empty), but
// eligibleStepsFor has no way to guarantee that for every future section, so
// this stays as the general-purpose guard.
// When a previous questionnaire is being reused, its sections are skipped as
// well, leaving only the per-scan ones: verify → photo → results.
function isSkipped(idx: number, answers: SkinCheckAnswers, reusing: boolean): boolean {
  const section = SECTIONS[idx]!;
  return eligibleStepsFor(section, answers).length === 0 || (reusing && !PER_SCAN_SECTION_IDS.has(section.id));
}

export function nextEligibleIndex(fromIndex: number, answers: SkinCheckAnswers, reusing: boolean): number {
  let idx = fromIndex;
  while (idx < SECTIONS.length && isSkipped(idx, answers, reusing)) {
    idx++;
  }
  return idx;
}

export function prevEligibleIndex(fromIndex: number, answers: SkinCheckAnswers, reusing: boolean): number {
  let idx = fromIndex;
  while (idx > 0 && isSkipped(idx, answers, reusing)) {
    idx--;
  }
  return idx;
}

const VERIFY_INDEX = SECTIONS.findIndex((section) => section.id === "verify");
const PHOTO_INDEX = SECTIONS.findIndex((section) => section.id === "skin-photo");

export function useSkinCheckFlow() {
  // A completed scan already sitting in the shared (marketing)-layout
  // session (Step 4b) means this is a remount, not a first visit — e.g. the
  // user tapped "back" from /echo. Land them back on the finished dashboard
  // instead of resetting to section 0; this hook has no other memory of a
  // prior visit since its own state is local to the component instance.
  const { session, setSession } = useSkinCheckSession();

  // Minted once per scan attempt and stable from the questionnaire's first
  // answer through to the Firestore write, where it becomes the document id.
  // One value does three jobs: it keys the local draft, it makes a
  // double-submission address the same document instead of creating a
  // second one, and it's the stable id an image reference will hang off if
  // a bucket is ever wired up.
  const [scanId, setScanId] = useState(newScanId);
  // Draft restore reads localStorage/IndexedDB, which don't exist during
  // SSR. Doing it in an effect rather than a useState initializer is what
  // keeps the server and first client render identical — restoring answers
  // inline would be a hydration mismatch. The flow renders a placeholder
  // until this flips (see SkinCheckFlow).
  const [restored, setRestored] = useState(false);

  const [sectionIndex, setSectionIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [answers, setAnswers] = useState<SkinCheckAnswers>(() => session?.answers ?? {});
  const [scan, setScan] = useState<SkinScanState>(() =>
    session
      ? {
          status: "success",
          result: session.result,
          photo: session.photo,
          original: session.original,
          originalStored: session.originalStored,
          retentionConsentVersion: session.retentionConsentVersion,
          captureMethod: session.captureMethod,
        }
      : { status: "idle" }
  );
  const [complete, setComplete] = useState(() => session !== null);
  // Stopgap for the under-18 age bucket, gated at the "About You" boundary —
  // real guardian-consent handling doesn't exist yet anywhere in this repo
  // (flagged in Step 0). This just stops the rest of the flow, including
  // every later universal-core question, from rendering at all for that
  // bucket; it is not a substitute for a real consent flow.
  const [blocked, setBlocked] = useState(false);
  // True when this scan reuses a questionnaire the user already answered, so
  // only verify, photo and results are left to go through.
  const [reusing, setReusing] = useState(false);
  const [revealCount, setRevealCount] = useState(() => revealCountFor(SECTIONS[0]!, {}));
  // Bumped on every commit (not just the section's last step — an edit to
  // an earlier answer while reviewing a completed section must be able to
  // move things forward too, see SkinCheckFlow's auto-advance effect). The
  // effect re-derives `isSectionComplete` itself at fire time, so a commit
  // that leaves the section incomplete is a harmless no-op here.
  const [advanceSignal, setAdvanceSignal] = useState(0);
  // The step id to auto-scroll to, plus a bump counter so the same id can
  // fire again later (e.g. re-revealed after an edit) even though the
  // string value didn't change. Only set when a commit genuinely reveals a
  // new step — see commitStep — so it's a precise "user just advanced"
  // signal the UI layer can scroll on without re-deriving it.
  const [revealTarget, setRevealTarget] = useState<{ id: string; seq: number } | null>(null);
  const revealSeqRef = useRef(0);
  // StrictMode double-invokes mount effects in dev; restoring twice would be
  // harmless but re-entrant, so the restore runs exactly once either way.
  const restoreStartedRef = useRef(false);

  // ── Draft restore (once, on mount) ───────────────────────────────────────
  // Recovers a questionnaire abandoned by a refresh, a dropped connection, a
  // crash, or a closed tab. Deliberately does NOT require a Firebase user:
  // at this point in the flow there isn't one, and there must not need to be.
  useEffect(() => {
    if (restoreStartedRef.current) return;
    restoreStartedRef.current = true;

    // A live in-memory session (returning from /echo) already holds newer
    // state than any draft — don't overwrite it.
    if (session) {
      setRestored(true);
      return;
    }

    const draft = loadDraft();
    if (!draft) {
      setRestored(true);
      return;
    }

    setScanId(draft.scanId);
    setAnswers(draft.answers);
    const idx = Math.min(Math.max(draft.sectionIndex, 0), SECTIONS.length - 1);
    setSectionIndex(idx);
    // Derived, never persisted — reveal position is a pure function of which
    // answers are filled in, so it can't drift out of sync with them.
    setRevealCount(revealCountFor(SECTIONS[idx]!, draft.answers));

    // The photo and its analysis live in IndexedDB (too large for
    // localStorage), keyed by this same scanId. Restoring a SUCCESSFUL
    // result matters for more than convenience: it's what stops a refresh
    // from silently re-running the CV analysis on bytes we already paid to
    // process.
    //
    // No cancellation flag here, deliberately. StrictMode runs mount effects
    // as effect → cleanup → effect; a `cancelled` closure set by that
    // cleanup would be poisoned before this promise resolves, while
    // restoreStartedRef blocks the second invocation from starting a
    // replacement load — so the photo would silently never restore in dev.
    // restoreStartedRef alone already guarantees this runs once, and React
    // 18 no longer warns about setState after unmount.
    void loadDraftScan(draft.scanId).then((stored) => {
      if (!stored) {
        // localStorage survived but IndexedDB didn't (blocked, evicted, or
        // cleared independently). The answer says a photo was committed but
        // there are no bytes behind it — re-ask for the capture rather than
        // restoring a "Photo saved" state with nothing in it.
        setAnswers((prev) => {
          if (prev.skin_photo !== "done") return prev;
          const rest = { ...prev };
          delete rest.skin_photo;
          return rest;
        });
        return;
      }
      if (stored.result) {
        setScan({
          status: "success",
          result: stored.result,
          photo: stored.photo,
          captureMethod: stored.captureMethod,
        });
      } else {
        // Captured, but the analysis never landed (refresh mid-scan, or it
        // failed). Surface it as retryable rather than as a committed photo
        // with no reading behind it.
        setScan({
          status: "error",
          message: "We didn't finish reading your photo. You can try again.",
          photo: stored.photo,
          captureMethod: stored.captureMethod,
        });
      }
    });

    setRestored(true);
    // Mount-only: `session` is read for its value at mount, and re-running
    // this on a later session change would fight the live state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Returning user: reuse their last questionnaire ───────────────────────
  // The in-memory session and the draft are both gone once a scan is saved, so
  // someone back for another scan would otherwise answer every question again.
  // Once Firebase says who they are, their most recent saved answers fill the
  // questionnaire in. Only before the photo step — someone already partway
  // through the later sections carries on as they are.
  const { user } = useAuth();
  const reuseCheckedForRef = useRef<string | null>(null);
  const flowRef = useRef({ answers, sectionIndex, complete });
  flowRef.current = { answers, sectionIndex, complete };

  useEffect(() => {
    const uid = user?.uid;
    if (!uid || !restored || complete || reusing || sectionIndex > PHOTO_INDEX) return;
    if (reuseCheckedForRef.current === uid) return;
    reuseCheckedForRef.current = uid;

    latestSkinCheckAnswers(uid)
      .then((previous) => {
        const now = flowRef.current;
        if (!previous || now.complete || now.sectionIndex > PHOTO_INDEX) return;
        // Anything already answered in this visit wins over the saved copy.
        const reuse = reusableAnswers({ ...previous, ...now.answers });
        if (!reuse) return;
        setAnswers((prev) => ({ ...reuse, ...prev }));
        setReusing(true);
        if (now.sectionIndex === 0 && Object.keys(now.answers).length === 0) {
          setSectionIndex(VERIFY_INDEX);
          setRevealCount(revealCountFor(SECTIONS[VERIFY_INDEX]!, reuse));
        }
      })
      .catch((error) => {
        // Non-fatal: the full questionnaire still works.
        console.warn("[skin-check] couldn't load previous answers", error);
      });
  }, [user, restored, complete, reusing, sectionIndex]);

  // ── Draft persist (incremental) ──────────────────────────────────────────
  // Every answer commit, not just the end of the questionnaire.
  useEffect(() => {
    if (!restored || complete) return;
    saveDraft({ scanId, answers, sectionIndex });
  }, [restored, complete, scanId, answers, sectionIndex]);

  // The photo is written as soon as it's captured (result still null) and
  // rewritten once the analysis lands, so a refresh at any point in that
  // window recovers whatever exists.
  useEffect(() => {
    if (!restored) return;
    if (scan.status === "success") {
      void saveDraftScan({
        scanId,
        photo: scan.photo,
        result: scan.result,
        captureMethod: scan.captureMethod,
      });
    } else if (scan.status === "error") {
      void saveDraftScan({
        scanId,
        photo: scan.photo,
        result: null,
        captureMethod: scan.captureMethod,
      });
    }
  }, [restored, scanId, scan]);

  /**
   * Starts a genuinely new scan for the same user — the "many" half of
   * ONE USER → MANY SCANS. A new scanId means the next Firestore write
   * creates a new document instead of colliding with the finished one, so
   * this is the deliberate second scan the idempotency guard must not block.
   *
   * The questionnaire they just answered carries over, so the new scan is
   * verify → photo → results. It starts blank only if those answers can't be
   * reused (see reusableAnswers).
   */
  const startNewScan = useCallback(() => {
    void clearDraft();
    const reuse = reusableAnswers(answers);
    const idx = reuse ? VERIFY_INDEX : 0;
    setScanId(newScanId());
    setAnswers(reuse ?? {});
    setReusing(reuse !== null);
    setScan({ status: "idle" });
    setSectionIndex(idx);
    setRevealCount(revealCountFor(SECTIONS[idx]!, reuse ?? {}));
    setComplete(false);
    setBlocked(false);
    setDirection(1);
    setSession(null);
  }, [answers, setSession]);

  /** Called once the scan is safely in Firestore — the draft has no more use. */
  const finishDraft = useCallback(() => {
    void clearDraft();
  }, []);

  const activeIndex = complete ? SECTIONS.length - 1 : sectionIndex;
  const section = SECTIONS[activeIndex]!;

  const eligibleSteps = useMemo(() => eligibleStepsFor(section, answers), [section, answers]);

  const setAnswer = useCallback((stepId: string, value: StepAnswerValue) => {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
  }, []);

  // Only advances reveal when the step committing is the currently-active
  // (last revealed) one — editing an earlier, already-passed answer is a
  // no-op here.
  const commitStep = useCallback(
    (stepId: string) => {
      const stepIndex = eligibleSteps.findIndex((s) => s.id === stepId);
      if (stepIndex === revealCount - 1) {
        setRevealCount((c) => Math.min(c + 1, eligibleSteps.length));
        const revealedStep = eligibleSteps[stepIndex + 1];
        if (revealedStep) {
          revealSeqRef.current += 1;
          setRevealTarget({ id: revealedStep.id, seq: revealSeqRef.current });
        }
      }
      setAdvanceSignal((n) => n + 1);
    },
    [eligibleSteps, revealCount]
  );

  const visibleSteps = useMemo(() => eligibleSteps.slice(0, revealCount), [eligibleSteps, revealCount]);

  const isSectionComplete = useMemo(
    () =>
      eligibleSteps.every((step) => isStepAnswerValid(step, answers[step.id] ?? defaultAnswerFor(step))),
    [eligibleSteps, answers]
  );

  const sectionFill = useMemo(() => {
    if (eligibleSteps.length === 0) return 1;
    const filled = eligibleSteps.filter((step) =>
      isStepAnswerValid(step, answers[step.id] ?? defaultAnswerFor(step))
    ).length;
    return filled / eligibleSteps.length;
  }, [eligibleSteps, answers]);

  const next = useCallback(() => {
    setDirection(1);
    if (section.id === "about-you" && answers.age === "under-18") {
      setBlocked(true);
      return;
    }
    const idx = nextEligibleIndex(sectionIndex + 1, answers, reusing);
    if (idx < SECTIONS.length) {
      const nextSection = SECTIONS[idx]!;
      setSectionIndex(idx);
      setRevealCount(revealCountFor(nextSection, answers));
    } else {
      setComplete(true);
    }
  }, [section, sectionIndex, answers, reusing]);

  const back = useCallback(() => {
    setDirection(-1);
    if (blocked) {
      setBlocked(false);
      return;
    }
    if (complete) {
      setComplete(false);
      return;
    }
    const idx = prevEligibleIndex(Math.max(sectionIndex - 1, 0), answers, reusing);
    const prevSection = SECTIONS[idx]!;
    setSectionIndex(idx);
    setRevealCount(revealCountFor(prevSection, answers));
  }, [blocked, complete, sectionIndex, answers, reusing]);

  return {
    scanId,
    restored,
    startNewScan,
    finishDraft,
    section,
    sectionIndex: activeIndex,
    visibleSteps,
    answers,
    setAnswer,
    scan,
    setScan,
    commitStep,
    advanceSignal,
    revealTarget,
    isSectionComplete,
    sectionFill,
    isFirst: sectionIndex === 0 && !complete && !blocked,
    next,
    back,
    direction,
    complete,
    blocked,
  };
}
