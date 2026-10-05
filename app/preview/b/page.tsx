// PREVIEW ONLY: direction B Home. ?state=empty | building | loading | error.
import Link from "next/link";
import { ScanFace } from "lucide-react";
import { DASHBOARD_COPY as D } from "@/components/dashboard/copy";
import { DASHBOARDS } from "@/components/preview/fixtures";
import { B_COPY as B } from "@/components/preview/b/copy";
import { latest, routineToday, timeline, todayLabel } from "@/components/preview/b/data";
import { HomeView } from "@/components/preview/b/HomeView";
import { BASE, NEW_CHECK_HREF } from "@/components/preview/b/links";
import { Page, PageHeader } from "@/components/preview/b/ui";

export default function HomePage({ searchParams }: { searchParams: { state?: string } }) {
  const state = searchParams.state;

  if (state === "loading") return <Loading />;
  if (state === "error") return <ErrorState />;
  if (state === "empty") return <Empty />;

  const d = state === "building" ? DASHBOARDS.building : DASHBOARDS.set;
  const l = latest(d);
  if (!l) return <Empty />;
  return (
    <HomeView
      today={todayLabel}
      latest={l}
      trend={d.trend}
      newerNotShown={d.newerCheckNotShown}
      echoReady={d.echoScanId !== null}
      slots={routineToday()}
      recent={timeline(d).slice(0, 4)}
    />
  );
}

function Loading() {
  return (
    <Page>
      <PageHeader eyebrow={B.home.eyebrow(todayLabel)} title={B.home.title} />
      <div role="status" aria-live="polite">
        <span className="sr-only">{D.loading}</span>
        <div aria-hidden className="flex flex-col gap-4 sm:gap-6">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border bg-[var(--line)] lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="bg-white px-4 py-3">
                <div className="b-skel h-3 w-20" />
                <div className="b-skel mt-2 h-5 w-28" />
              </div>
            ))}
          </div>
          <div className="flex flex-col gap-4 sm:gap-6 lg:grid lg:grid-cols-12">
            <div className="b-card p-5 lg:col-span-8">
              <div className="b-skel h-3 w-24" />
              <div className="b-skel mt-2 h-6 w-64 max-w-full" />
              <div className="mt-6 flex flex-col gap-3">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="b-skel h-9" />
                ))}
              </div>
            </div>
            <div className="b-card p-5 lg:col-span-4">
              <div className="b-skel h-3 w-16" />
              <div className="b-skel mt-2 h-6 w-40" />
              <div className="mt-6 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="b-skel h-12" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Page>
  );
}

function ErrorState() {
  return (
    <Page>
      <PageHeader eyebrow={B.home.eyebrow(todayLabel)} title={B.home.title} />
      <div role="alert" className="b-card max-w-xl !border-[var(--error)] p-5 sm:p-6">
        <p className="b-eyebrow !text-[var(--error)]">{B.home.errorTitle}</p>
        <p className="mt-2">{D.error}</p>
        <Link href={BASE} className="b-btn mt-5">
          {B.home.tryAgain}
        </Link>
      </div>
    </Page>
  );
}

function Empty() {
  return (
    <Page>
      <PageHeader eyebrow={B.home.eyebrow(todayLabel)} title={B.home.title} />
      <section aria-labelledby="b-empty" className="b-card max-w-2xl overflow-hidden">
        <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-start sm:p-6">
          <span aria-hidden className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-[#b98783]">
            <ScanFace size={28} strokeWidth={1.5} />
          </span>
          <div className="flex flex-col gap-3">
            <p className="b-eyebrow">{B.home.emptyEyebrow}</p>
            <h2 id="b-empty" className="b-h2">
              {D.empty}
            </h2>
            <p className="max-w-prose">{B.home.emptyBody}</p>
            <Link href={NEW_CHECK_HREF} className="b-btn mt-2 self-start">
              {D.firstCheck}
            </Link>
          </div>
        </div>
        <div className="border-t bg-[var(--surface)] px-5 py-3 sm:px-6">
          <p className="b-meta">{D.chat.needsReading}</p>
        </div>
      </section>
    </Page>
  );
}
