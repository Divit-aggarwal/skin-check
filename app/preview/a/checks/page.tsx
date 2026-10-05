// PREVIEW ONLY (direction A): the checks list, and ?view=timeline (checks and routine together).
import Link from "next/link";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { DASHBOARDS } from "@/components/preview/fixtures";
import { A_COPY as A } from "@/components/preview/a/copy";
import { checkItem, P, timeline } from "@/components/preview/a/data";
import { btnPrimary, ItemList, PageHeader } from "@/components/preview/a/ui";

export default function ChecksPage({ searchParams }: { searchParams: { view?: string } }) {
  const isTimeline = searchParams.view === "timeline";
  const history = DASHBOARDS.set.history;
  const items = isTimeline ? timeline(history) : history.map((h) => checkItem(h));
  const tab = "inline-flex min-h-[44px] items-center rounded-full px-5 font-medium aria-[current=page]:bg-[var(--a-ink)] aria-[current=page]:text-white hover:bg-[var(--a-linen)] aria-[current=page]:hover:bg-[var(--a-ink)]";

  return (
    <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6 lg:px-8">
      <PageHeader title={A.checks.title} intro={isTimeline ? A.checks.timelineIntro : A.checks.intro} />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <nav aria-label={A.checks.tabs} className="inline-flex gap-1 rounded-full border p-1">
          <Link href={`${P}/checks`} aria-current={isTimeline ? undefined : "page"} className={tab}>
            {A.checks.listTab}
          </Link>
          <Link href={`${P}/checks?view=timeline`} aria-current={isTimeline ? "page" : undefined} className={tab}>
            {A.checks.timelineTab}
          </Link>
        </nav>
        <Link href="#" className={`${btnPrimary} hidden sm:inline-flex lg:hidden`}>
          {C.newCheck}
        </Link>
      </div>
      {items.length ? <ItemList items={items} roomy /> : <p>{A.checks.empty}</p>}
    </div>
  );
}
