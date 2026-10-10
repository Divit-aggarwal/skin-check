"use client";

import Link from "next/link";
import { questionMinutes, questionSteps } from "@/lib/skin-check-validation";
import { echoOn } from "@/lib/echo-limits";
import { btnPrimary, btnSecondary, card, h2, textLink } from "@/components/ui/page";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { QUESTIONS_COPY as Q } from "./questionsCopy";

/** TD-33 (1): "About the questions", right after About you. */
export function QuestionsChoice({ answers, onChoose }: { answers: SkinCheckAnswers; onChoose: (choice: "answer" | "skip") => void }) {
  const count = questionSteps(answers).length;
  return (
    <section aria-labelledby="questions-choice-title" className={`${card} flex flex-col gap-5`}>
      <h2 id="questions-choice-title" className={h2}>
        {Q.title}
      </h2>
      <p className="max-w-prose">{Q.howMany(count, questionMinutes(count))}</p>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-base font-semibold tracking-[-0.01em]">{Q.whyTitle}</h3>
        <p className="max-w-prose text-brand-muted">{echoOn() ? Q.why : Q.whyNoEcho}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-base font-semibold tracking-[-0.01em]">{Q.skipTitle}</h3>
        <ul className="flex max-w-prose list-disc flex-col gap-1 pl-5 text-brand-muted">
          {(echoOn() ? Q.skip : Q.skipNoEcho).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <button type="button" className={btnPrimary} onClick={() => onChoose("answer")}>
          {Q.answerNow}
        </button>
        <button type="button" className={btnSecondary} onClick={() => onChoose("skip")}>
          {Q.skipNow}
        </button>
      </div>
    </section>
  );
}

/** Results screen after a skip: what it means and the way back in. */
export function SkippedNote({ echoCheck }: { echoCheck: boolean }) {
  return (
    <div role="note" className="flex max-w-prose flex-col items-start gap-1 rounded-2xl bg-brand-mist p-4 text-brand-ink">
      {/* A check with no reading is never one Echo talks about (flow review M3). */}
      <p>{echoOn() && echoCheck ? Q.skippedNote : Q.skippedNoteNoEcho}</p>
      <Link href="/questions" className={textLink}>
        {Q.answerLink}
      </Link>
    </div>
  );
}

/** Home and Account (TD-33 (1)): the way back in after a skip. Shown only while questions wait. */
export function QuestionsCard({ isEcho, date }: { isEcho: boolean; date: string | null }) {
  return (
    <section aria-labelledby="questions-card-title" className={`${card} flex flex-col items-start gap-3`}>
      <h2 id="questions-card-title" className={h2}>
        {Q.cardTitle}
      </h2>
      <p className="text-brand-muted">
        {Q.cardFor(date)} {echoOn() && isEcho ? Q.cardEcho : Q.cardNoEcho}
      </p>
      {/* Secondary: Home already has its primary action (system.md §5, one per view). */}
      <Link href="/questions" className={btnSecondary}>
        {Q.answerLink}
      </Link>
    </section>
  );
}
