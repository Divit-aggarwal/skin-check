"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { ChevronRight } from "lucide-react";
import { btnPrimary, btnSecondary, card, EmptyState, ErrorState, eyebrow, h2, LoadingState, page, PageHeader, ReloadButton, textLink } from "@/components/ui/page";
import { TodayCard } from "@/components/routine/TodayCard";
import { useRoutine } from "@/components/routine/useRoutine";
import { TIMELINE_COPY } from "@/components/timeline/copy";
import { dayOf, mergeTimeline } from "@/components/timeline/timeline";
import { TimelineList } from "@/components/timeline/TimelineList";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import type { SkinCheckAnswers } from "@/types/skin-check";
import type { CaptureMethod, SkinScanResult } from "@/types/skin-scan";
import { CheckReadings, formatDate, KnownAndNotKnown } from "./CheckReadings";
import { ConsentSection } from "./ConsentSection";
import { DASHBOARD_COPY as C } from "./copy";
import { loadDashboard, type DashboardData } from "./data";
import { deriveDashboard, echoRecord, isEmpty, pastCheck, type Dashboard } from "./state";

// G01 dashboard (docs/lanes/dashboard-design.md). Phone first, one column.
// Six sections. Readings are shown for the newest photo reading only; a past
// check opens on its own page with its date, kind and photo check, never its
// readings (LONGITUDINAL_METHOD §1), so no two checks' readings meet.

const link = "w-fit text-sm font-medium text-text underline underline-offset-4";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: DashboardData };

export function DashboardPage() {
  const { user, loading } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const openId = useSearchParams().get("check");
  const { setSession } = useSkinCheckSession();
  const routine = useRoutine();

  // A session in the shared provider makes /skin-check reopen that scan's
  // results screen (lib/useSkinCheckFlow.ts). Clear it here, so the dashboard's
  // own Ask Echo hand-off never leaks into the next new check.
  useEffect(() => setSession(null), [setSession]);

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
        <LoadingState label={C.loading} blocks={["h-96", "h-40", "h-40"]} />
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <EmptyState
          body={C.signedOut}
          action={
            <Link href="/account" className={btnPrimary}>
              {C.signIn}
            </Link>
          }
        />
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

  if (openId) return <OneCheck uid={user.uid} scanId={openId} data={load.data} />;

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
          <div className="order-4">
            <RecentSection history={dashboard.history} routine={routine} />
          </div>
        </div>
        <div className="contents lg:col-span-4 lg:flex lg:flex-col lg:gap-6">
          <div className="order-2">
            <TrendSection trend={dashboard.trend} />
          </div>
          <div className="order-3">
            <TodayCard routine={routine} />
          </div>
          <div className="order-5">
            <ChatSection uid={user.uid} dashboard={dashboard} data={load.data} />
          </div>
          <section aria-labelledby="new-title" className={`${card} order-6 flex flex-col items-start gap-3`}>
            <h2 id="new-title" className={h2}>
              {C.home.newCheckTitle}
            </h2>
            <p className="text-brand-muted">{C.home.newCheckBody}</p>
            <Link href="/skin-check" className={btnSecondary}>
              {C.newCheck}
            </Link>
          </section>
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
            {C.current.title}
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
          {dashboard.newerCheckNotShown && <p className="rounded-xl bg-brand-paper px-4 py-3 text-sm">{C.current.newerNotShown}</p>}
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
      <Link href="/checks" className={textLink}>
        {C.history.allChecks}
      </Link>
    </section>
  );
}

function ChatSection({ uid, dashboard, data }: { uid: string; dashboard: Dashboard; data: DashboardData }) {
  const { setSession } = useSkinCheckSession();
  const router = useRouter();
  const scanId = dashboard.echoScanId;

  // Echo reads only scanId and region_scores from the session; the chat
  // server loads the facts for that scanId itself.
  function openEcho() {
    if (!scanId) return;
    const record = echoRecord(uid, scanId, data.analyses);
    if (!record) return;
    const result = record as unknown as SkinScanResult;
    const { bands } = bandScores(result.scores);
    setSession({
      scanId,
      answers: (data.checks.find((c) => c.id === scanId)?.data.answers ?? {}) as SkinCheckAnswers,
      result,
      composite: summarizeConcerns(result.scores, bands),
      // ponytail: no photo is held here; Echo never reads it. Load the stored original if Echo ever shows it.
      photo: new Blob(),
      captureMethod: (record.captureMethod as CaptureMethod | undefined) ?? "native",
      fromDashboard: true,
    });
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
        <p className="text-brand-muted">{C.chat.needsReading}</p>
      )}
    </section>
  );
}

function OneCheck({ uid, scanId, data }: { uid: string; scanId: string; data: DashboardData }) {
  const check = pastCheck(uid, scanId, data.checks, data.analyses);
  return (
    <Shell>
      <section aria-labelledby="check-title" className="flex flex-col gap-3">
        {check === null ? (
          <p className="text-body text-text/70">{C.history.notFound}</p>
        ) : (
          <>
            <h2 id="check-title" className="font-display text-lg text-text">
              {C.history.checkFrom(formatDate(check.date))}
            </h2>
            <p className="text-body text-text/70">{C.history.kind[check.kind]}</p>
            {check.photoCheck && <p className="text-sm text-text/70">{C.photoCheck[check.photoCheck]}</p>}
            {check.kind === "legacy" && <p className="text-sm text-text/70">{C.legacyPastNote}</p>}
            <p className="text-sm text-text/60">{C.history.onlyNewest}</p>
          </>
        )}
        <Link href="/dashboard" className={link}>
          {C.history.back}
        </Link>
      </section>
    </Shell>
  );
}
