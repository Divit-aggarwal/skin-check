"use client";

import Link from "next/link";
import { questionMinutes, questionSteps } from "@/lib/skin-check-validation";
import { btnPrimary, btnSecondary, card, h2, textLink } from "@/components/ui/page";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { QUESTIONS_COPY as Q } from "./questionsCopy";

/** TD-33 (1): "Before the questions", right after About you. */
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
        <p className="max-w-prose text-brand-muted">{Q.why}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="font-display text-base font-semibold tracking-[-0.01em]">{Q.skipTitle}</h3>
        <ul className="flex max-w-prose list-disc flex-col gap-1 pl-5 text-brand-muted">
          {Q.skip.map((line) => (
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
export function SkippedNote() {
  return (
    <div role="note" className="flex max-w-prose flex-col items-start gap-1 rounded-2xl bg-brand-mist p-4 text-brand-ink">
      <p>{Q.skippedNote}</p>
      <Link href="/questions" className={textLink}>
        {Q.answerLink}
      </Link>
    </div>
  );
}

/** Home and Account (TD-33 (1)): the way back in after a skip. Shown only while questions wait. */
export function QuestionsCard() {
  return (
    <section aria-labelledby="questions-card-title" className={`${card} flex flex-col items-start gap-3`}>
      <h2 id="questions-card-title" className={h2}>
        {Q.cardTitle}
      </h2>
      <p className="text-brand-muted">{Q.cardBody}</p>
      <Link href="/questions" className={btnPrimary}>
        {Q.answerLink}
      </Link>
    </section>
  );
}
