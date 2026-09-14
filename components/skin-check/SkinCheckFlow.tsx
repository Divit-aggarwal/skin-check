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
  const latest = useRef({ isSectionComplete, complete, blocked, next });
  latest.current = { isSectionComplete, complete, blocked, next };

  useEffect(() => {
    if (advanceSignal === 0) return;
    const t = setTimeout(() => {
      const s = latest.current;
      if (!s.complete && !s.blocked && s.isSectionComplete) s.next();
    }, AUTO_ADVANCE_DELAY_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advanceSignal]);

  // Until the draft check has run we don't yet know whether this is a fresh
  // start or a recovered one. Rendering section 1 first and snapping to the
  // restored position a tick later would be a visible flash, so hold the
  // frame — this resolves synchronously off localStorage in practice.
  if (!restored) {
    return <div className="min-h-dvh bg-white" />;
  }

  return (
    <div className="min-h-dvh bg-white">
      <div ref={headerRef} className="mx-auto flex max-w-xl items-center gap-3 px-6 pt-6">
        <button
          type="button"
          onClick={back}
          disabled={isFirst}
          aria-label="Go back"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-text/60 transition-opacity hover:text-text disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blush/50 focus-visible:ring-offset-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        {!complete && (
          <div className="flex-1">
            <ProgressHeader
              sectionLabels={ALL_SECTION_LABELS}
              activeSectionIndex={sectionIndex}
              activeSectionFill={sectionFill}
              activeSectionLabel={section.label}
            />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        {blocked ? (
          <motion.div
            key="blocked"
            custom={direction}
            variants={sectionSlideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: [0.19, 1, 0.22, 1] }}
            className="mx-auto max-w-xl px-6 pb-10 pt-10"
          >
            <EchoBubble message="This experience isn't available yet for users under 18. If that's not right, tap back to change your answer." />
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
            className="mx-auto max-w-5xl px-6 pb-16 pt-6 sm:px-10"
          >
            <div className="flex flex-col gap-10">
              <div className="flex flex-col gap-3 text-center">
                <p className="text-label font-semibold uppercase tracking-label text-blush">
                  Your Results
                </p>
                <h1 className="font-display text-4xl italic leading-tight text-text sm:text-5xl">
                  Your skin, understood.
                </h1>
                <p className="mx-auto max-w-md text-body text-text/70">
                  {formatPrompt("Thanks, {name} — here's a visual reading of your skin, based on your scan.", answers)}
                </p>
              </div>
              <SkinCheckDashboard scan={scan} scanId={scanId} onScanChange={setScan} answers={answers} />

              {/* The storage model has always allowed many scans per user
                  (each is its own document); without this there was simply
                  no way to start the next one without a hard reload.
                  The /account link is the only in-app route to a returning
                  user's saved scans — without it that page is reachable by
                  typing the URL and nothing else. */}
              <div className="mx-auto flex w-full max-w-md flex-col gap-3 sm:flex-row">
                <Button type="button" variant="ink" size="lg" onClick={startNewScan} className="flex-1">
                  Take a new scan
                </Button>
                <Button asChild variant="outlineLight" size="lg" className="flex-1">
                  <Link href="/account">Your previous scans</Link>
                </Button>
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
            className="mx-auto flex max-w-xl flex-col gap-10 px-6 pb-10 pt-10"
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
                />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
