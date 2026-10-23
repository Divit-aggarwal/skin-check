"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Activity, CalendarCheck, Camera, ChevronRight, ClipboardList, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { CheckReadings, KnownAndNotKnown, PhotoCheckLine } from "@/components/dashboard/CheckReadings";
import { useKeptPhoto } from "@/components/mesh/useKeptPhoto";
import { formatDate } from "@/components/dashboard/format";
import type { DashboardData } from "@/components/dashboard/data";
import { READING_ORDER, seriesChecks, useChecksData } from "./series";
import { deriveDashboard, pastCheck, productNamesOf, questionsDone, questionsTarget, type Dashboard } from "@/components/dashboard/state";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { productNameLabel, type ProductNameKey } from "@/lib/skin-check-validation";
import { useRoutine } from "@/components/routine/useRoutine";
import { mergeTimeline, dayOf } from "@/components/timeline/timeline";
import { TimelineList } from "@/components/timeline/TimelineList";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { AccountButton, btnPrimary, btnSecondary, card, EmptyState, SignedOutCard, ErrorState, eyebrow, h2, LoadingState, page, PageHeader, ReloadButton, subtitle, textLink, titlePage, titleSub } from "@/components/ui/page";
import { AppHeader, Arrow, IconWell, TabBar } from "@/components/ui/kit";
import { readingsOverTime } from "@/lib/readings/series";
import { LevelTile } from "./OverTime";
import { isShownMetric, type ShownMetric } from "@/lib/skin-check-skus";
import { CHECKS_COPY as K } from "./copy";
import { Thumb } from "./Thumb";
import { fixedLine, LatestReading, NextRow, PhotosView, ReadingsView, ReadingView, RoutineStrip } from "./ChecksTabs";
import { echoOn } from "@/lib/echo-limits";

// G03 3.3 / 3.4, TD-50 screens 09–13. /checks views by query (no new route):
// Overview (10: the newest reading, the routine strip, every check by date),
// ?view=readings (12), ?reading=<key> (11: one reading at each check),
// ?view=photos (12: kept photos), ?view=timeline (13). /checks/[scanId] (09):
// one opened check with its OWN readings and the fixed line (TD-24 (1)).
// Phone: one view at a time. From 1024px the Overview is the list on the left
// and the opened check on the right (TD-25 (1), from direction B).

type View = "overview" | "readings" | "photos" | "timeline";

