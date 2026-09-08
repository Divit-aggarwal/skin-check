"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { SECTIONS } from "@/lib/skin-check-steps";
import { defaultAnswerFor, isStepAnswerValid } from "@/lib/skin-check-validation";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
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
function revealCountFor(section: SectionConfig, answers: SkinCheckAnswers): number {
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
function nextEligibleIndex(fromIndex: number, answers: SkinCheckAnswers): number {
  let idx = fromIndex;
  while (idx < SECTIONS.length && eligibleStepsFor(SECTIONS[idx]!, answers).length === 0) {
    idx++;
  }
  return idx;
}

function prevEligibleIndex(fromIndex: number, answers: SkinCheckAnswers): number {
  let idx = fromIndex;
  while (idx > 0 && eligibleStepsFor(SECTIONS[idx]!, answers).length === 0) {
    idx--;
  }
  return idx;
}

export function useSkinCheckFlow() {
  // A completed scan already sitting in the shared (marketing)-layout
  // session (Step 4b) means this is a remount, not a first visit — e.g. the
  // user tapped "back" from /echo. Land them back on the finished dashboard
  // instead of resetting to section 0; this hook has no other memory of a
  // prior visit since its own state is local to the component instance.
  const { session } = useSkinCheckSession();

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
    const idx = nextEligibleIndex(sectionIndex + 1, answers);
    if (idx < SECTIONS.length) {
      const nextSection = SECTIONS[idx]!;
      setSectionIndex(idx);
      setRevealCount(revealCountFor(nextSection, answers));
    } else {
      setComplete(true);
    }
  }, [section, sectionIndex, answers]);

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
    const idx = prevEligibleIndex(Math.max(sectionIndex - 1, 0), answers);
    const prevSection = SECTIONS[idx]!;
    setSectionIndex(idx);
    setRevealCount(revealCountFor(prevSection, answers));
  }, [blocked, complete, sectionIndex, answers]);

  return {
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
