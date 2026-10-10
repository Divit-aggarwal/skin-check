"use client";

import { ShieldCheck } from "lucide-react";
import { ECHO_REGION_LABELS, ECHO_REGIONS } from "@/lib/echo-regions";
import { DASHBOARD_COPY as C } from "./copy";
import { FaceDrawing } from "./FaceDrawing";
import { FacePhoto } from "@/components/mesh/FacePhoto";
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

/**
 * One table (TD-39 (3)): the Redness and Oiliness level for the whole face and
 * each face area. Levels only, all in ink: no number, no colour, no bar.
 */
export function ReadingsTable({ view }: { view: CheckView }) {
  if (!view.bands) return <p>{C.current.unreadable}</p>;
  const rows = [{ key: "whole", label: C.current.wholeFace, bands: view.bands }, ...view.areas.map((a) => ({ key: a.region, label: a.label, bands: a.bands }))];
  return (
    <table className="w-full table-fixed text-left">
      <caption className="mb-2 text-left font-display text-base font-semibold tracking-[-0.01em] text-brand-title">{C.table.caption}</caption>
      <thead>
        <tr className="border-b border-brand-line text-sm text-brand-muted">
          <th scope="col" className="py-2 pr-2 font-semibold">{C.table.area}</th>
          {view.bands.map((b) => (
            <th key={b.metric} scope="col" className="px-2 py-2 font-semibold">{b.label}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-brand-line">
        {rows.map((r) => (
          <tr key={r.key} className="h-12">
            <th scope="row" className={`pr-2 text-brand-ink ${r.key === "whole" ? "font-semibold" : "font-medium"}`}>{r.label}</th>
            {view.bands!.map((b) => (
              <td key={b.metric} className="px-2 text-brand-ink">{r.bands?.find((x) => x.metric === b.metric)?.band ?? C.current.noReading}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// One check: its picture, then the readings table below it (TD-39). The
// picture is the kept photo with the face mesh (`photo`), or the face drawing
// without one or until the mesh is ready. The results screen passes its own
// picture (the photo with both overlays). Nothing on it can be chosen.
export function CheckReadings({ view, photo = null, picture }: { view: CheckView; photo?: Blob | null; picture?: JSX.Element }) {
  // No drawing of areas when there are no readings to go with it.
  const drawing = view.areas.length > 0 && view.bands !== null ? <FaceDrawing labels={ECHO_REGION_LABELS} available={view.areas.map((a) => a.region)} /> : undefined;
  const own = picture ?? (photo ? <FacePhoto photo={photo} fallback={drawing} /> : drawing);
  return (
    <div className="flex flex-col gap-5">
      {own && (
        <div className="flex flex-col items-center gap-3 rounded-2xl bg-brand-linen p-4">
          {own}
          {!picture && view.bands && <p className="text-center text-sm text-brand-muted">{C.photo.mapsOnResults}</p>}
        </div>
      )}
      <ReadingsTable view={view} />
      {ECHO_REGIONS.filter((r) => view.bands && view.areas.length > 0 && !view.areas.some((a) => a.region === r)).map((r) => (
        <p key={r} className="text-sm text-brand-muted">
          {C.current.noAreaReading(ECHO_REGION_LABELS[r])}
        </p>
      ))}
      {view.areas.length > 0 && <p className="text-sm text-brand-muted">{C.current.areaNote}</p>}
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
