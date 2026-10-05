// PREVIEW ONLY (direction A): one opened check, as a centred reading page.
// Its own readings only, always with PAST_CHECK_LINE. No other check is shown.
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/CheckReadings";
import { DASHBOARDS, openCheckWithReadings, PAST_CHECK_LINE } from "@/components/preview/fixtures";
import { A_COPY as A } from "@/components/preview/a/copy";
import { P } from "@/components/preview/a/data";
import { btnSecondary, eyebrow, FaceDrawing, FixedLine, h2, PageHeader, PhotoCheckLine, ReadingRows, textLink, Thumb } from "@/components/preview/a/ui";

export const generateStaticParams = () => DASHBOARDS.set.history.map((h) => ({ scanId: h.scanId }));

export default function CheckPage({ params }: { params: { scanId: string } }) {
  const c = openCheckWithReadings(params.scanId);
  if (!c) notFound();
  const date = formatDate(c.date);
  const labels = Object.fromEntries((c.regions ?? []).map((r) => [r.region, r.label])) as Record<"forehead" | "cheeks" | "nose" | "chin", string>;
  const newest = DASHBOARDS.set.echoScanId === c.scanId;

  return (
    <article className="mx-auto max-w-2xl px-4 pb-16 sm:px-6">
      <Link href={`${P}/checks`} className={`${textLink} -ml-1 mt-4 sm:mt-8`}>
        <ChevronLeft aria-hidden size={18} />
        {A.check.back}
      </Link>
      <PageHeader kicker={C.history.kind[c.kind]} title={C.history.checkFrom(date)} />

      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          {c.photoKept && <Thumb />}
          {c.photoCheck && <PhotoCheckLine text={C.photoCheck[c.photoCheck]} />}
        </div>
        <FixedLine text={PAST_CHECK_LINE} />
      </div>

      {c.wholeFace && c.regions ? (
        <>
          <section aria-labelledby="a-whole" className="mt-10">
            <h2 id="a-whole" className={h2}>
              {A.check.wholeFace}
            </h2>
            <div className="mt-3 rounded-2xl bg-[var(--a-linen)] px-5 py-2 sm:px-6">
              <ReadingRows rows={c.wholeFace} />
            </div>
          </section>

          <section aria-labelledby="a-areas" className="mt-10">
            <h2 id="a-areas" className={h2}>
              {A.check.byArea}
            </h2>
            <figure className="mt-4 rounded-2xl border py-6">
              <FaceDrawing labels={labels} />
              <figcaption className="sr-only">{A.check.faceAlt}</figcaption>
            </figure>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {c.regions.map((r) => (
                <div key={r.region} className="rounded-2xl bg-[var(--a-linen)] px-5 pb-2 pt-4">
                  <h3 className={eyebrow}>{r.label}</h3>
                  <ReadingRows rows={r.readings} />
                </div>
              ))}
            </div>
          </section>

          <section aria-labelledby="a-known" className="mt-10 grid gap-6 border-t pt-8 sm:grid-cols-2">
            <div>
              <h2 id="a-known" className="font-semibold">
                {C.current.knownTitle}
              </h2>
              <p className="mt-2 text-[var(--a-muted)]">{C.current.known}</p>
            </div>
            <div>
              <h2 className="font-semibold">{C.current.notKnownTitle}</h2>
              <ul className="mt-2 list-disc pl-5 text-[var(--a-muted)]">
                {C.current.notKnown.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </div>
          </section>
        </>
      ) : (
        <p className="mt-10 rounded-2xl bg-[var(--a-linen)] p-6">{A.check.noReading}</p>
      )}

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Link href="#" className={btnSecondary}>
          {A.check.newCheck}
        </Link>
        {newest && (
          <Link href={`${P}/echo`} className={btnSecondary}>
            {A.check.askEcho}
          </Link>
        )}
      </div>
    </article>
  );
}
