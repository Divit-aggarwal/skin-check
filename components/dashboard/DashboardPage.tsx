"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import { ChevronRight } from "lucide-react";
import { btnPrimary, btnSecondary, card, EmptyState, ErrorState, eyebrow, h2, LoadingState, page, PageHeader, ReloadButton, SignedOutCard, textLink } from "@/components/ui/page";
import { TodayCard } from "@/components/routine/TodayCard";
import { useRoutine } from "@/components/routine/useRoutine";
import { TIMELINE_COPY } from "@/components/timeline/copy";
import { dayOf, mergeTimeline } from "@/components/timeline/timeline";
import { TimelineList } from "@/components/timeline/TimelineList";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { CheckReadings, formatDate, KnownAndNotKnown } from "./CheckReadings";
import { ConsentSection } from "./ConsentSection";
import { DASHBOARD_COPY as C } from "./copy";
import { loadDashboard, type DashboardData } from "./data";
import { deriveDashboard, isEmpty, type Dashboard } from "./state";
import { newestEchoSession } from "./echo-session";
import { echoOn } from "@/lib/echo-limits";

// Home (G03, docs/design/map.md). The newest reading by face area, the
// starting point, recent timeline, Echo, a new check, today's routine and
// privacy. A past check opens on /checks/[id] with its own readings and the
// fixed line (TD-24 (1)), so no two checks' readings meet on one screen, and
// the routine card never sits beside the readings (D-12).


type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: DashboardData };

