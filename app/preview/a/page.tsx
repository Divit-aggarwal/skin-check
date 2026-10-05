// PREVIEW ONLY (direction A): Home. ?state=set (default) | building | empty | loading | error.
import Link from "next/link";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/CheckReadings";
import type { Dashboard } from "@/components/dashboard/state";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { DASHBOARDS, DATA, regionReadings } from "@/components/preview/fixtures";
import { A_COPY as A } from "@/components/preview/a/copy";
import { P, timeline, todaySlots } from "@/components/preview/a/data";
import { LatestCheck } from "@/components/preview/a/LatestCheck";
import { RoutineToday } from "@/components/preview/a/RoutineToday";
import { btnPrimary, btnSecondary, card, h2, ItemList, PageHeader, textLink } from "@/components/preview/a/ui";

const wrap = "mx-auto max-w-[1200px] px-4 pb-16 sm:px-6 lg:px-8";

export default function HomePage({ searchParams }: { searchParams: { state?: string } }) {
  const state = searchParams.state ?? "set";
  return (
    <div className={wrap}>
      <PageHeader kicker={A.home.eyebrow} title={C.title} />
      {state === "loading" ? <Loading /> : state === "error" ? <ErrorState /> : <Body state={state === "empty" || state === "building" ? state : "set"} />}
    </div>
  );
}

function Body({ state }: { state: "set" | "building" | "empty" }) {
  const d = DASHBOARDS[state];
  const items = timeline(d.history, DATA[state], state !== "empty");
  const view = d.current.kind === "reading" ? d.current.view : null;
  const regions = view ? regionReadings(view.scanId) : [];
  const notes = [
    ...(d.newerCheckNotShown ? [C.current.newerNotShown] : []),
    ...(view?.hardToRead.length ? [C.current.hardToRead(view.hardToRead.join(", "))] : []),
  ];

  return (
    <div className="grid gap-4 sm:gap-6 lg:grid-cols-12">
      <div className="flex flex-col gap-4 sm:gap-6 lg:col-span-8">
        {view?.bands ? (
          <LatestCheck
            date={formatDate(view.date)}
            href={`${P}/checks/${view.scanId}`}
            photoCheck={view.photoCheck ? C.photoCheck[view.photoCheck] : null}
            notes={notes}
            wholeFace={view.bands}
            regions={regions}
          />
        ) : (
          <EmptyHero />
        )}
        {items.length > 0 && (
          <section aria-labelledby="a-recent" className="rounded-2xl border p-5 sm:p-8">
            <h2 id="a-recent" className={h2}>
              {A.home.timelineTitle}
            </h2>
            <div className="mt-3">
              <ItemList items={items.slice(0, 4)} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-6 border-t pt-2">
              <Link href={`${P}/checks?view=timeline`} className={textLink}>
                {A.home.fullTimeline}
              </Link>
              <Link href={`${P}/checks`} className={textLink}>
                {A.home.allChecks}
              </Link>
            </div>
          </section>
        )}
      </div>

      <div className="flex flex-col gap-4 sm:gap-6 lg:col-span-4">
        <Trend trend={d.trend} />
        <section aria-labelledby="a-routine" className={card}>
          <h2 id="a-routine" className={h2}>
            {A.home.routineToday}
          </h2>
          <div className="mt-4">
            {state === "empty" ? <p className="text-[var(--a-muted)]">{R.empty}</p> : <RoutineToday slots={todaySlots()} />}
          </div>
          <Link href="#" className={`${textLink} mt-2`}>
            {state === "empty" ? R.add : C.routine.link}
          </Link>
        </section>
        <section aria-labelledby="a-echo" className="rounded-2xl bg-[var(--a-mist)] p-5 sm:p-6">
          <h2 id="a-echo" className={h2}>
            {A.home.echoTitle}
          </h2>
          <p className="mt-2">{d.echoScanId ? A.home.echoBody : C.chat.needsReading}</p>
          {d.echoScanId && (
            <Link href={`${P}/echo`} className={`${btnSecondary} mt-4 w-full bg-[var(--a-paper)]`}>
              {C.chat.button}
            </Link>
          )}
        </section>
        {state !== "empty" && (
          <section aria-labelledby="a-new" className="rounded-2xl border p-5 sm:p-6">
            <h2 id="a-new" className={h2}>
              {A.home.newCheckTitle}
            </h2>
            <p className="mt-2 text-[var(--a-muted)]">{A.home.newCheckBody}</p>
            <Link href="#" className={`${btnSecondary} mt-4 w-full`}>
              {C.newCheck}
            </Link>
          </section>
        )}
      </div>
    </div>
  );
}