export function ChecksView({ openId }: { openId: string | null }) {
  const { user, loading } = useAuth();
  const load = useChecksData(user);
  const params = useSearchParams();
  const asked = params.get("reading");
  const reading: ShownMetric | null = !openId && asked && isShownMetric(asked) ? asked : null;
  const v = params.get("view");
  const view: View = openId ? "overview" : reading ? "readings" : v === "timeline" || v === "readings" || v === "photos" ? v : "overview";

  const dashboard = useMemo(() => (user && load.kind === "ready" ? deriveDashboard(user.uid, load.data.checks, load.data.analyses) : null), [user, load]);

  // An opened check on a phone has its own back row; the page title stays for
  // screen readers, and the List/Timeline tabs stay on a wide screen, where
  // the list is still on the left (flow review G03).
  const tabs = (
    <TabBar
      fill
      label={K.views}
      current={view}
      tabs={[
        { key: "overview", label: K.overview, href: "/checks" },
        { key: "readings", label: K.readings, href: "/checks?view=readings" },
        { key: "timeline", label: K.timeline, href: "/checks?view=timeline" },
      ]}
    />
  );
  const newest = dashboard?.history[0];
  // G37 screen 10: wordmark, "Your Skin Twin", the last check's date, the tabs.
  const listHeader = (
    <>
      <AppHeader right={<AccountButton />} />
      <header className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="min-w-[11rem] flex-1">
          <h1 className={titlePage}>{K.twinTitle}</h1>
          <p className={`mt-1 ${subtitle}`}>{K.twinIntro}</p>
        </div>
        {newest && (
          <Link href={`/checks/${encodeURIComponent(newest.scanId)}`} className="flex shrink-0 items-center gap-2 rounded-card bg-brand-100 py-2 pl-2 pr-1.5">
            <IconWell icon={Activity} size={36} className="bg-brand-surface" />
            <span className="flex flex-col">
              <span className="text-xs text-brand-text-muted">{K.lastCheck}</span>
              <span className="text-sm font-semibold text-brand-text">{formatDate(newest.date)}</span>
            </span>
            <ChevronRight aria-hidden size={16} className="text-brand-text-muted" />
          </Link>
        )}
      </header>
      <div className="mb-4">{tabs}</div>
    </>
  );
  // An opened check: on a phone its own back row (the title for screen readers);
  // from 1024px, where the list stays on the left, the same header as the list,
  // so the section keeps one title and one full-width tab bar (polish lane #10).
  const header = openId ? (
    <>
      <div className="lg:hidden">
        <PageHeader kicker={K.kicker} title={K.title} phoneCompact />
      </div>
      <div className="hidden lg:block">{listHeader}</div>
    </>
  ) : (
    listHeader
  );

  if (loading || (user && load.kind === "loading"))
    return (
      <main className={page}>
        {header}
        <LoadingState label={C.loading} blocks={["h-20", "h-20", "h-20", "h-20"]} />
      </main>
    );
  if (!user)
    return (
      <main className={page}>
        {header}
        <SignedOutCard body={C.signedOut} />
      </main>
    );
  if (load.kind !== "ready" || !dashboard)
    return (
      <main className={page}>
        {header}
        <ErrorState body={C.error} action={<ReloadButton label={C.home.tryAgain} />} />
      </main>
    );

  if (dashboard.history.length === 0)
    return (
      <main className={page}>
        {header}
        <EmptyState body={C.empty} action={<Link href="/skin-check" className={btnPrimary}>{C.firstCheck}</Link>} />
      </main>
    );

  // 11: its own back row and title (the reading's name is the page's one h1).
  if (reading)
    return (
      <main className={page}>
        <ReadingView uid={user.uid} metric={reading} dashboard={dashboard} data={load.data} />
      </main>
    );

  if (!openId && view !== "overview")
    return (
      <main className={page}>
        {header}
        {view === "timeline" ? (
          <TimelineSection history={dashboard.history} />
        ) : view === "readings" ? (
          <ReadingsView dashboard={dashboard} />
        ) : (
          <PhotosView history={dashboard.history} />
        )}
      </main>
    );

  // The newest check opens on the right on a wide screen when none is picked.
  const selected = openId ?? dashboard.history[0]!.scanId;
  return (
    <main className={page}>
      {openId ? (
        <div className="lg:hidden">
          <AppHeader back="/checks" backLabel={K.back} right={<AccountButton />} />
        </div>
      ) : null}
      {header}
      {/* 10 on a phone: the newest reading, then the routine strip (a card of its own, D-12). From 1024px the opened newest check is on the right instead. */}
      {!openId && (
        <div className="mb-6 flex flex-col gap-6 lg:hidden">
          <LatestReading dashboard={dashboard} />
          <RoutineStrip />
        </div>
      )}
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className={`flex flex-col gap-4 lg:col-span-5 ${openId ? "hidden lg:flex" : ""}`}>
          <CheckList dashboard={dashboard} data={load.data} uid={user.uid} selected={selected} />
        </div>
        <div className={`lg:sticky lg:top-6 lg:col-span-7 ${openId ? "" : "hidden lg:block"}`}>
          <CheckDetail uid={user.uid} scanId={selected} data={load.data} dashboard={dashboard} />
        </div>
      </div>
    </main>
  );
}

