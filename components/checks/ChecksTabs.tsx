"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarCheck, ChevronRight, ClipboardList, type LucideIcon } from "lucide-react";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/format";
import { FaceDrawing } from "@/components/dashboard/FaceDrawing";
import type { DashboardData } from "@/components/dashboard/data";
import type { Bands, Dashboard, HistoryRow } from "@/components/dashboard/state";
import { ECHO_REGION_LABELS } from "@/lib/echo-regions";
import { echoOn } from "@/lib/echo-limits";
import { EARLY_ESTIMATE_METRICS, isEarlyEstimate, METRIC_LABELS, SHOWN_METRICS, type ShownMetric } from "@/lib/skin-check-skus";
import { useRoutine } from "@/components/routine/useRoutine";
import { daysLoggedLast7 } from "@/lib/routine/streak";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { AppHeader, ChangeSlot, IconWell, MetricTile, PhotoTile, ProductTile, READING_ICON, SegmentedControl, TabBar } from "@/components/ui/kit";
import { readingsOverTime } from "@/lib/readings/series";
import type { SeriesWindow } from "@/lib/feature-contracts/readings-series";
import { OwnPhotos, SeriesTimeline } from "./OverTime";
import { stepOf } from "@/components/routine/RoutineSteps";
import { FacePhoto } from "@/components/mesh/FacePhoto";
import { useKeptPhoto } from "@/components/mesh/useKeptPhoto";
import { READING_ORDER, seriesChecks, usePhotoUrls, WINDOWS } from "./series";
import { AccountButton, card, EmptyState, eyebrow, h2, textLink } from "@/components/ui/page";
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
            <MetricTile reading={b.metric} label={b.label} level={b.band} tag={early(b.metric)} href={`/checks?reading=${b.metric}`} />
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

// Screen 10 (G37): the newest check as the mockup's hero. The user's own kept
// photo with the face mesh (the face drawing without one), beside the five
// level words, each with a bar that shows the level (one, two or three thirds),
// never a score. No labels are pinned on the photo: the engine returns no
// places on the face, so a label there would point at nothing it measured.
const LEVEL_WIDTH = { Low: "w-1/3", Moderate: "w-2/3", Elevated: "w-full" } as const;

