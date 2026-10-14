"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { questionMinutes, questionSteps } from "@/lib/skin-check-validation";
import { echoOn } from "@/lib/echo-limits";
import { btnPrimary, btnSecondary, card, h2, textLink } from "@/components/ui/page";
import type { SkinCheckAnswers } from "@/types/skin-check";
import { QUESTIONS_COPY as Q } from "./questionsCopy";

/** The real count; before gender is known, the most any gender gets ("up to"). */
export function choiceCount(answers: SkinCheckAnswers): { count: number; upTo: boolean } {
  if (answers.gender) return { count: questionSteps(answers).length, upTo: false };
  return { count: Math.max(...["female", "male", "other"].map((gender) => questionSteps({ gender }).length)), upTo: true };
}

/** TD-33 (1): "About the questions". TD-44: the first screen of a check; a skip asks "are you sure?" first. */
export function QuestionsChoice({ answers, onChoose }: { answers: SkinCheckAnswers; onChoose: (choice: "answer" | "skip") => void }) {
  const { count, upTo } = choiceCount(answers);
  const [confirming, setConfirming] = useState(false);
  return (
    <section aria-labelledby="questions-choice-title" className={`${card} flex flex-col gap-5`}>
      <h2 id="questions-choice-title" className={h2}>
        {Q.title}
      </h2>
      <p className="max-w-prose">{Q.howMany(count, questionMinutes(count), upTo)}</p>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold text-brand-text">{Q.whyTitle}</h3>
        <p className="max-w-prose text-brand-muted">{echoOn() ? Q.why : Q.whyNoEcho}</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <h3 className="text-base font-semibold text-brand-text">{Q.skipTitle}</h3>
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
        <button type="button" className={btnSecondary} onClick={() => setConfirming(true)}>
          {Q.skipAsk}
        </button>
      </div>
      {confirming && <SkipConfirm onChoose={onChoose} onClose={() => setConfirming(false)} />}
    </section>
  );
}

/**
 * TD-44: "are you sure?". A native modal dialog: focus moves in, Escape
 * closes it (and is not a skip), the rest of the page is inert, and a screen
 * reader announces it by its title and lines.
 */
function SkipConfirm({ onChoose, onClose }: { onChoose: (choice: "answer" | "skip") => void; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => dialog?.close();
  }, []);
  const lines = echoOn() ? [Q.confirmWhy, Q.confirmStored, Q.confirmEcho, Q.confirmHidden, Q.confirmLater] : [Q.confirmWhyNoEcho, Q.confirmStored, Q.confirmLater];
  return (
    <dialog
      ref={ref}
      aria-labelledby="skip-confirm-title"
      aria-describedby="skip-confirm-lines"
      // StrictMode's dev remount closes and reopens it; that late close event is not the user's.
      onClose={() => !ref.current?.open && onClose()}
      className="w-[calc(100%-32px)] max-w-md rounded-card border border-brand-border bg-brand-surface p-5 text-brand-text shadow-card-lg backdrop:bg-black/40 sm:p-6"
    >
      <div className="flex flex-col gap-5">
        <h2 id="skip-confirm-title" className={h2}>
          {Q.confirmTitle}
        </h2>
        <ul id="skip-confirm-lines" className="flex list-disc flex-col gap-2 pl-5 text-brand-muted">
          {lines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <div className="flex flex-col gap-3">
          {/* Focus lands on the first button: the safer choice. */}
          <button type="button" autoFocus className={btnPrimary} onClick={() => onChoose("answer")}>
            {Q.answerLink}
          </button>
          <button type="button" className={btnSecondary} onClick={() => onChoose("skip")}>
            {Q.skipNow}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/** Results screen after a skip: what it means and the way back in. */
export function SkippedNote({ echoCheck }: { echoCheck: boolean }) {
  return (
    <div role="note" className="flex max-w-prose flex-col items-start gap-1 rounded-card bg-brand-mist p-4 text-brand-ink">
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