export function DashboardPage() {
  const { user, loading } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const openId = useSearchParams().get("check");
  const router = useRouter();
  const { setSession } = useSkinCheckSession();
  const routine = useRoutine();

  // A session in the shared provider makes /skin-check reopen that scan's
  // results screen (lib/useSkinCheckFlow.ts). Clear it here, so the dashboard's
  // own Ask Echo hand-off never leaks into the next new check.
  useEffect(() => setSession(null), [setSession]);

  // The old /dashboard?check=<id> address opens the check on its own page now.
  useEffect(() => {
    if (openId) router.replace(`/checks/${encodeURIComponent(openId)}`);
  }, [openId, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setLoad({ kind: "loading" });
    loadDashboard(user.uid).then(
      (data) => active && setLoad({ kind: "ready", data }),
      (error) => {
        // No Firestore code on screen: it says nothing the user can act on.
        console.error("[dashboard] load failed", error instanceof Error ? error.name : error);
        if (active) setLoad({ kind: "error" });
      }
    );
    return () => {
      active = false;
    };
  }, [user]);

  const dashboard = useMemo(
    () => (user && load.kind === "ready" ? deriveDashboard(user.uid, load.data.checks, load.data.analyses) : null),
    [user, load]
  );

  if (loading || (user && load.kind === "loading")) {
    return (
      <Shell>
        {/* Shaped like Home: the 8/4 split, so nothing jumps when it loads. */}
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <LoadingState label={C.loading} blocks={["h-[28rem]", "h-64"]} />
          </div>
          <div aria-hidden className="hidden lg:col-span-4 lg:block">
            <LoadingState label="" blocks={["h-48", "h-40", "h-40"]} />
          </div>
        </div>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <SignedOutCard body={C.signedOut} />
      </Shell>
    );
  }
  if (load.kind === "error" || !dashboard || load.kind !== "ready") {
    return (
      <Shell>
        <ErrorState body={C.error} action={<ReloadButton label={C.home.tryAgain} />} />
      </Shell>
    );
  }


  return (
    <Shell>
      {/* Phone: one column in reading order. Desktop: two columns (8/4); the
          columns are `contents` on phones so `order` sets one sequence. */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
        <div className="contents lg:col-span-8 lg:flex lg:flex-col lg:gap-6">
          <div className="order-1">
            {/* Empty only when there is neither a check nor a reading: an analysis
                lands before the questionnaire is saved (design §3, orphan record). */}
            {isEmpty(dashboard) ? (
              <EmptyState
                body={C.empty}
                action={
                  <Link href="/skin-check" className={btnPrimary}>
                    {C.firstCheck}
                  </Link>
                }
              />
            ) : (
              <CurrentSection dashboard={dashboard} />
            )}
          </div>
          <div className="order-3">
            <RecentSection history={dashboard.history} routine={routine} />
          </div>
          {/* Never beside the readings (D-12): below Recently, in the main column. */}
          <div className="order-5">
            <TodayCard routine={routine} />
          </div>
        </div>
        <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-6">
          <div className="order-2">
            <TrendSection trend={dashboard.trend} />
          </div>
          <div className="order-4">
            {/* TD-29 (5): no way into Echo while it is switched off. */}
            {echoOn() && <ChatSection uid={user.uid} dashboard={dashboard} data={load.data} />}
          </div>
          {/* Only when the lead card does not already offer a new check. */}
          {dashboard.current.kind === "reading" && (
          <section aria-labelledby="new-title" className={`${card} order-6 flex flex-col items-start gap-3`}>
            <h2 id="new-title" className={h2}>
              {C.home.newCheckTitle}
            </h2>
            <p className="text-brand-muted">{C.home.newCheckBody}</p>
            <Link href="/skin-check" className={btnSecondary}>
              {C.newCheck}
            </Link>
          </section>
          )}
          <div className="order-7">
            <ConsentSection photo={dashboard.photo} deleteLink />
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <main className={page}>
      <PageHeader kicker={today} title={C.title} />
      {children}
    </main>
  );
}

function CurrentSection({ dashboard }: { dashboard: Dashboard }) {
  const { current } = dashboard;
  return (
    <section aria-labelledby="current-title" className={`${card} flex flex-col gap-5`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div>
          <p className={`${eyebrow} mb-1`}>{C.current.eyebrow}</p>
          <h2 id="current-title" className={h2}>
            {current.kind === "reading" ? C.current.title : C.current.noneTitle}
          </h2>
          {current.kind === "reading" && <p className="mt-1 text-sm text-brand-muted">{C.current.checkedOn(formatDate(current.view.date))}</p>}
        </div>
        {current.kind === "reading" && (
          <Link href={`/checks/${encodeURIComponent(current.view.scanId)}`} className={textLink}>
            {C.current.openCheck}
            <ChevronRight aria-hidden size={16} />
          </Link>
        )}
      </div>
      {current.kind === "none" ? (
        <div className="flex flex-col items-start gap-4">
          <p>{C.current.none}</p>
          <Link href="/skin-check" className={btnPrimary}>
            {C.newCheck}
          </Link>
        </div>
      ) : (
        <>
          {dashboard.newerCheckNotShown && <p className="rounded-xl bg-brand-linen px-4 py-3 text-sm">{C.current.newerNotShown}</p>}
          <CheckReadings view={current.view} />
          {/* Only next to readings that are on screen. */}
          {current.view.bands && (
            <div className="border-t border-brand-line pt-5">
              <KnownAndNotKnown />
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TrendSection({ trend }: { trend: Dashboard["trend"] }) {
  return (
    <section aria-labelledby="trend-title" className={`${card} flex flex-col gap-2`}>
      <h2 id="trend-title" className={h2}>
        {C.trend.title}
      </h2>
      {trend.kind === "empty" ? (
        <p>{C.trend.empty}</p>
      ) : (
        <>
          <p className="font-semibold">{C.trend.notEnough}</p>
          <p>{C.trend.count(trend.count, trend.needed)}</p>
        </>
      )}
      <p className="text-sm text-brand-muted">{trend.kind === "set" ? C.trend.set : C.trend.howItForms(trend.needed)}</p>
      {trend.engineBoundary && <p className="text-sm text-brand-muted">{C.trend.boundary}</p>}
      {trend.legacyPresent && <p className="text-sm text-brand-muted">{C.trend.legacy}</p>}
    </section>
  );
}

/** The latest items of the timeline: checks and routine entries by date, never a reading. */
function RecentSection({ history, routine }: { history: Dashboard["history"]; routine: ReturnType<typeof useRoutine> }) {
  const items = mergeTimeline(history, routine.data?.events ?? [], routine.data?.today ?? dayOf(new Date())).slice(0, 4);
  const nameOf = (id: string) => routine.data?.products.find((p) => p.id === id)?.name ?? ROUTINE_COPY.otherProduct;
  return (
    <section aria-labelledby="recent-title" className="flex flex-col gap-2 rounded-2xl border border-brand-line p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-x-4">
        <h2 id="recent-title" className={h2}>
          {TIMELINE_COPY.recent}
        </h2>
        <Link href="/checks?view=timeline" className={textLink}>
          {TIMELINE_COPY.seeAll}
          <ChevronRight aria-hidden size={16} />
        </Link>
      </div>
      <TimelineList items={items} nameOf={nameOf} />
    </section>
  );
}

function ChatSection({ uid, dashboard, data }: { uid: string; dashboard: Dashboard; data: DashboardData }) {
  const { setSession } = useSkinCheckSession();
  const router = useRouter();
  const scanId = dashboard.echoScanId;

  function openEcho() {
    const session = newestEchoSession(uid, data);
    if (!session) return;
    setSession(session);
    router.push("/echo");
  }

  return (
    <section aria-labelledby="chat-title" className={`${card} flex flex-col items-start gap-3`}>
      <h2 id="chat-title" className={h2}>
        {C.chat.title}
      </h2>
      {scanId ? (
        <>
          <p className="text-brand-muted">{C.chat.body}</p>
          <button type="button" className={btnPrimary} onClick={openEcho}>
            {C.chat.button}
          </button>
        </>
      ) : (
        <p className="text-brand-muted">{dashboard.history.length === 0 ? C.chat.needsFirst : C.chat.needsReading}</p>
      )}
    </section>
  );
}
