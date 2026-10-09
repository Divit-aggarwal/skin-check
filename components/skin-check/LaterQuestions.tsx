"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import { SECTIONS } from "@/lib/skin-check-steps";
import {
  defaultAnswerFor,
  isStepAnswerValid,
  keptProductNames,
  QUESTION_SECTION_IDS,
  type ProductNameKey,
  type ProductNames,
} from "@/lib/skin-check-validation";
import { formatPrompt } from "@/lib/skin-check-format";
import { saveLaterAnswers } from "@/lib/firebase/skin-checks";
import { echoOn } from "@/lib/echo-limits";
import { loadDashboard } from "@/components/dashboard/data";
import { echoScanIdFrom, questionsTarget, toDate, type Doc } from "@/components/dashboard/state";
import { formatDate } from "@/components/dashboard/format";
import { btnPrimary, btnSecondary, card, EmptyState, ErrorState, eyebrow, h2, LoadingState, PageHeader, ReloadButton, SignedOutCard, textLink } from "@/components/ui/page";
import type { SkinCheckAnswers, StepAnswerValue } from "@/types/skin-check";
import { EchoBubble } from "./EchoBubble";
import { StepAnswer } from "./StepAnswer";
import { QUESTIONS_COPY as Q } from "./questionsCopy";

// TD-33 (1): answer the questions of a check that skipped them (Home and
// Account lead here). The same questions and inputs as the check flow, one
// part at a time, saved once to users/{uid}/laterAnswers/{scanId}; the check
// itself is never edited. Echo can answer about that check afterwards.

type Load =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; target: Doc | null; isEcho: boolean };

const QUESTION_SECTIONS = SECTIONS.filter((s) => QUESTION_SECTION_IDS.has(s.id));
const NO_SCAN = { status: "idle" } as const;

export function LaterQuestions() {
  const { user, loading } = useAuth();
  const { setSession } = useSkinCheckSession();
  const [load, setLoad] = useState<Load>({ kind: "loading" });

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad({ kind: "loading" });
    loadDashboard(user.uid).then(
      (d) => {
        if (!active) return;
        const target = questionsTarget(user.uid, d.checks, d.analyses, d.laterAnswers);
        setLoad({ kind: "ready", target, isEcho: target !== null && echoScanIdFrom(user.uid, d.analyses) === target.id });
      },
      (error) => {
        console.error("[questions] load failed", error instanceof Error ? error.name : error);
        if (active) setLoad({ kind: "error" });
      }
    );
    return () => {
      active = false;
    };
  }, [user]);

  if (loading || (user && load.kind === "loading")) return <LoadingState label={Q.pageTitle} blocks={["h-80"]} />;
  if (!user) return <SignedOutCard body={Q.signedOut} />;
  if (load.kind === "error") return <ErrorState body={Q.loadFailed} action={<ReloadButton label="Try again" />} />;
  if (load.kind !== "ready" || !load.target) {
    return (
      <EmptyState
        body={Q.nothing}
        action={
          <Link href="/dashboard" className={btnPrimary}>
            {Q.home}
          </Link>
        }
      />
    );
  }
  return <QuestionsForm uid={user.uid} target={load.target} isEcho={load.isEcho} onSaved={() => setSession(null)} />;
}

