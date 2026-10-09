"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { ALL_SECTION_LABELS } from "@/lib/skin-check-steps";
import { useSkinCheckFlow } from "@/lib/useSkinCheckFlow";
import { defaultAnswerFor } from "@/lib/skin-check-validation";
import { formatPrompt } from "@/lib/skin-check-format";
import { Button } from "@/components/ui/button";
import { ProgressHeader } from "./ProgressHeader";
import { EchoBubble } from "./EchoBubble";
import { StepAnswer } from "./StepAnswer";
import { SkinCheckDashboard } from "./SkinCheckDashboard";
import { DashboardLink } from "@/components/dashboard/DashboardLink";
import { QuestionsChoice, SkippedNote } from "./QuestionsChoice";

// Section-to-section only — individual questions within a section never
// slide, they fade in and accumulate on the growing page.
const sectionSlideVariants: Variants = {
  enter: (dir: 1 | -1) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0 },
  exit: (dir: 1 | -1) => ({ opacity: 0, x: dir * -24 }),
};

// How long a completed section sits still before the auto-advance fires —
// long enough to register that the tap landed (the option's own selected
// state changes instantly), short enough not to feel like a stall. PART 7.
const AUTO_ADVANCE_DELAY_MS = 220;

export function SkinCheckFlow() {
  const {
    scanId,
    restored,
    startNewScan,
    finishDraft,
    section,
    sectionIndex,
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
    isFirst,
    next,
    back,
    direction,
    complete,
    blocked,
    confirmingUnder18,
    confirmUnder18,
    lastAnswerHints,
    choosingQuestions,
    questionsChoice,
    chooseQuestions,
    productNames,
    setProductName,
  } = useSkinCheckFlow();

  // Keyed by step id so a freshly revealed question can be scrolled into
  // view without assuming it's the next DOM sibling — entries clean
  // themselves up on unmount via the ref callback below.
  const stepRefs = useRef(new Map<string, HTMLDivElement>());
  const headerRef = useRef<HTMLDivElement>(null);
  const hasMountedSectionRef = useRef(false);

  // Fires only when commitStep (lib/useSkinCheckFlow) genuinely reveals a
  // new step — never on mount, editing an earlier answer, or back().
  useEffect(() => {
    if (!revealTarget) return;
    const raf = requestAnimationFrame(() => {
      stepRefs.current.get(revealTarget.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => cancelAnimationFrame(raf);
  }, [revealTarget]);

  // Same problem one level up: finishing a section can leave the page
  // scrolled past the shorter next section's content. Targets the header
  // row (not the section box) so the back button/progress bar above it
  // stay in view instead of scrolling past them. Forward-only (a completed
  // section is never reached via back()) and skipped on first mount so
  // landing on the flow doesn't itself trigger a scroll.
  useEffect(() => {
    if (!hasMountedSectionRef.current) {
      hasMountedSectionRef.current = true;
      return;
    }
    if (direction !== 1 || complete || blocked) return;
    const raf = requestAnimationFrame(() => {
      headerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section.id]);

  // No Continue button — advancing a section is driven by `advanceSignal`,
  // which ticks on every answer commit (see useSkinCheckFlow). The effect
  // itself depends on nothing but that tick: everything it reads at fire
  // time comes off a ref updated every render. Depending on
  // `isSectionComplete`/`next` directly would re-run this effect mid-timer
  // under React 18 StrictMode's dev double-invoke (next.config.js has
  // reactStrictMode on) — cleanup fires, the effect re-enters, and an
  // identical `advanceSignal` short-circuits it, so the advance silently
  // never happens. Keeping `advanceSignal` as the only dependency avoids that.
  const latest = useRef({ isSectionComplete, complete, blocked, confirmingUnder18, choosingQuestions, next });
  latest.current = { isSectionComplete, complete, blocked, confirmingUnder18, choosingQuestions, next };

  useEffect(() => {
    if (advanceSignal === 0) return;
    const t = setTimeout(() => {
      const s = latest.current;
      if (!s.complete && !s.blocked && !s.choosingQuestions && !s.confirmingUnder18 && s.isSectionComplete) s.next();
    }, AUTO_ADVANCE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceSignal]);

  // Until the draft check has run we don't yet know whether this is a fresh
  // start or a recovered one. Rendering section 1 first and snapping to the
  // restored position a tick later would be a visible flash, so hold the
  // frame — this resolves synchronously off localStorage in practice.
  if (!restored) {
    return <div className="min-h-dvh bg-brand-linen" />;
  }

  return (
    <div className="min-h-dvh bg-brand-linen">
      {/* Back and the Home link share a row above the progress bar, so the bar
          and every question start on the same edge (design review G03). */}
      <div ref={headerRef} className={`mx-auto flex flex-col gap-2 px-4 pt-4 sm:px-6 sm:pt-6 ${complete ? "max-w-6xl lg:px-8" : "max-w-2xl"}`}>
        <div className="flex min-h-11 items-center justify-between">
          <button
            type="button"
            onClick={back}
            disabled={isFirst}
            aria-label="Go back"
            className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-brand-muted hover:bg-brand-linen hover:text-brand-ink disabled:invisible"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          {/* O-D3: the signed-in start page links to /dashboard. */}
          {isFirst && !complete && (
            <DashboardLink />
          )}
        </div>
        {!complete && (
          <ProgressHeader
            sectionLabels={ALL_SECTION_LABELS}
            activeSectionIndex={sectionIndex}
            activeSectionFill={sectionFill}
            activeSectionLabel={choosingQuestions ? "BEFORE THE QUESTIONS" : section.label}
          />
        )}
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        {confirmingUnder18 ? (
          <motion.div
            key="confirm-under-18"
            custom={direction}
            variants={sectionSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-10 pt-10 sm:px-6"
          >
            <EchoBubble message="You chose under 18. Is that right?" />
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="button" variant="ink" size="lg" onClick={() => confirmUnder18(true)} className="flex-1">
                Yes, I&apos;m under 18
              </Button>
              <Button type="button" variant="outlineLight" size="lg" onClick={() => confirmUnder18(false)} className="flex-1">
                No, change my answer
              </Button>
            </div>
          </motion.div>
        ) : choosingQuestions ? (
          <motion.div
            key="questions-choice"
            custom={direction}
            variants={sectionSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            className="mx-auto max-w-2xl px-4 pb-10 pt-10 sm:px-6"
          >
            <QuestionsChoice answers={answers} onChoose={chooseQuestions} />
          </motion.div>
        ) : blocked ? (
          <motion.div
            key="blocked"
            custom={direction}
            variants={sectionSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            className="mx-auto max-w-2xl px-4 pb-10 pt-10 sm:px-6"
          >
            <div role="status" className="flex flex-col items-start gap-4 rounded-2xl border border-brand-card-line bg-brand-paper p-5 sm:p-6">
              <p>This experience isn&apos;t available yet for users under 18. If that&apos;s not right, change your answer.</p>
              <Button type="button" variant="ink" size="lg" onClick={back}>
                Change my answer
              </Button>
            </div>
          </motion.div>
        ) : complete ? (
          <motion.div
            key="complete"
            custom={direction}
            variants={sectionSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            className="mx-auto max-w-6xl px-4 pb-16 pt-6 sm:px-6 lg:px-8"
          >
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-eyebrow">Your check</p>
                <h1 className="font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-brand-title sm:text-[40px]">Your photo reading</h1>
                <p className="max-w-prose text-brand-muted">
                  {formatPrompt("Thanks, {name}. Here is how each area of your face showed up in this one photo.", answers)}
                </p>
              </div>
              <SkinCheckDashboard scan={scan} scanId={scanId} onScanChange={setScan} onRetake={startNewScan} answers={answers} />

              {/* TD-33 (1): honest about what skipping means, with the way back in. */}
              {questionsChoice === "skip" && <SkippedNote />}

              {/* A new check starts here without a reload; every past check is on
                  /checks (one history list, TD-25 (6)); Home is one tap away. */}
              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
                <Button type="button" variant="ink" size="lg" onClick={startNewScan}>
                  Take a new check
                </Button>
                <Button asChild variant="outlineLight" size="lg">
                  <Link href="/checks">All your checks</Link>
                </Button>
                {/* O-D3: the results screen links to /dashboard. */}
                <DashboardLink />
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key={section.id}
            custom={direction}
            variants={sectionSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            className="mx-auto flex max-w-2xl flex-col gap-10 px-4 pb-10 pt-10 sm:px-6"
          >
            {visibleSteps.map((step) => (
              <motion.div
                key={step.id}
                ref={(el) => {
                  if (el) stepRefs.current.set(step.id, el);
                  else stepRefs.current.delete(step.id);
                }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
                className="flex flex-col gap-5"
              >
                <EchoBubble message={formatPrompt(step.prompt, answers)} />
                {/* R9, decision 10a: re-confirmed steps start blank; last time's
                    answer is shown, never filled in. Only those steps have a hint. */}
                {lastAnswerHints[step.id] && (
                  <p className="text-sm text-brand-muted">{lastAnswerHints[step.id]}</p>
                )}
                <StepAnswer
                  step={step}
                  value={answers[step.id] ?? defaultAnswerFor(step)}
                  onChange={(v) => setAnswer(step.id, v)}
                  onCommit={() => commitStep(step.id)}
                  scan={scan}
                  onScanChange={setScan}
                  answers={answers}
                  scanId={scanId}
                  onSaved={finishDraft}
                  productNames={productNames}
                  onProductNameChange={setProductName}
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
