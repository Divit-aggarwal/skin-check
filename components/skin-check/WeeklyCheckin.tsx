"use client";

import { useEffect, useRef, useState } from "react";
import { CircleCheck, ClipboardList } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { CHECKIN_QUESTIONS, type CheckinAnswers } from "@/lib/feature-contracts/checkin";
import { AppHeader, Arrow, CheckinQuestionCard, IconWell, Stepper } from "@/components/ui/kit";
import { btnGhost, btnPrimary, card } from "@/components/ui/page";
import { CHECKIN_COPY as C } from "./flowCopy";
import { canSubmitCheckin, checkinBody, submitCheckin, type CheckinOutcome } from "./checkinSubmit";

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

/**
 * Screen 08, the weekly check-in, behind weeklyCheckinUi() (E19). Questions
 * from the contract; POST /api/checkins once (one per week: 409 is "already
 * done", never retried). `scanId` is the check it follows, or null when it
 * was opened from the start of a check. Skip closes without saving.
 */
export function WeeklyCheckin({ onClose, scanId }: { onClose: () => void; scanId: string | null }) {
  const { user } = useAuth();
  const [answers, setAnswers] = useState<CheckinAnswers>({});
  const [state, setState] = useState<"answering" | "saving" | CheckinOutcome>("answering");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const endRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => titleRef.current?.focus(), []);
  useEffect(() => {
    if (state === "saved" || state === "already") endRef.current?.focus();
  }, [state]);

  const save = async () => {
    if (!user || !canSubmitCheckin(answers) || state === "saving") return;
    setState("saving");
    setState(await submitCheckin(await user.getIdToken(), checkinBody(answers, scanId, tz())));
  };

  if (state === "saved" || state === "already") {
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 pb-10 sm:px-6">
        <AppHeader back={onClose} backLabel={C.back} />
        <section className={`${card} flex flex-col items-start gap-3`}>
          <IconWell icon={CircleCheck} size={48} />
          <h1 ref={endRef} tabIndex={-1} className="text-2xl font-semibold text-brand-text outline-none">
            {state === "saved" ? C.savedTitle : C.alreadyTitle}
          </h1>
          <p className="text-brand-text-muted">{state === "saved" ? C.savedBody : C.alreadyBody}</p>
          <button type="button" onClick={onClose} className={`${btnPrimary} w-full`}>
            {C.done}
          </button>
        </section>
      </div>
    );
  }

  const ready = Boolean(user) && canSubmitCheckin(answers);
  const note = !user ? C.signedOut : !canSubmitCheckin(answers) ? C.pickOne : null;
  const error = state !== "answering" && state !== "saving" ? C.outcome[state] : null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 px-4 pb-6 sm:px-6">
      <AppHeader
        back={onClose}
        backLabel={C.back}
        right={
          <button type="button" onClick={onClose} className={`${btnGhost} -mr-4 px-3 text-base`}>
            {C.skip}
          </button>
        }
      />
      {/* After a check: photos done, this, then complete. Opened from the start there is no photo step to show. */}
      {scanId && <Stepper steps={[...C.steps]} current={1} />}
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 ref={titleRef} tabIndex={-1} className="text-[27px] font-bold leading-[1.1] tracking-[-0.025em] text-brand-text outline-none">
            {C.title}
          </h1>
          <p className="mt-1 text-sm leading-snug text-brand-text-muted">{C.intro}</p>
        </div>
        <IconWell icon={ClipboardList} size={80} className="bg-brand-50" />
      </div>
      <div className="flex flex-col gap-3">
        {CHECKIN_QUESTIONS.map((q, i) => (
          <CheckinQuestionCard key={q.id} n={i + 1} question={q} value={answers[q.id]} onChange={(id) => setAnswers((prev) => ({ ...prev, [q.id]: id }))} />
        ))}
      </div>
      <div className="sticky bottom-0 -mx-4 flex flex-col gap-2 bg-gradient-to-t from-brand-bg via-brand-bg to-transparent px-4 pb-4 pt-4">
        <div aria-live="polite" className="text-center text-sm">
          {error && <p role="alert" className="text-brand-error">{error}</p>}
        </div>
        <button type="button" onClick={save} aria-disabled={!ready || state === "saving"} aria-describedby={note ? "checkin-note" : undefined} className={btnPrimary}>
          {state === "saving" ? C.saving : C.save}
          {state !== "saving" && <Arrow />}
        </button>
        {note && (
          <p id="checkin-note" className="text-center text-sm text-brand-text-muted">
            {note}
          </p>
        )}
      </div>
    </div>
  );
}
