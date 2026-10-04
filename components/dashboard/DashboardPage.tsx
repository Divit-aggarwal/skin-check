"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import { bandScores } from "@/lib/skin-check-rules";
import { summarizeConcerns } from "@/lib/skin-check-score";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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

const section = "flex flex-col gap-3";
const h2 = "font-display text-lg text-text";
const link = "w-fit text-sm font-medium text-text underline underline-offset-4";

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: DashboardData };

export function DashboardPage() {
  const { user, loading } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const openId = useSearchParams().get("check");
  const { setSession } = useSkinCheckSession();

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
        <p className="text-body text-text/60">{C.loading}</p>
        <div className="flex flex-col gap-3" aria-hidden>
          <Skeleton className="h-40 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </Shell>
    );
  }
  if (!user) {
    return (
      <Shell>
        <p className="text-body text-text/70">{C.signedOut}</p>
        <Link href="/account" className={link}>
          {C.signIn}
        </Link>
      </Shell>
    );
  }
  if (load.kind === "error" || !dashboard || load.kind !== "ready") {
    return (
      <Shell>
        <p role="alert" className="text-body text-text/70">
          {C.error}
        </p>
      </Shell>
    );
  }

  if (openId) return <OneCheck uid={user.uid} scanId={openId} data={load.data} />;

  return (
    <Shell>
      {/* Empty only when there is neither a check nor a reading: an analysis
          lands before the questionnaire is saved (design §3, orphan record). */}
      {isEmpty(dashboard) ? (
        <section className={section}>
          <p className="text-body text-text/70">{C.empty}</p>
          <Link href="/skin-check" className={link}>
            {C.firstCheck}
          </Link>
        </section>
      ) : (
        <CurrentSection dashboard={dashboard} />
      )}
      <TrendSection trend={dashboard.trend} />
      {dashboard.history.length > 0 && <HistorySection dashboard={dashboard} />}
      <ChatSection uid={user.uid} dashboard={dashboard} data={load.data} />
      <section aria-labelledby="routine-title" className={section}>
        <h2 id="routine-title" className={h2}>
          {C.routine.title}
        </h2>
        <Link href="/routine" className={link}>
          {C.routine.link}
        </Link>
      </section>
      <ConsentSection photo={dashboard.photo} deleteLink />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-10 px-4 py-10">
      <h1 className="font-display text-2xl text-text">{C.title}</h1>
      {children}
    </main>
  );
}

function CurrentSection({ dashboard }: { dashboard: Dashboard }) {
  const { current } = dashboard;
  return (
    <section aria-labelledby="current-title" className={section}>
      <h2 id="current-title" className={h2}>
        {C.current.title}
      </h2>
      {current.kind === "none" ? (
        <>
          <p className="text-body text-text/70">{C.current.none}</p>
          <Link href="/skin-check" className={link}>
            {C.newCheck}
          </Link>
        </>
      ) : (
        <>
          <p className="text-sm text-text/60">{C.current.checkedOn(formatDate(current.view.date))}</p>
          {dashboard.newerCheckNotShown && <p className="text-sm text-text/70">{C.current.newerNotShown}</p>}
          <CheckReadings view={current.view} />
          {/* Only next to readings that are on screen. */}
          {current.view.bands && <KnownAndNotKnown />}
        </>
      )}
    </section>
  );
}

function TrendSection({ trend }: { trend: Dashboard["trend"] }) {
  return (
    <section aria-labelledby="trend-title" className={section}>
      <h2 id="trend-title" className={h2}>
        {C.trend.title}
      </h2>
      {trend.kind === "empty" ? (
        <p className="text-body text-text/70">{C.trend.empty}</p>
      ) : (
        <>
          <p className="text-body text-text">{C.trend.notEnough}</p>
          <p className="text-body text-text/70">{C.trend.count(trend.count, trend.needed)}</p>
        </>
      )}
      <p className="text-sm text-text/60">{trend.kind === "set" ? C.trend.set : C.trend.howItForms(trend.needed)}</p>
      {trend.engineBoundary && <p className="text-sm text-text/60">{C.trend.boundary}</p>}
      {trend.legacyPresent && <p className="text-sm text-text/60">{C.trend.legacy}</p>}
    </section>
  );
}

function HistorySection({ dashboard }: { dashboard: Dashboard }) {
  return (
    <section aria-labelledby="history-title" className={section}>
      <h2 id="history-title" className={h2}>
        {C.history.title}
      </h2>
      <ul className="flex flex-col gap-2">
        {dashboard.history.map((row) => (
          <li key={row.scanId}>
            <Link
              href={`/dashboard?check=${encodeURIComponent(row.scanId)}`}
              aria-label={C.history.openLabel(formatDate(row.date))}
              className="flex min-h-11 flex-col gap-0.5 rounded-lg bg-canvas px-4 py-3"
            >
              <span className="text-body text-text">{formatDate(row.date)}</span>
              <span className="text-sm text-text/60">{C.history.kind[row.kind]}</span>
            </Link>
          </li>
        ))}
      </ul>
      <Link href="/skin-check" className={link}>
        {C.newCheck}
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
    <section aria-labelledby="chat-title" className={section}>
      <h2 id="chat-title" className={h2}>
        {C.chat.title}
      </h2>
      {scanId ? (
        <>
          <p className="text-body text-text/70">{C.chat.body}</p>
          <Button variant="ink" size="lg" className="self-start" onClick={openEcho}>
            {C.chat.button}
          </Button>
        </>
      ) : (
        <p className="text-body text-text/70">{C.chat.needsReading}</p>
      )}
    </section>
  );
}

function OneCheck({ uid, scanId, data }: { uid: string; scanId: string; data: DashboardData }) {
  const check = pastCheck(uid, scanId, data.checks, data.analyses);
  return (
    <Shell>
      <section aria-labelledby="check-title" className={section}>
        {check === null ? (
          <p className="text-body text-text/70">{C.history.notFound}</p>
        ) : (
          <>
            <h2 id="check-title" className={h2}>
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
