"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import { ALL_SECTION_LABELS } from "@/lib/skin-check-steps";
import { useSkinCheckFlow } from "@/lib/useSkinCheckFlow";
import { defaultAnswerFor } from "@/lib/skin-check-validation";
import { formatPrompt } from "@/lib/skin-check-format";
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

export function SkinCheckFlow() {
  const {
    section,
    sectionIndex,
    visibleSteps,
    answers,
    setAnswer,
    scan,
    setScan,
    commitStep,
    isSectionComplete,
    sectionFill,
    isFirst,
    next,
    back,
    direction,
    complete,
    blocked,
  } = useSkinCheckFlow();

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-white px-6 pb-10 pt-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={back}
          disabled={isFirst}
          aria-label="Go back"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[#1A1A1A]/60 transition-opacity hover:text-[#1A1A1A] disabled:opacity-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <ProgressHeader
            sectionLabels={ALL_SECTION_LABELS}
            activeSectionIndex={sectionIndex}
            activeSectionFill={complete ? 1 : sectionFill}
            activeSectionLabel={section.label}
          />
        </div>
      </div>

      <div className="pt-10">
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
            >
              <div className="flex flex-col gap-6">
                <EchoBubble
                  message={formatPrompt("Thanks, {name} — that's everything for your skin check.", answers)}
                />
                <SkinCheckDashboard scan={scan} onScanChange={setScan} answers={answers} />
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
              className="flex flex-col gap-9"
            >
              {visibleSteps.map((step) => (
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.19, 1, 0.22, 1] }}
                  className="flex flex-col gap-6"
                >
                  <EchoBubble message={formatPrompt(step.prompt, answers)} />
                  <StepAnswer
                    step={step}
                    value={answers[step.id] ?? defaultAnswerFor(step)}
                    onChange={(v) => setAnswer(step.id, v)}
                    onCommit={() => commitStep(step.id)}
                    scan={scan}
                    onScanChange={setScan}
                  />
                </motion.div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {!complete && !blocked && (
        <div className="flex justify-end pt-8">
          <button
            type="button"
            onClick={next}
            disabled={!isSectionComplete}
            className="h-14 rounded-full bg-[#E02D79] px-7 text-base font-medium text-white transition-opacity disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#98415A]/50 focus-visible:ring-offset-2"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
