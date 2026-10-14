"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronLeft, ChevronRight } from "lucide-react";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/format";
import { FaceDrawing } from "@/components/dashboard/FaceDrawing";
import type { DashboardData } from "@/components/dashboard/data";
import type { Bands, Dashboard, HistoryRow } from "@/components/dashboard/state";
import { ECHO_REGION_LABELS } from "@/lib/echo-regions";
import { echoOn } from "@/lib/echo-limits";
import { isEarlyEstimate, METRIC_LABELS, SHOWN_METRICS, type ShownMetric } from "@/lib/skin-check-skus";
import { useRoutine } from "@/components/routine/useRoutine";
import { daysLoggedLast7 } from "@/lib/routine/streak";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { IconWell, MetricTile, READING_ICON, TabBar } from "@/components/ui/kit";
import { card, EmptyState, eyebrow, h2, textLink } from "@/components/ui/page";
import { CHECKS_COPY as K } from "./copy";
import { readingHistory } from "./readings";
import { Thumb } from "./Thumb";

// TD-50 screens 10, 11 and 12 inside /checks (views by query, no new route).
// Readings are level words only, in ink; identity colours on icons only. No
// change between checks is shown anywhere (TD-24, TD-47 (4), D-24): where the
// mockups have a delta or a graph, MetricTile's empty footer is the slot.

/** TD-24 (1): the fixed line, wherever level words from a check are shown. */
export const fixedLine = "rounded-card bg-brand-100 px-4 py-3 text-brand-text";

const early = (m: ShownMetric) => (isEarlyEstimate(m) ? C.table.earlyEstimate : undefined);