function Trend({ trend: t }: { trend: Dashboard["trend"] }) {
  const lines = [
    t.kind === "set" ? C.trend.set : C.trend.howItForms(t.needed),
    ...(t.engineBoundary ? [C.trend.boundary] : []),
    ...(t.legacyPresent ? [C.trend.legacy] : []),
  ];
  return (
    <section aria-labelledby="a-trend" className={card}>
      <h2 id="a-trend" className={h2}>
        {C.trend.title}
      </h2>
      <p className="mt-4 text-[18px] font-semibold leading-tight">{t.kind === "empty" ? C.trend.empty : C.trend.notEnough}</p>
      <p className="mt-1 font-medium">{C.trend.count(t.count, t.needed)}</p>
      {lines.map((l) => (
        <p key={l} className="mt-3 text-[14px] leading-[1.45] text-[var(--a-muted)]">
          {l}
        </p>
      ))}
    </section>
  );
}

function EmptyHero() {
  return (
    <section aria-labelledby="a-empty" className="a-fade flex flex-col items-start gap-4 rounded-2xl bg-[var(--a-linen)] p-6 sm:p-10">
      <svg aria-hidden width="96" height="96" viewBox="0 0 96 96" fill="none" stroke="var(--a-accent)" strokeWidth="1.5" strokeLinecap="round">
        <path d="M48 10c-20 0-32 15-32 37 0 25 14 39 32 39s32-14 32-39c0-22-12-37-32-37Z" />
        <path d="M36 44q5-3 10 0M50 44q5-3 10 0M48 48v12q-3 2 0 4M40 70q8 5 16 0" />
        <circle cx="80" cy="18" r="6" stroke="var(--a-taupe)" />
      </svg>
      <h2 id="a-empty" className={h2}>
        {C.empty}
      </h2>
      <p className="max-w-prose">{A.home.emptyLead}</p>
      <Link href="#" className={btnPrimary}>
        {C.firstCheck}
      </Link>
    </section>
  );
}

function Loading() {
  const bone = "rounded-2xl bg-[var(--a-linen-2)] motion-safe:animate-pulse";
  return (
    <div role="status" className="grid gap-4 sm:gap-6 lg:grid-cols-12">
      <span className="sr-only">{C.loading}</span>
      <div aria-hidden className="flex flex-col gap-4 sm:gap-6 lg:col-span-8">
        <div className={`${bone} h-[460px]`} />
        <div className={`${bone} h-[260px]`} />
      </div>
      <div aria-hidden className="flex flex-col gap-4 sm:gap-6 lg:col-span-4">
        <div className={`${bone} h-[200px]`} />
        <div className={`${bone} h-[280px]`} />
        <div className={`${bone} h-[160px]`} />
      </div>
    </div>
  );
}

function ErrorState() {
  return (
    <div role="alert" className="flex max-w-xl flex-col items-start gap-3 rounded-2xl border border-[var(--a-error)] p-6 sm:p-8">
      <h2 className={h2}>{A.home.errorTitle}</h2>
      <p>{C.error}</p>
      <a href={P} className={`${btnPrimary} mt-2`}>
        {A.home.tryAgain}
      </a>
    </div>
  );
}
