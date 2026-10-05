"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { CheckReadings, KnownAndNotKnown, PhotoCheckLine } from "@/components/dashboard/CheckReadings";
import { formatDate } from "@/components/dashboard/format";
import { loadDashboard, type DashboardData } from "@/components/dashboard/data";
import { deriveDashboard, pastCheck, type Dashboard } from "@/components/dashboard/state";
import { useRoutine } from "@/components/routine/useRoutine";
import { mergeTimeline, dayOf } from "@/components/timeline/timeline";
import { TimelineList } from "@/components/timeline/TimelineList";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { AccountButton, btnPrimary, btnSecondary, EmptyState, ErrorState, eyebrow, h2, LoadingState, page, PageHeader, ReloadButton, textLink } from "@/components/ui/page";
import { CHECKS_COPY as K } from "./copy";
import { Thumb } from "./Thumb";

// G03 3.3 / 3.4. /checks: every check by date (date, kind, photo check, kept
// photo), or the timeline of checks and routine entries. /checks/[scanId]: one
// opened check with its OWN readings and the fixed line (TD-24 (1)).
// Phone: the list, or the opened check. From 1024px: the list on the left and
// the opened check on the right (TD-25 (1), from direction B).

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: DashboardData };

export function ChecksView({ openId }: { openId: string | null }) {
  const { user, loading } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const timeline = useSearchParams().get("view") === "timeline" && !openId;

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

  const header = (
    <PageHeader kicker={K.kicker} title={K.title}>
      {!openId && <ViewSwitch timeline={timeline} />}
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
        <EmptyState body={C.signedOut} action={<Link href="/account" className={btnPrimary}>{C.signIn}</Link>} />
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

  if (timeline)
    return (
      <main className={page}>
        {header}
        <TimelineSection history={dashboard.history} />
      </main>
    );

  // The newest check opens on the right on a wide screen when none is picked.
  const selected = openId ?? dashboard.history[0]!.scanId;
  return (
    <main className={page}>
      {openId ? (
        <div className="flex items-center justify-between pt-6 lg:hidden">
          <Link href="/checks" className={textLink}>
            <ChevronLeft aria-hidden size={16} />
            {K.back}
          </Link>
          <AccountButton />
        </div>
      ) : null}
      <div className={openId ? "hidden lg:block" : undefined}>{header}</div>
      <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-6">
        <div className={`lg:col-span-5 ${openId ? "hidden lg:block" : ""}`}>
          <CheckList dashboard={dashboard} data={load.data} uid={user.uid} selected={selected} />
        </div>
        <div className={`lg:sticky lg:top-6 lg:col-span-7 ${openId ? "" : "hidden lg:block"}`}>
          <CheckDetail uid={user.uid} scanId={selected} data={load.data} dashboard={dashboard} />
        </div>
      </div>
    </main>
  );
}

function ViewSwitch({ timeline }: { timeline: boolean }) {
  const tab = "flex min-h-11 items-center rounded-full px-5 font-medium aria-[current=page]:bg-brand-action aria-[current=page]:text-white";
  return (
    <nav aria-label={K.views} className="mt-5 inline-flex rounded-full border border-brand-line bg-brand-linen p-1">
      <Link href="/checks" aria-current={timeline ? undefined : "page"} className={tab}>
        {K.list}
      </Link>
      <Link href="/checks?view=timeline" aria-current={timeline ? "page" : undefined} className={tab}>
        {K.timeline}
      </Link>
    </nav>
  );
}

/** Date, kind, photo check and a kept photo. Never a reading. */
function CheckList({ dashboard, data, uid, selected }: { dashboard: Dashboard; data: DashboardData; uid: string; selected: string | null }) {
  return (
    <section aria-labelledby="list-title" className="overflow-hidden rounded-2xl border border-brand-line">
      <div className="flex items-center justify-between gap-4 border-b border-brand-line px-5 py-4">
        <h2 id="list-title" className={eyebrow}>
          {C.history.title}
        </h2>
        <p className="text-sm text-brand-muted">{K.count(dashboard.history.length)}</p>
      </div>
      <ul className="divide-y divide-brand-line">
        {dashboard.history.map((row) => {
          const check = pastCheck(uid, row.scanId, data.checks, data.analyses);
          const date = formatDate(row.date);
          return (
            <li key={row.scanId}>
              <Link
                href={`/checks/${encodeURIComponent(row.scanId)}`}
                aria-label={C.history.openLabel(date)}
                aria-current={selected === row.scanId ? "page" : undefined}
                className="group flex min-h-16 items-center gap-4 px-5 py-4 hover:bg-brand-linen aria-[current=page]:bg-brand-linen"
              >
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold">{date}</span>
                  <span className="text-sm text-brand-muted">{C.history.kind[row.kind]}</span>
                  {check?.photoCheck && <span className="text-sm text-brand-muted">{C.photoCheck[check.photoCheck]}</span>}
                </span>
                {row.photoClaimed && <Thumb key={row.scanId} scanId={row.scanId} date={date} />}
                <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-muted group-hover:text-brand-ink" />
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
  // The back link above (phone) and the list beside it (desktop) are the ways on.
  if (!check) return <EmptyState title={C.history.notFound} body={K.notFoundBody} />;
  const date = formatDate(check.date);
  const newest = dashboard.echoScanId === check.scanId;
  return (
    <section aria-labelledby="check-title" className="flex flex-col gap-5 rounded-2xl bg-brand-linen p-5 sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className={`${eyebrow} mb-1`}>{K.opened}</p>
          <h2 id="check-title" className={h2}>
            {C.history.checkFrom(date)}
          </h2>
          <p className="mt-1 text-brand-muted">{C.history.kind[check.kind]}</p>
        </div>
        {check.photoClaimed && <Thumb key={check.scanId} scanId={check.scanId} date={date} size={112} />}
      </div>
      {check.photoCheck && <PhotoCheckLine text={C.photoCheck[check.photoCheck]} />}
      {/* TD-24 (1): always on an opened check, never behind a toggle. */}
      <p className="rounded-2xl bg-brand-mist px-5 py-4 text-brand-ink">{C.history.pastLine}</p>
      {check.view ? (
        <>
          <CheckReadings view={{ ...check.view, photoCheck: null }} stack />
          {check.view.bands && (
            <div className="border-t border-brand-line pt-5">
              <KnownAndNotKnown />
            </div>
          )}
        </>
      ) : (
        <p>{K.noReadings}</p>
      )}
      <div className="flex flex-wrap gap-3 border-t border-brand-line pt-5">
        {newest ? (
          <Link href="/echo" className={btnPrimary}>
            {K.askEcho}
          </Link>
        ) : (
          check.view && <p className="w-full text-sm text-brand-muted">{K.echoNewestOnly}</p>
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
    <section aria-label={K.timeline} className="max-w-4xl rounded-2xl border border-brand-line px-5">
      {routine.failed && <p role="alert" className="py-3">{ROUTINE_COPY.error}</p>}
      {/* No photos here: a column of faces between routine entries would read as before and after (D-12). Photos stay on the list and the opened check. */}
      <TimelineList items={items} nameOf={nameOf} />
    </section>
  );
}
