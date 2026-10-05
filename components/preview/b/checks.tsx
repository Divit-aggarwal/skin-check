// PREVIEW ONLY (direction B). Checks: list and detail split from 1024px.
// The list shows date, kind, photo check and thumbnail only. Readings appear
// only in the opened check, always with PAST_CHECK_LINE.
import Link from "next/link";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { clsx } from "clsx";
import { DASHBOARD_COPY as D } from "@/components/dashboard/copy";
import { DASHBOARDS, PAST_CHECK_LINE } from "@/components/preview/fixtures";
import { B_COPY as B } from "./copy";
import { checkRows, opened, timeline, type CheckRow, type Opened } from "./data";
import { CHECKS_HREF, ECHO_HREF, NEW_CHECK_HREF, TIMELINE_HREF, checkHref } from "./links";
import { RegionTabs } from "./RegionTabs";
import { AreaTable, FixedLine, Page, PageHeader, Readings, StatusLine, Thumb, TimelineRail } from "./ui";

function ViewSwitch({ view }: { view: "list" | "timeline" }) {
  const items = [
    { id: "list", href: CHECKS_HREF, label: B.checks.list },
    { id: "timeline", href: TIMELINE_HREF, label: B.checks.timeline },
  ] as const;
  return (
    <nav aria-label={B.checks.views} className="mb-4 lg:mb-6">
      <ul className="inline-grid grid-cols-2 gap-1 rounded-full border bg-[var(--surface)] p-1">
        {items.map((it) => (
          <li key={it.id}>
            <Link
              href={it.href}
              aria-current={view === it.id ? "page" : undefined}
              className={clsx(
                "flex min-h-[44px] items-center justify-center rounded-full px-5 text-[14px] font-medium transition-colors duration-150",
                view === it.id ? "bg-[var(--ink)] text-white" : "text-[var(--muted)] hover:text-[var(--ink)]"
              )}
            >
              {it.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function CheckList({ rows, selected }: { rows: CheckRow[]; selected: string | null }) {
  return (
    <section aria-labelledby="b-list" className="b-card overflow-hidden">
      <div className="flex items-baseline justify-between border-b px-4 py-3">
        <h2 id="b-list" className="b-eyebrow">
          {D.history.title}
        </h2>
        <p className="b-meta">{B.checks.count(rows.length)}</p>
      </div>
      <ul>
        {rows.map((r) => {
          const on = r.scanId === selected;
          return (
            <li key={r.scanId} className="b-row-line">
              <Link
                href={checkHref(r.scanId)}
                aria-label={D.history.openLabel(r.date)}
                aria-current={on ? "true" : undefined}
                className={clsx(
                  "relative flex min-h-[56px] items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-[var(--surface)]",
                  on && "lg:bg-[var(--surface)] lg:before:absolute lg:before:inset-y-0 lg:before:left-0 lg:before:w-[3px] lg:before:bg-[var(--ink)]"
                )}
              >
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{r.date}</span>
                  <span className="block text-[14px]">{r.kindLabel}</span>
                  {r.photoLine && <span className="b-meta block">{r.photoLine}</span>}
                </span>
                {r.kept && <Thumb />}
                <ChevronRight size={18} strokeWidth={1.75} className="shrink-0 text-[var(--muted)]" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Detail({ c, titled }: { c: Opened; titled: boolean }) {
  return (
    <article aria-labelledby={titled ? "b-detail" : undefined} className="b-card overflow-hidden">
      <div className="flex items-start justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <p className="b-eyebrow">{B.checks.openedEyebrow}</p>
          {titled ? (
            <h2 id="b-detail" className="b-h2 mt-0.5">
              {D.history.checkFrom(c.date)}
            </h2>
          ) : null}
          <p className={clsx(titled ? "mt-1" : "mt-0.5", "font-semibold")}>{c.kindLabel}</p>
          {c.photoLine && (
            <div className="mt-1">
              <StatusLine>{c.photoLine}</StatusLine>
            </div>
          )}
        </div>
        {c.kept && <Thumb />}
      </div>

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5 sm:py-5">
        <FixedLine text={PAST_CHECK_LINE} />

        {c.wholeFace && c.regions ? (
          <>
            <div className="flex flex-col gap-5 md:hidden lg:flex xl:hidden">
              <div>
                <h3 className="b-h3 mb-2">{B.home.wholeFace}</h3>
                <Readings readings={c.wholeFace} />
              </div>
              <div>
                <h3 className="b-h3 mb-2">{B.home.byArea}</h3>
                <RegionTabs areas={c.regions} label={B.home.areaTabs} />
              </div>
            </div>
            <div className="hidden md:block lg:hidden xl:block">
              <AreaTable caption={B.home.tableCaption(c.date)} wholeLabel={B.home.wholeFace} wholeFace={c.wholeFace} regions={c.regions} />
            </div>
          </>
        ) : (
          <p>{c.kind === "questions" ? B.checks.questionsOnly : c.kind === "failed" ? B.checks.failed : D.current.unreadable}</p>
        )}

        <div className="flex flex-wrap gap-2 border-t pt-4">
          {c.isNewest && (
            <Link href={ECHO_HREF} className="b-btn-2">
              {D.chat.button}
            </Link>
          )}
          <Link href={NEW_CHECK_HREF} className="b-btn-2">
            {D.newCheck}
          </Link>
        </div>
      </div>
    </article>
  );
}

/** /checks (mode "list") and /checks/[scanId] (mode "detail"). */
export function ChecksWorkspace({ mode, scanId, view = "list" }: { mode: "list" | "detail"; scanId?: string; view?: "list" | "timeline" }) {
  const rows = checkRows();

  if (mode === "list" && view === "timeline") {
    return (
      <Page>
        <PageHeader eyebrow={B.checks.eyebrow} title={B.checks.title} />
        <ViewSwitch view="timeline" />
        <section aria-labelledby="b-tl" className="max-w-4xl">
          <h2 id="b-tl" className="sr-only">
            {B.checks.timeline}
          </h2>
          <TimelineRail items={timeline(DASHBOARDS.set)} />
        </section>
      </Page>
    );
  }

  const selected = mode === "detail" ? scanId! : rows[0]?.scanId;
  const c = selected ? opened(selected) : null;

  if (mode === "detail" && !c) {
    return (
      <Page>
        <PageHeader eyebrow={B.checks.eyebrow} title={B.checks.title} />
        <div role="alert" className="b-card max-w-xl p-5">
          <p>{D.history.notFound}</p>
          <Link href={CHECKS_HREF} className="b-btn-2 mt-4">
            {B.checks.back}
          </Link>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      {mode === "detail" && c ? (
        <>
          <Link href={CHECKS_HREF} className="b-link -mb-3 mt-3 inline-flex min-h-[44px] items-center gap-1.5 text-[14px] sm:mt-5">
            <ArrowLeft size={16} aria-hidden />
            {B.checks.back}
          </Link>
          <PageHeader eyebrow={B.checks.eyebrow} title={D.history.checkFrom(c.date)} />
        </>
      ) : (
        <>
          <PageHeader eyebrow={B.checks.eyebrow} title={B.checks.title} />
          <ViewSwitch view="list" />
        </>
      )}
      <div className="lg:grid lg:grid-cols-[minmax(280px,360px)_1fr] lg:items-start lg:gap-6">
        <div className={clsx(mode === "detail" && "hidden lg:block", "lg:sticky lg:top-6")}>
          <CheckList rows={rows} selected={selected ?? null} />
        </div>
        <div className={clsx(mode === "list" && "hidden lg:block")}>{c ? <Detail c={c} titled={mode === "list"} /> : <p className="b-meta">{B.checks.pickOne}</p>}</div>
      </div>
    </Page>
  );
}
