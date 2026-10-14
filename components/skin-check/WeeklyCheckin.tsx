"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { ChoiceGrid, Wordmark } from "@/components/ui/kit";
import { btnGhost, btnPrimary, card } from "@/components/ui/page";
import { CHECKIN_COPY as C } from "./flowCopy";

/**
 * Screen 08, the weekly check-in, behind weeklyCheckinUi() (E19). The
 * questions are a placeholder (flowCopy.ts) and nothing is saved: the answers
 * live in this component only and the save button is disabled (lane rule 7).
 */
export function WeeklyCheckin({ onClose }: { onClose: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-10 pt-4 sm:px-6 sm:pt-6">
      <div className="grid min-h-11 grid-cols-[1fr_auto_1fr] items-center">
        <button type="button" onClick={onClose} aria-label={C.back} className="-ml-3 grid size-11 place-items-center rounded-full text-brand-text hover:bg-brand-50">
          <ChevronLeft aria-hidden size={22} />
        </button>
        <Wordmark className="pl-[0.35em]" />
        <button type="button" onClick={onClose} className={`${btnGhost} -mr-4 justify-self-end`}>
          {C.skip}
        </button>
      </div>
      <div>
        <h1 ref={titleRef} tabIndex={-1} className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-brand-text outline-none sm:text-[32px]">
          {C.title}
        </h1>
        <p className="mt-2 text-brand-text-muted">{C.intro}</p>
      </div>
      <ol className="flex flex-col gap-3">
        {C.questions.map((q, i) => (
          <li key={q.id} className={`${card} flex flex-col gap-4`}>
            <p id={`checkin-${q.id}`} className="flex items-center gap-3 font-semibold text-brand-text">
              <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm text-brand-700">
                {i + 1}
              </span>
              {q.text}
            </p>
            <ChoiceGrid
              label={q.text}
              options={q.options.map((o) => ({ value: o.value as string, label: o.label }))}
              value={answers[q.id] ?? []}
              onChange={(v) => setAnswers((prev) => ({ ...prev, [q.id]: v }))}
            />
          </li>
        ))}
      </ol>
      <div className="flex flex-col gap-2">
        <button type="button" disabled aria-describedby="checkin-later" className={btnPrimary}>
          {C.save}
        </button>
        <p id="checkin-later" className="text-center text-sm text-brand-text-muted">
          {C.saveLater}
        </p>
      </div>
    </div>
  );
}
