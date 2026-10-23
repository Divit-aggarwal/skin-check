"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/format";
import { deriveDashboard } from "@/components/dashboard/state";
import { readingsOverTime } from "@/lib/readings/series";
import type { SeriesWindow } from "@/lib/feature-contracts/readings-series";
import { METRIC_LABELS } from "@/lib/skin-check-skus";
import { AccountButton, btnPrimary, card, EmptyState, ErrorState, h2, LoadingState, page, ReloadButton, SignedOutCard, subtitle, textLink, titlePage } from "@/components/ui/page";
import { AppHeader, PhotoTile, TabBar } from "@/components/ui/kit";
import { fixedLine } from "@/components/checks/ChecksTabs";
import { LevelTile, latestBand, OwnPhotos, SeriesTimeline, shortDate } from "@/components/checks/OverTime";
import { parseWindow, READING_ORDER, seriesChecks, useChecksData, usePhotoUrls, WINDOWS } from "@/components/checks/series";
import { PROGRESS_COPY as P } from "./copy";

// Screen 12 (G37, lane mm/a): readings over time, read-only, from
// lib/readings/series.ts over the checks the dashboard loader reads. Tabs
// Overview / Concerns / Photos by address (?view=), the weeks shown by
// address (?window=). Removed by the data rules: change percentages and
// arrows (ChangeSlot instead), "Key insights", the "Routine Impact" tab.

type View = "overview" | "concerns" | "photos";