/** The five whole-face readings as tiles; each opens that reading at each check (11). */
function ReadingTiles({ bands }: { bands: Bands }) {
  return (
    <div className="flex flex-col gap-2">
      <p className={eyebrow}>{C.current.wholeFace}</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {bands.map((b) => (
          <li key={b.metric}>
            <Link href={`/checks?reading=${b.metric}`} className="block h-full rounded-card transition-colors duration-fast [&>div]:h-full hover:[&>div]:bg-brand-50">
              <MetricTile reading={b.metric} label={b.label} level={b.band} tag={early(b.metric)} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** The five readings as links (11's chip row; the Readings view when the newest reading cannot be read). */
function ReadingPicker({ current }: { current: ShownMetric | null }) {
  return <TabBar label={K.pickReading} current={current ?? ""} tabs={SHOWN_METRICS.map((m) => ({ key: m, label: METRIC_LABELS[m], href: `/checks?reading=${m}` }))} />;
}

/* ─── 10: Overview (phones; from 1024px the opened newest check sits beside the list) ─── */

export function LatestReading({ dashboard }: { dashboard: Dashboard }) {
  const router = useRouter();
  const current = dashboard.current;
  if (current.kind !== "reading")
    return (
      <section aria-labelledby="latest-title" className={`${card} flex flex-col gap-2`}>
        <p className={eyebrow}>{K.latest}</p>
        <h2 id="latest-title" className={h2}>{C.current.noneTitle}</h2>
        <p>{C.current.none}</p>
      </section>
    );
  const view = current.view;
  // TD-46: the areas open Echo only on the check Echo talks about.
  const tappable = echoOn() && dashboard.echoScanId === view.scanId;
  return (
    <section aria-labelledby="latest-title" className={`${card} flex flex-col gap-4`}>
      <div>
        <p className={eyebrow}>{K.latest}</p>
        <h2 id="latest-title" className={`${h2} mt-1`}>{C.current.checkedOn(formatDate(view.date))}</h2>
      </div>
      {dashboard.newerCheckNotShown && <p className="text-sm">{C.current.newerNotShown}</p>}
      {view.bands ? (
        <>
          {view.areas.length > 0 && (
            <div className="flex flex-col items-center gap-2 rounded-card bg-brand-50 p-4">
              <FaceDrawing labels={ECHO_REGION_LABELS} available={view.areas.map((a) => a.region)} onArea={tappable ? (r) => router.push(`/echo?region=${r}`) : undefined} areaLabel={C.chat.askAbout} />
              {tappable && <p className="text-center text-sm text-brand-text-muted">{K.areasHint}</p>}
            </div>
          )}
          <p className={fixedLine}>{C.history.pastLine}</p>
          <ReadingTiles bands={view.bands} />
          {view.source === "legacy" && <p className="text-sm text-brand-text-muted">{C.legacyNote}</p>}
        </>
      ) : (
        <p>{C.current.unreadable}</p>
      )}
      <Link href={`/checks/${encodeURIComponent(view.scanId)}`} className={textLink}>
        {C.current.openCheck}
        <ChevronRight aria-hidden size={16} />
      </Link>
    </section>
  );
}

/** The routine strip: products and days logged. A card of its own, never inside the readings card (D-12). */
export function RoutineStrip() {
  const routine = useRoutine();
  if (routine.failed) return <p role="alert" className={card}>{ROUTINE_COPY.error}</p>;
  if (!routine.data) return <div role="status" aria-label={ROUTINE_COPY.loading} className="h-36 animate-pulse rounded-card bg-brand-50 motion-reduce:animate-none" />;
  const { routine: items, products, events, today } = routine.data;
  const nameOf = (id: string) => products.find((p) => p.id === id)?.name ?? ROUTINE_COPY.otherProduct;
  return (
    <section aria-labelledby="routine-title" className={`${card} flex flex-col gap-3`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 id="routine-title" className={h2}>{C.routine.title}</h2>
        <Link href="/routine" className={textLink}>
          {ROUTINE_COPY.open}
          <ChevronRight aria-hidden size={16} />
        </Link>
      </div>
      {items.length > 0 ? (
        <ul className="flex flex-wrap gap-2">
          {items.map((i) => (
            <li key={i.productId} className="rounded-full bg-brand-50 px-3 py-1.5 text-sm">
              <span className="font-medium text-brand-text">{nameOf(i.productId)}</span> <span className="text-brand-text-muted">{ROUTINE_COPY.slot[i.schedule.slot]}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-brand-text-muted">{ROUTINE_COPY.empty}</p>
      )}
      <div className="flex items-center gap-3 rounded-tile bg-brand-100 p-3">
        <IconWell icon={CalendarCheck} className="bg-brand-surface" />
        <p>
          <span className="block text-xl font-semibold text-brand-text">{K.routineDays(daysLoggedLast7(events, today))}</span>
          <span className="text-sm text-brand-text-muted">{K.routineDaysNote}</span>
        </p>
      </div>
    </section>
  );
}

/* ─── 12: Readings ─────────────────────────────────────────────────────── */

export function ReadingsView({ dashboard }: { dashboard: Dashboard }) {
  const current = dashboard.current;
  if (current.kind !== "reading") return <EmptyState body={C.current.none} />;
  const view = current.view;
  return (
    <section aria-labelledby="readings-title" className="flex max-w-3xl flex-col gap-4">
      <div>
        <h2 id="readings-title" className={h2}>{C.current.checkedOn(formatDate(view.date))}</h2>
        {view.bands && <p className="mt-1 text-brand-text-muted">{K.readingsIntro}</p>}
      </div>
      {dashboard.newerCheckNotShown && <p className="text-sm">{C.current.newerNotShown}</p>}
      {view.bands ? (
        <>
          <p className={fixedLine}>{C.history.pastLine}</p>
          <ReadingTiles bands={view.bands} />
          {view.source === "legacy" && <p className="text-sm text-brand-text-muted">{C.legacyNote}</p>}
        </>
      ) : (
        <>
          <p>{C.current.unreadable}</p>
          <ReadingPicker current={null} />
        </>
      )}
    </section>
  );
}

/* ─── 11: one reading at each check ────────────────────────────────────── */

export function ReadingView({ uid, metric, dashboard, data }: { uid: string; metric: ShownMetric; dashboard: Dashboard; data: DashboardData }) {
  // Already newest first (the history order); never re-ordered by a level.
  const rows = readingHistory(uid, dashboard.history, data.checks, data.analyses, metric);
  const label = METRIC_LABELS[metric];
  const latest = rows[0];
  const { icon, well } = READING_ICON[metric];
  return (
    <section aria-labelledby="reading-title" className="flex max-w-3xl flex-col gap-4">
      <Link href="/checks?view=readings" className={`${textLink} self-start`}>
        <ChevronLeft aria-hidden size={16} />
        {K.allReadings}
      </Link>
      <ReadingPicker current={metric} />
      <div className="flex items-center gap-3">
        <IconWell icon={icon} className={well} />
        <div>
          <h2 id="reading-title" className={h2}>{label}</h2>
          {early(metric) && <p className="text-sm text-brand-text-muted">{early(metric)}</p>}
        </div>
      </div>
      <p className="text-brand-text-muted">{K.readingIntro}</p>
      {latest ? (
        <>
          <p className={fixedLine}>{C.history.pastLine}</p>
          {/* Comparability gate: checks read by different software versions are not used together. */}
          {dashboard.trend.engineBoundary && <p className="text-sm text-brand-text-muted">{C.trend.boundary}</p>}
          {/* The newest level. Its empty footer is the slot for a change display, if a later decision allows one (TD-50 e). */}
          <MetricTile reading={metric} label={label} level={latest.band ?? C.current.noReading} tag={early(metric)} context={K.readingAt(formatDate(latest.date))} />
          <ol className={`${card} divide-y divide-brand-border !p-0`}>
            {rows.map((r) => (
              <li key={r.scanId}>
                <Link href={`/checks/${encodeURIComponent(r.scanId)}`} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-brand-50">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-semibold text-brand-text">{formatDate(r.date)}</span>
                    {r.legacy && <span className="text-sm text-brand-text-muted">{C.history.kind.legacy}</span>}
                  </span>
                  <span className="font-semibold text-brand-text">{r.band ?? C.current.noReading}</span>
                  <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-text-muted" />
                </Link>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>{C.current.none}</p>
      )}
    </section>
  );
}

/* ─── 12: Photos ───────────────────────────────────────────────────────── */

export function PhotosView({ history }: { history: readonly HistoryRow[] }) {
  // H27: a claimed photo shows only if /api/checks/photo finds the stored object.
  const kept = history.filter((r) => r.photoClaimed);
  if (kept.length === 0) return <EmptyState body={K.photosNone} />;
  return (
    <section aria-labelledby="photos-title" className="flex max-w-3xl flex-col gap-4">
      <h2 id="photos-title" className="sr-only">{K.photos}</h2>
      <p className="text-brand-text-muted">{K.photosIntro}</p>
      <p className={fixedLine}>{C.history.pastLine}</p>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {kept.map((r) => {
          const date = formatDate(r.date);
          return (
            <li key={r.scanId}>
              <Link href={`/checks/${encodeURIComponent(r.scanId)}`} aria-label={C.history.openLabel(date)} className="relative block rounded-tile">
                <Thumb key={r.scanId} scanId={r.scanId} date={date} size="tile" fallback={<span className="grid aspect-[3/4] w-full place-items-center rounded-tile bg-brand-50 p-3 text-center text-sm text-brand-text-muted">{K.photoNone}</span>} />
                <span aria-hidden className="absolute bottom-2 left-2 rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-brand-text">{date}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
