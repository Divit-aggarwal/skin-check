"use client";

import { useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import type { ToldTopic } from "@/lib/told-topics";
import { ECHO_REGION_LABELS, ECHO_REGIONS, type EchoRegion } from "@/lib/echo-regions";
import { DASHBOARD_COPY as C } from "./copy";
import { FaceDrawing } from "./FaceDrawing";
import type { Bands, CheckView } from "./state";

export { formatDate } from "./format";

/** The photo-quality line, with its icon. */
export function PhotoCheckLine({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 text-sm text-brand-muted">
      <ShieldCheck aria-hidden size={16} className="mt-0.5 shrink-0" />
      <span>{text}</span>
    </p>
  );
}

/** Metric on the left, band word on the right, both in ink. Every band looks the same: no colour, no score, no bar. */
export function ReadingRows({ bands }: { bands: Bands | null }) {
  if (!bands) return <p>{C.current.unreadable}</p>;
  return (
    <dl className="divide-y divide-brand-line">
      {bands.map((b) => (
        <div key={b.metric} className="flex min-h-12 items-center justify-between gap-4 py-2">
          <dt className="text-brand-ink">{b.label}</dt>
          <dd className="font-medium text-brand-ink">{b.band}</dd>
        </div>
      ))}
    </dl>
  );
}

// One check's readings: whole face, or one face area, chosen on the face
// drawing (the same drawing on Home, an opened check and the results screen).
// Band words only, all in the same neutral style, so no band reads as good or
// bad news. No score, no overlay, no other check.
export function CheckReadings({ view, stack = false }: { view: CheckView; stack?: boolean }) {
  const [area, setArea] = useState<EchoRegion | null>(null);
  // No drawing of areas when there are no readings to go with it.
  const showFace = view.areas.length > 0 && view.bands !== null;
  const shown = area ? view.areas.find((a) => a.region === area)?.bands ?? null : view.bands;

  return (
    <div className="flex flex-col gap-5">
      <div className={showFace && !stack ? "grid items-start gap-6 md:grid-cols-[minmax(0,300px)_1fr]" : "flex flex-col gap-6"}>
        {showFace && (
          <div role="group" aria-label={C.current.areaPicker} className="flex flex-col items-center gap-3 rounded-2xl bg-brand-linen p-4">
            <FaceDrawing selected={area} labels={ECHO_REGION_LABELS} available={view.areas.map((a) => a.region)} onSelect={setArea} />
            <button
              type="button"
              aria-pressed={area === null}
              onClick={() => setArea(null)}
              className="min-h-11 rounded-full border border-brand-line bg-brand-paper px-5 text-sm font-semibold aria-pressed:border-brand-forest aria-pressed:bg-brand-mist aria-pressed:text-brand-forest"
            >
              {C.current.wholeFace}
            </button>
            <p className="text-center text-sm text-brand-muted">{C.current.areaHint}</p>
            {ECHO_REGIONS.filter((r) => !view.areas.some((a) => a.region === r)).map((r) => (
              <p key={r} className="text-center text-sm text-brand-muted">
                {C.current.noAreaReading(ECHO_REGION_LABELS[r])}
              </p>
            ))}
          </div>
        )}
        <div className="min-w-0">
          <h3 aria-live="polite" className="mb-1 text-base font-semibold">{area ? ECHO_REGION_LABELS[area] : C.current.wholeFace}</h3>
          <ReadingRows bands={shown} />
        </div>
      </div>
      {showFace && <p className="text-sm text-brand-muted">{C.current.areaNote}</p>}
      {view.hardToRead.length > 0 && <p className="text-sm">{C.current.hardToRead(view.hardToRead.join(", "))}</p>}
      {view.photoCheck && <PhotoCheckLine text={C.photoCheck[view.photoCheck]} />}
      {view.source === "legacy" && view.bands && <p className="text-sm text-brand-muted">{C.legacyNote}</p>}
    </div>
  );
}

export function KnownAndNotKnown() {
  return (
    <div className="grid gap-4 text-sm text-brand-muted sm:grid-cols-2">
      <div>
        <h3 className="mb-1 font-semibold text-brand-ink">{C.current.knownTitle}</h3>
        <p>{C.current.known}</p>
      </div>
      <div>
        <h3 className="mb-1 font-semibold text-brand-ink">{C.current.notKnownTitle}</h3>
        <ul className="list-disc pl-5">
          {C.current.notKnown.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** The line near the chips and readings saying where each one comes from (TD-37 (3)). */
export function SourcesLine() {
  return <p className="text-sm text-brand-muted">{C.told.sources}</p>;
}

/** What the user told us on one topic, or the invitation when the questions were skipped. Never a band or level. */
function ToldBody({ noun, told, canAnswer }: { noun: string; told: ToldTopic | null; canAnswer: boolean }) {
  if (told === null) {
    return (
      <>
        <p>{C.told.skipped(noun)}</p>
        {canAnswer ? (
          <Link href="/questions" className="inline-flex min-h-11 items-center font-medium text-brand-forest underline underline-offset-4">
            {Q.answerLink}
          </Link>
        ) : (
          <p className="text-sm text-brand-muted">{Q.checkSkippedClosed}</p>
        )}
      </>
    );
  }
  if (told.lines.length === 0) return <p>{C.told.nothing(noun)}</p>;
  return (
    <ul className="flex flex-col gap-1">
      {told.lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/**
 * One topic the photo does not measure (TD-37 (3)), for the results chip:
 * labelled as the user's own answer. `canAnswer`: this check's questions can
 * still be answered (questionsTarget), so the link goes to /questions.
 */
export function ToldPanel({ label, told, canAnswer }: { label: string; told: ToldTopic | null; canAnswer: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-eyebrow">{C.told.title}</p>
      <ToldBody noun={label.toLowerCase()} told={told} canAnswer={canAnswer} />
      <p className="text-sm text-brand-muted">{C.told.ownAnswer}</p>
    </div>
  );
}

/** Home, an opened check and Echo's panel: the three topics under the readings, from the check's answers. */
export function ToldTopics({ topics, canAnswer }: { topics: ToldTopic[] | null; canAnswer: boolean }) {
  return (
    <section aria-labelledby="told-title" className="flex flex-col gap-3 border-t border-brand-line pt-5">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-eyebrow">{C.told.title}</p>
        <h3 id="told-title" className="font-display text-base font-semibold tracking-[-0.01em]">{C.told.listTitle}</h3>
      </div>
      {topics === null ? (
        <ToldBody noun={C.told.listTitle.toLowerCase()} told={null} canAnswer={canAnswer} />
      ) : (
        topics.map((t) => (
          <div key={t.topic} className="flex flex-col gap-1">
            <h4 className="font-semibold">{t.label}</h4>
            <ToldBody noun={t.label.toLowerCase()} told={t} canAnswer={canAnswer} />
          </div>
        ))
      )}
      <p className="text-sm text-brand-muted">{C.told.ownAnswer}</p>
    </section>
  );
}