export function ProgressView() {
  const { user, loading } = useAuth();
  const load = useChecksData(user);
  const params = useSearchParams();
  const router = useRouter();
  const path = usePathname() ?? "/progress";
  const win = parseWindow(params.get("window"));
  const v = params.get("view");
  const view: View = v === "concerns" || v === "photos" ? v : "overview";
  const href = (next: { view?: View; window?: SeriesWindow }) => {
    const q = new URLSearchParams();
    const nv = next.view ?? view;
    const nw = next.window ?? win;
    if (nv !== "overview") q.set("view", nv);
    if (nw !== "12w") q.set("window", nw);
    const s = q.toString();
    return s ? `${path}?${s}` : path;
  };

  const ready = user && load.kind === "ready" ? load.data : null;
  const dashboard = useMemo(() => (user && ready ? deriveDashboard(user.uid, ready.checks, ready.analyses) : null), [user, ready]);
  const checks = useMemo(() => (user && ready && dashboard ? seriesChecks(user.uid, ready, dashboard.history) : []), [user, ready, dashboard]);
    const over = useMemo(() => readingsOverTime(checks, win, new Date()), [checks, win]);

  const header = (
    <>
      <AppHeader back="/checks" backLabel={C.history.title} right={<AccountButton />} />
      <header className="flex flex-wrap items-start justify-between gap-3 pb-3">
        <div className="min-w-[11rem] flex-1">
          <h1 className={titlePage}>{P.title}</h1>
          <p className={`mt-1 ${subtitle}`}>{P.intro}</p>
        </div>
        {dashboard && dashboard.history.length > 0 && (
          <label className="relative shrink-0">
            <span className="sr-only">{P.windowLabel}</span>
            <select
              value={win}
              onChange={(e) => router.replace(href({ window: parseWindow(e.target.value) }), { scroll: false })}
              className="min-h-11 appearance-none rounded-full border border-brand-border bg-brand-surface py-2 pl-4 pr-9 text-sm font-medium text-brand-text"
            >
              {WINDOWS.map((w) => (
                <option key={w} value={w}>{P.window[w]}</option>
              ))}
            </select>
            <ChevronDown aria-hidden size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-brand-text" />
          </label>
        )}
      </header>
      <div className="mb-4">
        <TabBar
          fill
          label={P.views}
          current={view}
          tabs={[
            { key: "overview", label: P.overview, href: href({ view: "overview" }) },
            { key: "concerns", label: P.concerns, href: href({ view: "concerns" }) },
            { key: "photos", label: P.photos, href: href({ view: "photos" }) },
          ]}
        />
      </div>
    </>
  );

  if (loading || (user && load.kind === "loading"))
    return (
      <main className={page}>
        {header}
        <LoadingState label={C.loading} blocks={["h-32", "h-48", "h-56"]} />
      </main>
    );
  if (!user)
    return (
      <main className={page}>
        {header}
        <SignedOutCard body={C.signedOut} />
      </main>
    );
  if (!ready || !dashboard)
    return (
      <main className={page}>
        {header}
        <ErrorState body={C.error} action={<ReloadButton label={C.home.tryAgain} />} />
      </main>
    );
  if (checks.length === 0)
    return (
      <main className={page}>
        {header}
        <EmptyState body={C.empty} action={<Link href="/skin-check" className={btnPrimary}>{C.firstCheck}</Link>} />
      </main>
    );

  const series = READING_ORDER.map((m) => over.series.find((s) => s.metric === m)!);
  const inWindow = series[0]!.points; // the same checks for every reading, oldest first
  const kept = inWindow.filter((p) => p.photos.front).map((p) => ({ scanId: p.scanId, date: new Date(p.at) }));
  const notes = (
    <>
      <p className={`${fixedLine} text-sm`}>{C.history.pastLine}</p>
      {over.otherVersionScanIds.length > 0 && <p className="text-sm text-brand-text-muted">{C.trend.boundary}</p>}
    </>
  );

  return (
    <main className={page}>
      {header}
      {inWindow.length === 0 ? (
        <EmptyState body={P.noChecksInWindow} />
      ) : view === "photos" ? (
        <AllPhotos checks={kept} />
      ) : view === "concerns" ? (
        <div className="flex flex-col gap-4">
          {notes}
          {series.map((s) => (
            <section key={s.metric} aria-labelledby={`c-${s.metric}`} className={`${card} flex flex-col gap-3`}>
              <div className="flex items-center justify-between gap-3">
                <h2 id={`c-${s.metric}`} className={h2}>{METRIC_LABELS[s.metric]}</h2>
                <Link href={`/checks?reading=${s.metric}`} aria-label={P.openReading(METRIC_LABELS[s.metric])} className={textLink}>
                  <ChevronRight aria-hidden size={20} />
                </Link>
              </div>
              <LevelTile metric={s.metric} level={latestBand(s) ?? C.current.noReading} slot={s.change} />
              <SeriesTimeline series={s} />
            </section>
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <section aria-label={P.latestIn}>
            <ul className="-mx-4 grid snap-x auto-cols-[calc((100%-1rem)/2.5)] grid-flow-col gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:auto-cols-fr sm:px-0">
              {series.map((s) => (
                <li key={s.metric} className="snap-start">
                  <LevelTile metric={s.metric} level={latestBand(s) ?? C.current.noReading} slot={s.change} href={`/checks?reading=${s.metric}`} />
                </li>
              ))}
            </ul>
          </section>
          {notes}
          <section aria-labelledby="photos-title" className={`${card} flex flex-col gap-3`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="photos-title" className={h2}>{P.yourPhotos}</h2>
                <p className="mt-0.5 text-sm text-brand-text-muted">{P.photosIntro}</p>
              </div>
              {kept.length > 0 && (
                <Link href={href({ view: "photos" })} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full bg-brand-100 px-3 text-sm font-semibold text-brand-700">
                  {P.viewAllPhotos}
                  <ChevronRight aria-hidden size={16} />
                </Link>
              )}
            </div>
            <OwnPhotos checks={kept} empty={<p className="text-sm text-brand-text-muted">{P.noPhotos}</p>} />
          </section>
          <section aria-labelledby="time-title" className={`${card} flex flex-col gap-3`}>
            <div>
              <h2 id="time-title" className={h2}>{P.overTime}</h2>
              <p className="mt-0.5 text-sm text-brand-text-muted">{P.overTimeIntro}</p>
            </div>
            {series.map((s) => (
              <div key={s.metric}>
                <h3 className="text-sm font-semibold text-brand-text">{METRIC_LABELS[s.metric]}</h3>
                <SeriesTimeline series={s} />
              </div>
            ))}
          </section>
        </div>
      )}
    </main>
  );
}

/** Every kept photo in the window, newest first, each opening its check. One column under 640px, never two side by side as a pair (D-12). */
function AllPhotos({ checks }: { checks: { scanId: string; date: Date }[] }) {
  const urls = usePhotoUrls(checks.map((c) => c.scanId));
  if (checks.length === 0) return <EmptyState body={P.noPhotos} />;
  if (!urls) return <LoadingState label={C.loading} blocks={["h-64", "h-64"]} />;
  const shown = [...checks].reverse().filter((c) => urls.get(c.scanId));
  if (shown.length === 0) return <EmptyState body={P.noPhotos} />;
  return (
    <section aria-label={P.photos} className="flex flex-col gap-4">
      <p className={`${fixedLine} text-sm`}>{C.history.pastLine}</p>
      <ul className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {shown.map((c) => (
          <li key={c.scanId} className="max-w-sm">
            <Link href={`/checks/${encodeURIComponent(c.scanId)}`} aria-label={C.history.openLabel(formatDate(c.date))} className="block rounded-tile">
              <PhotoTile src={urls.get(c.scanId)!} alt={P.photoAlt(formatDate(c.date))} label={shortDate(c.date)} fallback={P.photoMissing} />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
