"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import { ErrorState, LoadingState, page, PageHeader, ReloadButton, SignedOutCard } from "@/components/ui/page";
import { useRoutine } from "@/components/routine/useRoutine";
import { QuestionsCard } from "@/components/skin-check/QuestionsChoice";
import { echoOn } from "@/lib/echo-limits";
import type { EchoRegion } from "@/lib/echo-regions";
import { partOfDay } from "@/lib/home/schedule";
import { AFTER_CHECK_KEY, showPermissions, type HomeSettings } from "@/lib/home/permissions";
import { weatherOn, pushOn } from "@/lib/home/switches";
import { formatDate } from "./CheckReadings";
import { DASHBOARD_COPY as C } from "./copy";
import { HOME_COPY as H } from "./homeCopy";
import { loadDashboard, type DashboardData } from "./data";
import { deriveDashboard, toDate, waitingQuestions, type Dashboard } from "./state";
import { AskEchoCard, LatestCheckCard, NewCheckBanner, NextCheckCard, RecordCard, RoutineCard, useOpenEcho, WeatherCard } from "./HomeCards";
import { loadHomeSettings } from "./homeSettings";
import { PermissionsScreen } from "./PermissionsScreen";

// Home v2 (TD-47, docs/design/home-v2.md): what to do for the skin today.
// One check's readings only, never two side by side (TD-24 (1)); the routine
// card never shows a reading (D-12); the weather card never names the skin.
// Phone and tablet: one column in the brief's order (CSS `order` over
// `contents` columns). From 1280: main column (8) and right column (4).

type Load = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: DashboardData };
/** The settings doc: undefined while loading; null when absent or unreadable (Home still works). */
type Settings = HomeSettings | null | undefined;
type SignedIn = NonNullable<ReturnType<typeof useAuth>["user"]>;

export function DashboardPage({ productsOn = true }: { productsOn?: boolean }) {
  const { user, loading } = useAuth();
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [settings, setSettings] = useState<Settings>(undefined);
  const [afterCheck, setAfterCheck] = useState(false);
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

  // TD-47 (3): set by the results screen; read here.
  useEffect(() => {
    try {
      setAfterCheck(sessionStorage.getItem(AFTER_CHECK_KEY) === "1");
    } catch {
      /* storage blocked: no screen */
    }
  }, []);

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
    loadHomeSettings(user.uid).then(
      (s) => active && setSettings(s),
      (error) => {
        console.error("[dashboard] home settings not loaded", error instanceof Error ? error.name : error);
        if (active) setSettings(null);
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

  if (loading || (user && (load.kind === "loading" || settings === undefined))) {
    return (
      <Shell>
        {/* Shaped like Home, so nothing jumps when it loads. */}
        <div className="grid gap-6 xl:grid-cols-12">
          <div className="xl:col-span-8">
            <LoadingState label={C.loading} blocks={["h-40", "h-[28rem]", "h-64"]} />
          </div>
          <div aria-hidden className="hidden xl:col-span-4 xl:block">
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

  if (showPermissions({ afterCheck, settings: settings ?? null, anythingToAsk: weatherOn() || pushOn() })) {
    return (
      <main className={`${page} pt-8 sm:pt-12`}>
        <PermissionsScreen
          user={user}
          settings={settings ?? null}
          onDone={(s) => {
            try {
              sessionStorage.removeItem(AFTER_CHECK_KEY);
            } catch {
              /* nothing kept */
            }
            setAfterCheck(false);
            setSettings(s);
            window.scrollTo({ top: 0 });
          }}
        />
      </main>
    );
  }

  return <Home user={user} data={load.data} dashboard={dashboard} settings={settings ?? null} onSettings={setSettings} routine={routine} productsOn={productsOn} />;
}

function Home({
  user,
  data,
  dashboard,
  settings,
  onSettings,
  routine,
  productsOn,
}: {
  user: SignedIn;
  data: DashboardData;
  dashboard: Dashboard;
  settings: HomeSettings | null;
  onSettings: (s: HomeSettings) => void;
  routine: ReturnType<typeof useRoutine>;
  productsOn: boolean;
}) {
  const openEcho = useOpenEcho(user.uid, data);
  const current = dashboard.current;
  // TD-46: a face area opens Echo on it, only where "Chat with Echo" would work (Echo talks about the newest check).
  const onArea = echoOn() && current.kind === "reading" && current.view.scanId === dashboard.echoScanId ? (region: EchoRegion) => openEcho({ region }) : undefined;
  const waiting = waitingQuestions(user.uid, data.checks, data.analyses, data.laterAnswers);
  const name = firstName(data);
  const hello = H.greeting[partOfDay(new Date(), Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata")];

  return (
    <Shell title={name ? H.greetingName(hello, name) : hello}>
      <div className="flex flex-col gap-4 sm:gap-6 xl:grid xl:grid-cols-12 xl:items-start">
        <div className="contents xl:col-span-8 xl:flex xl:flex-col xl:gap-6">
          <div className="order-2 flex flex-col gap-4 sm:gap-6">
            <LatestCheckCard dashboard={dashboard} onArea={onArea} />
            {/* TD-33 (1): right under the newest reading, while its questions wait. */}
            {waiting && <QuestionsCard isEcho={waiting.isEcho} date={waiting.date ? formatDate(waiting.date) : null} />}
          </div>
          <div className="contents xl:grid xl:grid-cols-2 xl:items-start xl:gap-6">
            <div className="order-6 xl:order-none">
              <RecordCard dashboard={dashboard} routine={routine} />
            </div>
            <div className="order-3 xl:order-none">
              <RoutineCard routine={routine} />
            </div>
          </div>
          {dashboard.history.length > 0 && (
            <div className="order-8">
              <NewCheckBanner />
            </div>
          )}
        </div>
        <div className="contents xl:col-span-4 xl:flex xl:flex-col xl:gap-6">
          {weatherOn() && (
            <div className="order-4 xl:order-none">
              <WeatherCard user={user} settings={settings} onSettings={onSettings} />
            </div>
          )}
          <div className="order-1 xl:order-none">
            <NextCheckCard dashboard={dashboard} user={user} settings={settings} onSettings={onSettings} />
          </div>
          {/* TD-29 (5): no way into Echo while it is switched off. */}
          {echoOn() && (
            <div className="order-7 xl:order-none">
              <AskEchoCard uid={user.uid} dashboard={dashboard} data={data} productsOn={productsOn} />
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

/** The first word of the name given on the newest check that has one. */
function firstName(data: DashboardData): string | null {
  const nameOf = (c: DashboardData["checks"][number]) => (c.data.answers as { name?: unknown } | undefined)?.name;
  const newest = data.checks
    .filter((c) => typeof nameOf(c) === "string")
    .sort((a, b) => (toDate(b.data.createdAt)?.getTime() ?? Infinity) - (toDate(a.data.createdAt)?.getTime() ?? Infinity))[0];
  const first = newest ? String(nameOf(newest)).trim().split(/\s+/)[0] : "";
  return first ? first.slice(0, 40) : null;
}

function Shell({ children, title = C.title }: { children: React.ReactNode; title?: string }) {
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  return (
    <main className={page}>
      <PageHeader kicker={today} title={title} />
      {children}
    </main>
  );
}