export function LatestReading({ dashboard }: { dashboard: Dashboard }) {
  const router = useRouter();
  const current = dashboard.current;
  const view = current.kind === "reading" ? current.view : null;
  const claimed = dashboard.history.find((h) => h.scanId === view?.scanId)?.photoClaimed ?? false;
  const photo = useKeptPhoto(view?.scanId ?? null, claimed);
  if (!view)
    return (
      <section aria-labelledby="latest-title" className={`${card} flex flex-col gap-2`}>
        <p className={eyebrow}>{K.latest}</p>
        <h2 id="latest-title" className={h2}>{C.current.noneTitle}</h2>
        <p>{C.current.none}</p>
      </section>
    );
  // TD-46: the areas open Echo only on the check Echo talks about.
  const tappable = echoOn() && dashboard.echoScanId === view.scanId;
  const drawing =
    view.areas.length > 0 ? (
      <div className="grid h-full place-items-center p-3">
        <FaceDrawing labels={ECHO_REGION_LABELS} available={view.areas.map((a) => a.region)} onArea={tappable ? (r) => router.push(`/echo?region=${r}`) : undefined} areaLabel={C.chat.askAbout} />
      </div>
    ) : null;
  const bands = view.bands ? READING_ORDER.map((m) => view.bands!.find((b) => b.metric === m)!) : null;
  return (
    <section aria-labelledby="latest-title" className="flex flex-col gap-3">
      <div className="grid grid-cols-[54fr_46fr] overflow-hidden rounded-card bg-brand-900 text-white">
        {/* The photo fills its half: the mesh component's own frame is stretched to it. */}
        <div className="relative min-h-[216px] bg-brand-50 [&>div>div]:aspect-auto [&>div>div]:h-full [&>div>div]:max-w-none [&>div>div]:rounded-none [&>div]:h-full">
          {photo ? <FacePhoto photo={photo} /> : drawing}
        </div>
        <div className="flex min-w-0 flex-col px-3 pb-2 pt-3">
          <h2 id="latest-title" className="border-b border-white/15 pb-2 text-[15px] font-semibold leading-tight">
            <Link href="/checks?view=readings" className="flex min-h-11 items-start justify-between gap-1">
              {K.stateTitle}
              <ChevronRight aria-hidden size={18} className="mt-0.5 shrink-0" />
            </Link>
          </h2>
          <h3 className="sr-only">{C.current.checkedOn(formatDate(view.date))}</h3>
          {bands ? (
            <ul className="flex flex-col">
              {bands.map((b) => {
                const { icon, well } = READING_ICON[b.metric];
                return (
                  <li key={b.metric}>
                    <Link href={`/checks?reading=${b.metric}`} className="flex min-h-11 items-center gap-2 rounded-tile hover:bg-white/5">
                      <IconWell icon={icon} size={28} className={well} />
                      <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="truncate text-[13px] leading-tight">{b.label}</span>
                        <span className="flex items-center gap-2">
                          <span aria-hidden className="h-1.5 flex-1 rounded-full bg-white/20">
                            <span className={`block h-full rounded-full bg-white/85 ${LEVEL_WIDTH[b.band]}`} />
                          </span>
                          <span className="text-xs font-medium">{b.band}</span>
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="pt-2 text-sm">{C.current.unreadable}</p>
          )}
        </div>
      </div>
      {dashboard.newerCheckNotShown && <p className="text-sm">{C.current.newerNotShown}</p>}
      {bands && (
        <>
          <p className="text-xs text-brand-text-muted">{K.earlyNote(EARLY_ESTIMATE_METRICS.map((m) => METRIC_LABELS[m]).join(", "))}</p>
          <p className={`${fixedLine} text-sm`}>{C.history.pastLine}</p>
        </>
      )}
      {view.source === "legacy" && <p className="text-sm text-brand-text-muted">{C.legacyNote}</p>}
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
    <section aria-labelledby="routine-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <h2 id="routine-title" className={h2}>{C.routine.title}</h2>
        <Link href="/routine" className={`${textLink} text-sm`}>
          {ROUTINE_COPY.open}
          <ChevronRight aria-hidden size={16} />
        </Link>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        {items.length > 0 ? (
          <ul className={`${card} flex min-w-0 divide-x divide-brand-border overflow-x-auto !p-0 [scrollbar-width:none]`}>
            {items.map((i) => (
              <li key={i.productId} className="flex min-w-[76px] flex-1 flex-col items-center gap-1.5 px-2 py-3 text-center">
                <ProductTile step={stepOf(i.productId)} size={48} />
                <span className="line-clamp-2 text-[13px] font-medium leading-tight text-brand-text">{nameOf(i.productId)}</span>
                <span className="text-xs text-brand-text-muted">{ROUTINE_COPY.slot[i.schedule.slot]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className={`${card} text-brand-text-muted`}>{ROUTINE_COPY.empty}</p>
        )}
        <div className="flex w-[124px] flex-col gap-1 rounded-card bg-brand-100 p-3">
          <CalendarCheck aria-hidden size={22} className="text-brand-700" />
          <p className="text-[13px] font-medium leading-tight text-brand-700">{K.consistency}</p>
          <p className="mt-auto text-[28px] font-semibold leading-none text-brand-700">{K.daysOf7(daysLoggedLast7(events, today))}</p>
          <p className="text-xs text-brand-text-muted">{K.daysThisWeek}</p>
        </div>
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
  const [win, setWin] = useState<SeriesWindow>("12w");
  const checks = useMemo(() => seriesChecks(uid, data, dashboard.history), [uid, data, dashboard.history]);
  const series = useMemo(() => readingsOverTime(checks, win, new Date()).series.find((s) => s.metric === metric)!, [checks, win, metric]);
  // The change slot is over every check, as the engine's gate counts them.
  const slot = useMemo(() => readingsOverTime(checks, "all", new Date()).series.find((s) => s.metric === metric)!.change, [checks, metric]);
  const kept = [...dashboard.history].reverse().filter((h) => h.photoClaimed && checks.some((c) => c.view.scanId === h.scanId));
  const newestKept = kept.at(-1);
  const urls = usePhotoUrls(newestKept ? [newestKept.scanId] : []);
  const label = METRIC_LABELS[metric];
  const latest = rows[0];
  const { icon, well } = READING_ICON[metric];
  const newestSrc = newestKept && urls?.get(newestKept.scanId);
  return (
    <section aria-labelledby="reading-title" className="flex flex-col gap-4">
      <div className="pt-2">
        <AppHeader back="/checks?view=readings" backLabel={K.allReadings} right={<AccountButton />} />
      </div>
      <div>
        <h1 id="reading-title" className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-text sm:text-[32px]">{label}</h1>
        <p className="mt-1 text-[15px] text-brand-text-muted">{K.readingLead}</p>
      </div>
      <ReadingPicker current={metric} />
      {latest ? (
        <>
          <div className="grid grid-cols-2 gap-3">
            {newestKept && newestSrc ? (
              <PhotoTile src={newestSrc} alt={K.photoAlt(formatDate(newestKept.date))} label={formatDate(newestKept.date)} fallback={K.photoNone} className="h-full [&>img]:h-full" />
            ) : newestKept && !urls ? (
              <div aria-hidden className="animate-pulse rounded-tile bg-brand-50 motion-reduce:animate-none" />
            ) : (
              <p className="grid place-items-center rounded-tile bg-brand-50 p-3 text-center text-sm text-brand-text-muted">{K.photoNone}</p>
            )}
            <div className={`flex flex-col gap-2 rounded-card p-4 ${TINT[metric]}`}>
              <span className="flex items-center gap-2">
                <IconWell icon={icon} size={32} className={`${well} bg-white/70`} />
                <span className="text-[13px] font-medium text-brand-text">{label}</span>
              </span>
              <p className="text-[28px] font-semibold leading-none text-brand-text">{latest.band ?? C.current.noReading}</p>
              <p className="text-xs text-brand-text-muted">
                {early(metric) && <span className="mr-2 rounded-full bg-white/70 px-2 py-0.5">{early(metric)}</span>}
                {K.readingAt(formatDate(latest.date))}
              </p>
              <div className="mt-auto">
                <ChangeSlot slot={slot} />
              </div>
            </div>
          </div>
          <p className={`${fixedLine} text-sm`}>{C.history.pastLine}</p>
          {/* Comparability gate: checks read by different software versions are not used together. */}
          {dashboard.trend.engineBoundary && <p className="text-sm text-brand-text-muted">{C.trend.boundary}</p>}
          <section aria-labelledby="time-title" className={`${card} flex flex-col gap-3`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="time-title" className={h2}>{K.overTime}</h2>
              <div className="w-[200px]">
                <SegmentedControl label={K.windowLabel} value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w, label: w === "all" ? "All" : w.toUpperCase() }))} />
              </div>
            </div>
            {series.points.length > 0 ? <SeriesTimeline series={series} /> : <p className="text-sm text-brand-text-muted">{K.noneInWindow}</p>}
          </section>
          <section aria-labelledby="own-photos-title" className="flex flex-col gap-3">
            <h2 id="own-photos-title" className={h2}>{K.yourPhotos}</h2>
            <OwnPhotos checks={kept} empty={<p className="text-sm text-brand-text-muted">{K.noPhotos}</p>} />
          </section>
          <section aria-labelledby="next-title" className="flex flex-col gap-3">
            <h2 id="next-title" className={h2}>{K.nextTitle}</h2>
            <div className={`${card} flex flex-col divide-y divide-brand-border !py-1`}>
              <NextRow href="/routine" icon={ClipboardList} title={K.keepRoutine} body={K.keepRoutineBody} />
              <NextRow href="/skin-check" icon={CalendarCheck} title={K.weekly} body={K.weeklyBody} />
            </div>
          </section>
          <section aria-labelledby="each-title" className="flex flex-col gap-3">
            <h2 id="each-title" className={h2}>{K.eachCheck}</h2>
            <p className="text-sm text-brand-text-muted">{K.readingIntro}</p>
            <ol className={`${card} divide-y divide-brand-border !p-0`}>
              {rows.map((r) => (
                <li key={r.scanId}>
                  <Link href={`/checks/${encodeURIComponent(r.scanId)}`} className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-brand-50">
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-semibold text-brand-text">{formatDate(r.date)}</span>
                      {r.legacy && <span className="text-sm text-brand-text-muted">{C.history.kind.legacy}</span>}
                      {r.otherVersion && <span className="text-sm text-brand-text-muted">{C.history.otherVersion}</span>}
                    </span>
                    <span className="font-semibold text-brand-text">{r.band ?? C.current.noReading}</span>
                    <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-text-muted" />
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        </>
      ) : (
        <p>{C.current.none}</p>
      )}
    </section>
  );
}

const TINT: Record<ShownMetric, string> = {
  redness: "bg-concern-redness-soft",
  oiliness: "bg-concern-oiliness-soft",
  texture: "bg-concern-texture-soft",
  blemishes: "bg-concern-blemishes-soft",
  pigment: "bg-concern-pigment-soft",
};

/** One "what to do next" row: an action, never a claim about the skin. */
export function NextRow({ href, icon, title, body }: { href: string; icon: LucideIcon; title: string; body: string }) {
  return (
    <Link href={href} className="flex min-h-16 items-center gap-3 py-3">
      <IconWell icon={icon} size={44} />
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-brand-text">{title}</span>
        <span className="block text-sm text-brand-text-muted">{body}</span>
      </span>
      <ChevronRight aria-hidden size={20} className="shrink-0 text-brand-text-muted" />
    </Link>
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
      {/* One per row: two photos side by side read as before/after (TD-47 (4), D-12; owner answer 8). */}
      <ul className="flex max-w-sm flex-col gap-4">
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