function QuestionsForm({ uid, target, isEcho, onSaved }: { uid: string; target: Doc; isEcho: boolean; onSaved: () => void }) {
  // The check's own name, age and gender decide which questions apply (the gender branch).
  const basics = (target.data.answers ?? {}) as SkinCheckAnswers;
  const [answers, setAnswers] = useState<SkinCheckAnswers>({});
  // Memory only, like in the check flow (TD-33 (2)).
  const [productNames, setProductNames] = useState<ProductNames>({});
  const [part, setPart] = useState(0);
  const [state, setState] = useState<"answering" | "saving" | "failed" | "saved">("answering");
  const headingRef = useRef<HTMLHeadingElement>(null);
  const stepRefs = useRef(new Map<string, HTMLDivElement>());

  const all = { ...basics, ...answers };
  const parts = QUESTION_SECTIONS.map((s) => ({ ...s, steps: s.steps.filter((step) => !step.condition || step.condition(all)) })).filter((s) => s.steps.length > 0);
  const section = parts[Math.min(part, parts.length - 1)]!;
  const last = part >= parts.length - 1;
  const complete = section.steps.every((step) => isStepAnswerValid(step, answers[step.id] ?? defaultAnswerFor(step)));
  const date = toDate(target.data.createdAt);

  // A new part: its heading takes focus, so a screen reader hears where it is.
  useEffect(() => {
    if (part > 0) headingRef.current?.focus();
  }, [part]);

  function setAnswer(stepId: string, value: StepAnswerValue) {
    setAnswers((prev) => ({ ...prev, [stepId]: value }));
    if (stepId === "current_products") setProductNames((prev) => keptProductNames(value, prev));
  }

  function focusNextStep(stepId: string) {
    const i = section.steps.findIndex((s) => s.id === stepId);
    const next = section.steps[i + 1];
    if (next) stepRefs.current.get(next.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function save() {
    if (state === "saving") return;
    setState("saving");
    try {
      await saveLaterAnswers(uid, target.id, answers, productNames);
      onSaved();
      setState("saved");
    } catch (error) {
      // The code only: the message can carry the document path.
      console.error("[questions] save failed", (error as { code?: string })?.code ?? "unknown");
      setState("failed");
    }
  }

  if (state === "saved") {
    return (
      <section aria-labelledby="saved-title" role="status" className={`${card} flex flex-col items-start gap-4`}>
        <h2 id="saved-title" className={h2}>
          {Q.saved}
        </h2>
        {isEcho && echoOn() && <p className="text-brand-muted">{Q.savedEcho}</p>}
        <div className="flex flex-wrap gap-3">
          {isEcho && echoOn() && (
            <Link href="/echo" className={btnPrimary}>
              {Q.goEcho}
            </Link>
          )}
          <Link href="/dashboard" className={isEcho && echoOn() ? btnSecondary : btnPrimary}>
            {Q.home}
          </Link>
        </div>
      </section>
    );
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-brand-muted">{date ? Q.pageIntro(formatDate(date)) : Q.pageIntroNoDate}</p>
      <section aria-labelledby="part-title" className={`${card} flex flex-col gap-8`}>
        <div>
          <p className={`${eyebrow} mb-1`}>
            Part {part + 1} of {parts.length}
          </p>
          <h2 id="part-title" ref={headingRef} tabIndex={-1} className={`${h2} outline-none`}>
            {section.label}
          </h2>
        </div>
        {section.steps.map((step) => (
          <div
            key={step.id}
            ref={(el) => {
              if (el) stepRefs.current.set(step.id, el);
              else stepRefs.current.delete(step.id);
            }}
            className="flex flex-col gap-4"
          >
            <EchoBubble message={formatPrompt(step.prompt, all)} />
            <StepAnswer
              step={step}
              value={answers[step.id] ?? defaultAnswerFor(step)}
              onChange={(v) => setAnswer(step.id, v)}
              onCommit={() => focusNextStep(step.id)}
              scan={NO_SCAN}
              onScanChange={() => undefined}
              answers={all}
              scanId={target.id}
              onSaved={() => false}
              productNames={productNames}
              onProductNameChange={(key: ProductNameKey, text: string) => setProductNames((prev) => ({ ...prev, [key]: text }))}
            />
          </div>
        ))}
        {state === "failed" && (
          <p role="alert" className="text-brand-error">
            {Q.saveFailed}
          </p>
        )}
        {!complete && (
          <p id="part-incomplete" className="-mb-4 text-sm text-brand-muted">
            {Q.answerAll}
          </p>
        )}
        <div className="flex flex-col gap-3 border-t border-brand-line pt-5 sm:flex-row">
          {/* aria-disabled, not disabled: the button keeps focus while it waits (map.md). */}
          <button
            type="button"
            className={btnPrimary}
            aria-disabled={!complete || state === "saving"}
            aria-describedby={complete ? undefined : "part-incomplete"}
            onClick={() => {
              if (!complete) return;
              if (last) void save();
              else {
                setPart((p) => p + 1);
                window.scrollTo({ top: 0 });
              }
            }}
          >
            {last ? (state === "saving" ? Q.saving : Q.save) : Q.continue}
          </button>
          {part > 0 && (
            <button type="button" className={btnSecondary} onClick={() => setPart((p) => p - 1)}>
              {Q.back}
            </button>
          )}
          {part === 0 && (
            <Link href="/dashboard" className={textLink}>
              {Q.notNow}
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}

/** The page: the shell's header, then the questions. */
export function LaterQuestionsPage() {
  return (
    <>
      <PageHeader title={Q.pageTitle} />
      <LaterQuestions />
    </>
  );
}
