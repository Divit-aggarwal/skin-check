"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { ECHO_REGION_LABELS, type EchoRegion } from "@/lib/echo-regions";
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

// One check's readings: whole face, or one face area, picked with the chips.
// Band words only, all in the same neutral style, so no band reads as good or
// bad news. No score, no overlay, no other check.
export function CheckReadings({ view, face = true, stack = false }: { view: CheckView; face?: boolean; stack?: boolean }) {
  const [area, setArea] = useState<EchoRegion | null>(null);
  // No drawing of areas when there are no readings to go with it.
  const showFace = face && view.areas.length > 0 && view.bands !== null;
  const shown = area ? view.areas.find((a) => a.region === area)?.bands ?? null : view.bands;
  const chips: { key: EchoRegion | null; label: string }[] = [
    { key: null, label: C.current.wholeFace },
    ...view.areas.map((a) => ({ key: a.region, label: a.label })),
  ];

  return (
    <div className="flex flex-col gap-5">
      {view.bands && view.areas.length > 0 && (
        <div role="group" aria-label={C.current.areaPicker} className="flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.label}
              type="button"
              aria-pressed={area === c.key}
              onClick={() => setArea(c.key)}
              className="min-h-11 rounded-full border border-brand-line bg-brand-paper px-4 text-sm font-medium aria-pressed:border-brand-action aria-pressed:bg-brand-action aria-pressed:text-white"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}
      <div className={showFace && !stack ? "grid items-center gap-6 md:grid-cols-[minmax(0,300px)_1fr]" : "flex flex-col gap-6"}>
        {showFace && (
          <div className="rounded-2xl bg-brand-paper p-3">
            <FaceDrawing selected={area} labels={ECHO_REGION_LABELS} />
          </div>
        )}
        <div className="min-w-0">
          <h3 className="mb-1 font-semibold">{area ? ECHO_REGION_LABELS[area] : C.current.wholeFace}</h3>
          <ReadingRows bands={shown} />
        </div>
      </div>
      {view.areas.length > 0 && view.bands && <p className="text-sm text-brand-muted">{C.current.areaNote}</p>}
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
