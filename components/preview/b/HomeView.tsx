"use client";
// PREVIEW ONLY (direction B). Home for a user with a reading: summary strip,
// latest check (the only Home place with readings), trend card, today's
// routine (local state only), Echo, new check and the latest timeline items.
import { useState } from "react";
import Link from "next/link";
import { clsx } from "clsx";
import { DASHBOARD_COPY as D } from "@/components/dashboard/copy";
import type { Trend } from "@/components/dashboard/state";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { B_COPY as B } from "./copy";
import type { Latest } from "./data";
import { ECHO_HREF, NEW_CHECK_HREF, ROUTINE_HREF, TIMELINE_HREF, checkHref } from "./links";
import { RegionTabs } from "./RegionTabs";
import type { Slot, TimelineItem } from "./types";
import { AreaTable, ItemRow, Page, PageHeader, Readings, SectionHead, StatusLine } from "./ui";

type Props = { today: string; latest: Latest; trend: Trend; newerNotShown: boolean; echoReady: boolean; slots: Slot[]; recent: TimelineItem[] };
type Log = Record<string, "used" | "skipped" | undefined>;

export function HomeView({ today, latest, trend, newerNotShown, echoReady, slots, recent }: Props) {
  const [log, setLog] = useState<Log>({});
  const logged = slots.filter((s) => log[s.key]).length;

  return (
    <Page>
      <PageHeader eyebrow={B.home.eyebrow(today)} title={B.home.title} />

      <section aria-labelledby="b-summary">
        <h2 id="b-summary" className="sr-only">
          {B.home.summary}
        </h2>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-[var(--line)] lg:grid-cols-4">
          <Cell label={B.home.latestCheck} value={latest.date} />
          <Cell label={B.home.photoCheck} value={latest.photoCheck ? B.home.photoCheckShort[latest.photoCheck] : B.home.none} />
          <Cell label={B.home.startingPoint} value={B.home.nOf(trend.count, trend.needed)} />
          <Cell label={B.home.routineToday} value={B.home.logged(logged, slots.length)} />
        </dl>
      </section>

      <div className="mt-4 flex flex-col gap-4 sm:mt-6 sm:gap-6 lg:grid lg:grid-cols-12 lg:items-start">
        <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-6">
          <LatestCard latest={latest} newerNotShown={newerNotShown} />
          <TrendCard trend={trend} />
          <section aria-labelledby="b-recent" className="b-card order-5 overflow-hidden">
            <SectionHead
              id="b-recent"
              eyebrow={B.home.timelineEyebrow}
              title={B.home.timelineTitle}
              action={
                <Link href={TIMELINE_HREF} className="b-link inline-flex min-h-[44px] items-center text-[14px]">
                  {B.home.seeTimeline}
                </Link>
              }
            />
            <ul>
              {recent.map((it) => (
                <li key={it.key} className="b-row-line">
                  <ItemRow item={it} showDate />
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-6">
          <section aria-labelledby="b-routine" className="b-card order-2 overflow-hidden">
            <SectionHead id="b-routine" eyebrow={B.home.routineEyebrow} title={B.home.routineTitle} />
            {slots.length === 0 ? (
              <p className="px-4 py-4 sm:px-5">{B.home.routineNone}</p>
            ) : (
              <ul>
                {slots.map((s) => (
                  <li key={s.key} className="b-row-line flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5">
                    <div className="min-w-0 flex-1 basis-40">
                      <p className="font-semibold leading-snug">{s.product}</p>
                      <p className="b-meta">{s.slotLabel}</p>
                    </div>
                    <div className="flex gap-2">
                      {(["used", "skipped"] as const).map((st) => (
                        <button
                          key={st}
                          type="button"
                          aria-pressed={log[s.key] === st}
                          aria-label={B.home[st](s.product, B.slot[s.slot])}
                          onClick={() => setLog((l) => ({ ...l, [s.key]: l[s.key] === st ? undefined : st }))}
                          className={clsx(
                            "min-h-[44px] rounded-full border px-4 text-[14px] font-medium transition-colors duration-150",
                            log[s.key] === st ? "border-[var(--ink)] bg-[var(--ink)] text-white" : "bg-white hover:bg-[var(--surface)]"
                          )}
                        >
                          {R[st]}
                        </button>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t px-4 py-1 sm:px-5">
              <Link href={ROUTINE_HREF} className="b-link inline-flex min-h-[44px] items-center text-[14px]">
                {D.routine.link}
              </Link>
            </div>
          </section>

          <section aria-labelledby="b-echo" className="b-card order-4 overflow-hidden">
            <SectionHead id="b-echo" eyebrow={B.home.echoEyebrow} title={D.chat.title} />
            <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
              <p>{echoReady ? D.chat.body : D.chat.needsReading}</p>
              {echoReady && (
                <Link href={ECHO_HREF} className="b-btn-2 self-start">
                  {D.chat.button}
                </Link>
              )}
            </div>
          </section>

          <section aria-labelledby="b-new" className="b-card order-6 overflow-hidden">
            <SectionHead id="b-new" eyebrow={B.home.newCheckEyebrow} title={B.nav.newCheck} />
            <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
              <p>{B.home.newCheckBody}</p>
              <Link href={NEW_CHECK_HREF} className="b-btn-2 self-start">
                {D.newCheck}
              </Link>
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white px-4 py-3 sm:px-5">
      <dt className="b-eyebrow">{label}</dt>
      <dd className="mt-1 font-semibold leading-snug">{value}</dd>
    </div>
  );
}

function LatestCard({ latest, newerNotShown }: { latest: Latest; newerNotShown: boolean }) {
  return (
    <section aria-labelledby="b-latest" className="b-card order-1 overflow-hidden">
      <SectionHead
        id="b-latest"
        eyebrow={B.home.latestCheck}
        title={D.current.title}
        action={
          <Link href={checkHref(latest.scanId)} className="b-link hidden min-h-[44px] items-center text-[14px] sm:inline-flex">
            {B.home.openCheck}
          </Link>
        }
      />
      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <div className="flex flex-col gap-1">
          <p className="font-semibold">{B.home.checkedOn(latest.date)}</p>
          {latest.photoLine && <StatusLine>{latest.photoLine}</StatusLine>}
        </div>
        {newerNotShown && <p className="b-fixed">{D.current.newerNotShown}</p>}

        {!latest.wholeFace ? (
          <p>{D.current.unreadable}</p>
        ) : (
          <>
            <div className="flex flex-col gap-5 md:hidden">
              <div>
                <h3 className="b-h3 mb-2">{B.home.wholeFace}</h3>
                <Readings readings={latest.wholeFace} />
              </div>
              {latest.regions && (
                <div>
                  <h3 className="b-h3 mb-2">{B.home.byArea}</h3>
                  <RegionTabs areas={latest.regions} label={B.home.areaTabs} />
                </div>
              )}
            </div>
            <div className="hidden md:block">
              <AreaTable caption={B.home.tableCaption(latest.date)} wholeLabel={B.home.wholeFace} wholeFace={latest.wholeFace} regions={latest.regions ?? []} />
            </div>
          </>
        )}
        {latest.hardToRead.length > 0 && <p className="b-meta">{D.current.hardToRead(latest.hardToRead.join(", "))}</p>}
        {latest.legacy && <p className="b-meta">{D.legacyNote}</p>}

        <div className="grid gap-4 border-t pt-4 text-[14px] leading-[1.45] text-[var(--muted)] md:grid-cols-2">
          <div>
            <h3 className="font-semibold text-[var(--ink)]">{D.current.knownTitle}</h3>
            <p className="mt-1">{D.current.known}</p>
          </div>
          <div>
            <h3 className="font-semibold text-[var(--ink)]">{D.current.notKnownTitle}</h3>
            <ul className="mt-1 list-disc pl-5">
              {D.current.notKnown.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        </div>

        <Link href={checkHref(latest.scanId)} className="b-btn-2 sm:hidden">
          {B.home.openCheck}
        </Link>
      </div>
    </section>
  );
}

function TrendCard({ trend }: { trend: Trend }) {
  return (
    <section aria-labelledby="b-trend" className="b-card order-3 overflow-hidden">
      <SectionHead id="b-trend" eyebrow={B.home.trendEyebrow} title={D.trend.title} />
      <div className="flex flex-col gap-2 px-4 py-4 sm:px-5">
        {trend.kind === "empty" ? (
          <p>{D.trend.empty}</p>
        ) : (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <p className="font-semibold">{D.trend.notEnough}</p>
            <p>{D.trend.count(trend.count, trend.needed)}</p>
          </div>
        )}
        <p className="b-meta">{trend.kind === "set" ? D.trend.set : D.trend.howItForms(trend.needed)}</p>
        {trend.engineBoundary && <p className="b-meta">{D.trend.boundary}</p>}
        {trend.legacyPresent && <p className="b-meta">{D.trend.legacy}</p>}
      </div>
    </section>
  );
}
