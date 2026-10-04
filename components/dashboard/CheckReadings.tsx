import { DASHBOARD_COPY as C } from "./copy";
import type { CheckView } from "./state";

export const formatDate = (date: Date | null) =>
  date ? date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : C.history.justNow;

// One check's readings: band words only, all in the same neutral style, so no
// band reads as good or bad news. No score, no overlay, no other check.
export function CheckReadings({ view }: { view: CheckView }) {
  return (
    <div className="flex flex-col gap-4">
      {view.bands ? (
        <dl className="flex flex-col divide-y divide-text/10 rounded-lg bg-canvas px-4">
          {view.bands.map((b) => (
            <div key={b.metric} className="flex items-center justify-between py-3">
              <dt className="text-body text-text">{b.label}</dt>
              <dd className="text-body text-text">{b.band}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-body text-text/70">{C.current.unreadable}</p>
      )}
      {view.hardToRead.length > 0 && <p className="text-sm text-text/70">{C.current.hardToRead(view.hardToRead.join(", "))}</p>}
      {view.photoCheck && <p className="text-sm text-text/70">{C.photoCheck[view.photoCheck]}</p>}
      {view.source === "legacy" && <p className="text-sm text-text/70">{C.legacyNote}</p>}
    </div>
  );
}

export function KnownAndNotKnown() {
  return (
    <div className="flex flex-col gap-3 text-sm text-text/70">
      <div>
        <h3 className="font-medium text-text">{C.current.knownTitle}</h3>
        <p>{C.current.known}</p>
      </div>
      <div>
        <h3 className="font-medium text-text">{C.current.notKnownTitle}</h3>
        <ul className="list-disc pl-5">
          {C.current.notKnown.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
