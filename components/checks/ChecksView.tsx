"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { CheckReadings, KnownAndNotKnown, PhotoCheckLine } from "@/components/dashboard/CheckReadings";
import { useKeptPhoto } from "@/components/mesh/useKeptPhoto";
import { formatDate } from "@/components/dashboard/format";
import { loadDashboard, type DashboardData } from "@/components/dashboard/data";
import { deriveDashboard, pastCheck, productNamesOf, questionsDone, questionsTarget, type Dashboard } from "@/components/dashboard/state";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { productNameLabel, type ProductNameKey } from "@/lib/skin-check-validation";
import { useRoutine } from "@/components/routine/useRoutine";
import { mergeTimeline, dayOf } from "@/components/timeline/timeline";
import { TimelineList } from "@/components/timeline/TimelineList";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { AccountButton, btnPrimary, btnSecondary, card, EmptyState, SignedOutCard, ErrorState, eyebrow, h2, LoadingState, page, PageHeader, ReloadButton, textLink } from "@/components/ui/page";
import { AppHeader, IconWell, TabBar } from "@/components/ui/kit";
import { isShownMetric, type ShownMetric } from "@/lib/skin-check-skus";
import { CHECKS_COPY as K } from "./copy";
import { Thumb } from "./Thumb";
import { fixedLine, LatestReading, PhotosView, ReadingsView, ReadingView, RoutineStrip } from "./ChecksTabs";
import { echoOn } from "@/lib/echo-limits";

// G03 3.3 / 3.4, TD-50 screens 09–13. /checks views by query (no new route):
// Overview (10: the newest reading, the routine strip, every check by date),
// ?view=readings (12), ?reading=<key> (11: one reading at each check),
// ?view=photos (12: kept photos), ?view=timeline (13). /checks/[scanId] (09):
// one opened check with its OWN readings and the fixed line (TD-24 (1)).
// Phone: one view at a time. From 1024px the Overview is the list on the left
// and the opened check on the right (TD-25 (1), from direction B).

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: DashboardData };
type View = "overview" | "readings" | "photos" | "timeline";

export function ChecksView({ openId }: { openId: string | null }) {
  const { user, loading } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const params = useSearchParams();
  const asked = params.get("reading");
  const reading: ShownMetric | null = !openId && asked && isShownMetric(asked) ? asked : null;
  const v = params.get("view");
  const view: View = openId ? "overview" : reading ? "readings" : v === "timeline" || v === "readings" || v === "photos" ? v : "overview";

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad({ kind: "loading" });
    loadDashboard(user.uid).then(
      (data) => active && setLoad({ kind: "ready", data }),
      (error) => {
        console.error("[checks] load failed", error instanceof Error ? error.name : error);
        if (active) setLoad({ kind: "error" });
      }
    );
    return () => {
      active = false;
    };
  }, [user]);

  const dashboard = useMemo(() => (user && load.kind === "ready" ? deriveDashboard(user.uid, load.data.checks, load.data.analyses) : null), [user, load]);

  // An opened check on a phone has its own back row; the page title stays for
  // screen readers, and the List/Timeline tabs stay on a wide screen, where
  // the list is still on the left (flow review G03).
  const header = (
    <PageHeader kicker={K.kicker} title={K.title} phoneCompact={Boolean(openId)}>
      <div className={`mt-5 ${openId ? "hidden lg:block" : ""}`}>
        <TabBar
          label={K.views}
          current={view}
          tabs={[
            { key: "overview", label: K.overview, href: "/checks" },
            { key: "readings", label: K.readings, href: "/checks?view=readings" },
            { key: "photos", label: K.photos, href: "/checks?view=photos" },
            { key: "timeline", label: K.timeline, href: "/checks?view=timeline" },
          ]}
        />
      </div>
    </PageHeader>
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

  if (!openId && view !== "overview")
    return (
      <main className={page}>
        {header}
        {view === "timeline" ? (
          <TimelineSection history={dashboard.history} />
        ) : reading ? (
          <ReadingView uid={user.uid} metric={reading} dashboard={dashboard} data={load.data} />
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
        <div className="pt-2 lg:hidden">
          <AppHeader back="/checks" backLabel={K.back} right={<AccountButton />} />
        </div>
      ) : null}
      {header}
      {/* 10 on a phone: the newest reading first. From 1024px the opened newest check is on the right instead. */}
      {!openId && (
        <div className="mb-4 lg:hidden">
          <LatestReading dashboard={dashboard} />
        </div>
      )}
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className={`flex flex-col gap-4 lg:col-span-5 ${openId ? "hidden lg:flex" : ""}`}>
          <CheckList dashboard={dashboard} data={load.data} uid={user.uid} selected={selected} />
          {/* D-12: a card of its own, below the list, never beside the readings. */}
          {!openId && (
            <div className="lg:hidden">
              <RoutineStrip />
            </div>
          )}
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
  // The back link above (phone) and the list beside it (desktop) are the ways on.
  if (!check) return <EmptyState title={C.history.notFound} body={K.notFoundBody} />;
  const date = formatDate(check.date);
  const newest = dashboard.echoScanId === check.scanId;
  const record = data.checks.find((c) => c.id === check.scanId);
  // TD-33 (2): the typed names are shown here, on the user's own check, and nowhere else.
  const names = productNamesOf(record, data.laterAnswers);
  const skipped = record?.data.questionnaire === "skipped" && !questionsDone(record, data.laterAnswers);
  const canAnswer = questionsTarget(uid, data.checks, data.analyses, data.laterAnswers)?.id === check.scanId;
  return (
    <section aria-labelledby="check-title" className={`${card} flex flex-col gap-5`}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`${eyebrow} mb-1`}>{K.opened}</p>
          <h2 id="check-title" className={h2}>
            {C.history.checkFrom(date)}
          </h2>
          <p className="mt-1 text-brand-text-muted">{C.history.kind[check.kind]}</p>
        </div>
        {/* TD-39: one photo. The thumbnail only until the large photo below can be shown. */}
        {check.photoClaimed && !photo && <Thumb key={check.scanId} scanId={check.scanId} date={date} size={112} />}
      </div>
      {check.photoCheck && <PhotoCheckLine text={C.photoCheck[check.photoCheck]} />}
      {check.view ? (
        <>
          {/* TD-24 (1): on every opened check with readings, never behind a toggle. */}
          <p className={fixedLine}>{C.history.pastLine}</p>
          {/* TD-46: on the newest check, a face area opens Echo on it (Echo talks about the newest check only). */}
          <CheckReadings view={{ ...check.view, photoCheck: null }} photo={photo} onArea={newest && echoOn() ? (r) => router.push(`/echo?region=${r}`) : undefined} />
          {check.view.bands && (
            <div className="border-t border-brand-border pt-5">
              <KnownAndNotKnown />
            </div>
          )}
        </>
      ) : (
        <p>{K.noReadings}</p>
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
      <div className="flex flex-wrap gap-3 border-t border-brand-border pt-5">
        {/* TD-29 (5): no way into Echo while it is switched off. */}
        {newest ? (
          echoOn() && (
            <Link href="/echo" className={btnPrimary}>
              {K.askEcho}
            </Link>
          )
        ) : (
          check.view && <p className="w-full text-sm text-brand-text-muted">{K.echoNewestOnly}</p>
        )}
        <Link href="/skin-check" className={btnSecondary}>
          {C.newCheck}
        </Link>
      </div>
    </section>
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
