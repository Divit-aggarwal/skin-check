"use client";

import { ShieldCheck } from "lucide-react";
import { ECHO_REGION_LABELS, ECHO_REGIONS, type EchoRegion } from "@/lib/echo-regions";
import { isEarlyEstimate } from "@/lib/skin-check-skus";
import { DASHBOARD_COPY as C } from "./copy";
import { FaceDrawing } from "./FaceDrawing";
import { FacePhoto } from "@/components/mesh/FacePhoto";
import type { CheckView } from "./state";

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

/**
 * One table (TD-39 (3), TD-40): the five levels for the whole face and each
 * face area. Levels only, all in ink: no number, no colour, no bar. On a phone
 * the table scrolls inside its own box with the Area column pinned and a hint
 * below it; the page itself never scrolls sideways.
 */
export function ReadingsTable({ view }: { view: Pick<CheckView, "bands" | "areas"> }) {
  if (!view.bands) return <p>{C.current.unreadable}</p>;
  const rows = [{ key: "whole", label: C.current.wholeFace, bands: view.bands }, ...view.areas.map((a) => ({ key: a.region, label: a.label, bands: a.bands }))];
  return (
    <div className="flex flex-col gap-2">
      <h3 aria-hidden className="text-base font-semibold text-brand-text">{C.table.caption}</h3>
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-left text-xs sm:text-sm">
          <caption className="sr-only">{C.table.caption}</caption>
          <thead>
            <tr className="border-b border-brand-line align-bottom text-brand-muted">
              <th scope="col" className="sticky left-0 bg-brand-paper py-2 pr-1 font-semibold sm:pr-2">{C.table.area}</th>
              {view.bands.map((b) => (
                <th key={b.metric} scope="col" className="px-1 py-2 font-semibold sm:px-2">
                  {b.label}
                  {isEarlyEstimate(b.metric) && <span className="block text-[11px] font-normal leading-tight sm:text-xs">{C.table.earlyEstimate}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-brand-line">
            {rows.map((r) => (
              <tr key={r.key} className="h-12">
                <th scope="row" className={`sticky left-0 bg-brand-paper pr-1 text-brand-ink sm:pr-2 ${r.key === "whole" ? "font-semibold" : "font-medium"}`}>{r.label}</th>
                {view.bands!.map((b) => (
                  <td key={b.metric} className="px-1 text-brand-ink sm:px-2">{r.bands?.find((x) => x.metric === b.metric)?.band ?? C.current.noReading}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-brand-muted sm:hidden">{C.table.swipe}</p>
    </div>
  );
}

// One check: its picture, then the readings table below it (TD-39). The
// picture is the kept photo with the face mesh (`photo`), or the face drawing
// without one or until the mesh is ready. The results screen passes its own
// picture (the photo with both overlays). Nothing on it can be chosen.
// TD-46: `onArea` makes the drawing's areas tappable (Home opens Echo on that area).
export function CheckReadings({ view, photo = null, picture, onArea }: { view: CheckView; photo?: Blob | null; picture?: JSX.Element; onArea?: ((region: EchoRegion) => void) | undefined }) {
  // No drawing of areas when there are no readings to go with it.
  const drawing =
    view.areas.length > 0 && view.bands !== null ? <FaceDrawing labels={ECHO_REGION_LABELS} available={view.areas.map((a) => a.region)} onArea={onArea} areaLabel={C.chat.askAbout} /> : undefined;
  const own = picture ?? (photo ? <FacePhoto photo={photo} fallback={drawing} /> : drawing);
  return (
    <div className="flex flex-col gap-5">
      {own && (
        <div className="flex flex-col items-center gap-3 rounded-card bg-brand-50 p-4">
          {own}
          {!picture && photo && view.bands && <p className="text-center text-sm text-brand-muted">{C.photo.mapsOnResults}</p>}
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