/** Date, kind, photo check and a kept photo. Never a reading. */
function CheckList({ dashboard, data, uid, selected }: { dashboard: Dashboard; data: DashboardData; uid: string; selected: string | null }) {
  return (
    <section aria-labelledby="list-title" className={`${card} overflow-hidden !p-0`}>
      <div className="flex items-center justify-between gap-4 border-b border-brand-border px-4 py-4 sm:px-5">
        <h2 id="list-title" className={h2}>
          {C.history.title}
        </h2>
        <p className="text-sm text-brand-text-muted">{K.count(dashboard.history.length)}</p>
      </div>
      <ul className="divide-y divide-brand-border">
        {dashboard.history.map((row) => {
          const check = pastCheck(uid, row.scanId, data.checks, data.analyses);
          const date = formatDate(row.date);
          return (
            <li key={row.scanId}>
              <Link
                href={`/checks/${encodeURIComponent(row.scanId)}`}
                aria-label={C.history.openLabel(date)}
                aria-current={selected === row.scanId ? "page" : undefined}
                className="group flex min-h-16 items-center gap-3 px-4 py-3 transition-colors duration-fast hover:bg-brand-50 aria-[current=page]:bg-brand-50 sm:px-5"
              >
                <IconWell icon={Camera} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-brand-text">{date}</span>
                  <span className="text-sm text-brand-text-muted">{C.history.kind[row.kind]}</span>
                  {check?.photoCheck && <span className="text-sm text-brand-text-muted">{C.photoCheck[check.photoCheck]}</span>}
                </span>
                {row.photoClaimed && <Thumb key={row.scanId} scanId={row.scanId} date={date} />}
                <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-text-muted group-hover:text-brand-text" />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** One opened check: its own readings, always with the fixed line. */
function CheckDetail({ uid, scanId, data, dashboard }: { uid: string; scanId: string; data: DashboardData; dashboard: Dashboard }) {
  const check = pastCheck(uid, scanId, data.checks, data.analyses);
  const router = useRouter();
  // TD-37 (2): the mesh over this check's kept photo; the face drawing without one.
  const photo = useKeptPhoto(check?.scanId ?? null, check?.photoClaimed ?? false);
  // G37 screen 09: each reading's level with the change slot, over the checks up to this one (lib/readings/series.ts).
  const over = useMemo(() => {
    const at = check?.date;
    return at ? readingsOverTime(seriesChecks(uid, data, dashboard.history), "all", at) : null;
  }, [uid, data, dashboard.history, check?.date]);
  // The back link above (phone) and the list beside it (desktop) are the ways on.
  if (!check) return <EmptyState title={C.history.notFound} body={K.notFoundBody} />;
  const date = formatDate(check.date);
  const newest = dashboard.echoScanId === check.scanId;
  const record = data.checks.find((c) => c.id === check.scanId);
  // TD-33 (2): the typed names are shown here, on the user's own check, and nowhere else.
  const names = productNamesOf(record, data.laterAnswers);
  const skipped = record?.data.questionnaire === "skipped" && !questionsDone(record, data.laterAnswers);
  const canAnswer = questionsTarget(uid, data.checks, data.analyses, data.laterAnswers)?.id === check.scanId;
  const n = dashboard.history.length - dashboard.history.findIndex((h) => h.scanId === check.scanId);
  return (
    <div className="flex flex-col gap-5 lg:rounded-card lg:border lg:border-brand-border lg:bg-brand-surface lg:p-5">
      <section aria-labelledby="check-title" className="flex flex-col gap-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className={`${eyebrow} mb-1 hidden lg:block`}>{K.opened}</p>
            <h2 id="check-title" className={titleSub}>
              {C.history.checkFrom(date)}
            </h2>
            <p className={`mt-1 ${subtitle}`}>{C.history.kind[check.kind]}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-card bg-brand-100 px-3 py-2">
            <CalendarCheck aria-hidden size={22} className="text-brand-700" />
            <span className="flex flex-col text-sm">
              <span className="font-semibold text-brand-700">{date}</span>
              <span className="text-brand-text-muted">{K.checkNumber(n, dashboard.history.length)}</span>
            </span>
          </div>
        </div>
        {/* TD-39: one photo. The thumbnail only until the large photo below can be shown. */}
        {check.photoClaimed && !photo && <Thumb key={check.scanId} scanId={check.scanId} date={date} size={112} />}
        {check.photoCheck && <PhotoCheckLine text={C.photoCheck[check.photoCheck]} />}
        {check.view ? (
          <>
            {/* TD-24 (1): on every opened check with readings, never behind a toggle. */}
            <p className={fixedLine}>{C.history.pastLine}</p>
            {/* G37: the photo wide, as the mockup's photo row (the mesh follows the same cover crop). */}
            <div className="[&_[data-testid=face-photo]]:aspect-[4/3] [&_[data-testid=face-photo]]:max-w-none">
              {/* TD-46: on the newest check, a face area opens Echo on it (Echo talks about the newest check only). */}
              <CheckReadings view={{ ...check.view, photoCheck: null }} photo={photo} onArea={newest && echoOn() ? (r) => router.push(`/echo?region=${r}`) : undefined} />
            </div>
          </>
        ) : (
          <p>{K.noReadings}</p>
        )}
      </section>
      {/* Outside the section above: there each reading's name shows once, in the table's header. */}
      {check.view?.bands && over && (
        <ul aria-label={K.wholeFace} className="-mx-4 grid auto-cols-[calc((100%-1rem)/2.5)] grid-flow-col gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid-flow-row sm:grid-cols-3 sm:px-0">
          {READING_ORDER.map((m) => (
            <li key={m}>
              <LevelTile metric={m} level={check.view!.bands!.find((b) => b.metric === m)!.band} slot={over.series.find((s) => s.metric === m)!.change} />
            </li>
          ))}
        </ul>
      )}
      {check.view?.bands && (
        <div className="border-t border-brand-border pt-5">
          <KnownAndNotKnown />
        </div>
      )}
      {skipped && (
        <div className="flex flex-col items-start gap-1 border-t border-brand-border pt-5">
          <p className="text-brand-text-muted">{Q.checkSkipped}</p>
          {canAnswer ? (
            <Link href="/questions" className={textLink}>
              {Q.answerLink}
            </Link>
          ) : (
            <p className="text-sm text-brand-text-muted">{Q.checkSkippedClosed}</p>
          )}
        </div>
      )}
      {Object.keys(names).length > 0 && (
        <div className="flex flex-col gap-2 border-t border-brand-border pt-5">
          <h3 className="text-base font-semibold text-brand-text">{Q.namedTitle}</h3>
          <dl className="flex flex-col gap-2">
            {(Object.entries(names) as [ProductNameKey, string][]).map(([key, text]) => (
              <div key={key}>
                <dt className="text-sm text-brand-text-muted">{productNameLabel(key)}</dt>
                <dd className="whitespace-pre-wrap break-words">{text}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <div className="flex flex-col gap-3">
        <h3 className={h2}>{K.nextTitle}</h3>
        <div className={`${card} flex flex-col divide-y divide-brand-border !py-1`}>
          <NextRow href="/routine" icon={ClipboardList} title={K.keepRoutine} body={K.keepRoutineBody} />
          <NextRow href="/skin-check" icon={CalendarCheck} title={K.weekly} body={K.weeklyBody} />
          {/* TD-29 (5): no way into Echo while it is switched off; Echo talks about the newest check only. */}
          {newest && echoOn() && <NextRow href="/echo" icon={MessageCircle} title={K.askEcho} body={K.askEchoBody} />}
        </div>
        {!newest && check.view && <p className="text-sm text-brand-text-muted">{K.echoNewestOnly}</p>}
      </div>
      <Link href="/routine" className={`${btnPrimary} w-full`}>
        {ROUTINE_COPY.open}
        <Arrow />
      </Link>
      <Link href="/skin-check" className={`${btnSecondary} w-full`}>
        {C.newCheck}
      </Link>
    </div>
  );
}

function TimelineSection({ history }: { history: Dashboard["history"] }) {
  const routine = useRoutine();
  const items = mergeTimeline(history, routine.data?.events ?? [], routine.data?.today ?? dayOf(new Date()));
  const nameOf = (id: string) => routine.data?.products.find((p) => p.id === id)?.name ?? ROUTINE_COPY.otherProduct;
  return (
    <section aria-label={K.timeline} className={`${card} max-w-3xl !py-1`}>
      {routine.failed && <p role="alert" className="py-3">{ROUTINE_COPY.error}</p>}
      {/* No photos here: a column of faces between routine entries would read as before and after (D-12). Photos stay on the list and the opened check. */}
      <TimelineList items={items} nameOf={nameOf} />
    </section>
  );
}
