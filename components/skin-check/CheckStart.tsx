"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarCheck, ChevronRight, Lightbulb, ScanFace } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { threeAngleUi } from "@/lib/ui-flags";
import { PHOTO_ROUTE, type CaptureAngle } from "@/lib/feature-contracts/check-photos";
import { CHECK_INTERVAL_RULE, nextCheck, type NextCheck } from "@/lib/home/schedule";
import { loadDashboard } from "@/components/dashboard/data";
import { deriveDashboard, type HistoryRow } from "@/components/dashboard/state";
import { lastReadingDate } from "@/components/dashboard/HomeCards";
import { formatDate } from "@/components/dashboard/format";
import { HOME_COPY as H } from "@/components/dashboard/homeCopy";
import { PhotoStrip, PhotoTile, Skel, TintCard } from "@/components/ui/kit";
import { textLink } from "@/components/ui/page";
import { START_COPY as S } from "./flowCopy";

const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
const DAY = 86_400_000;
// Calendar days, as Today counts them (HomeCards).
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const daysAgo = (d: Date) => Math.max(0, Math.round((startOfDay(new Date()) - startOfDay(d)) / DAY));
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** The strip shows this many of the newest kept photos (mockup 05). */
const STRIP = 4;

type Last = { kind: "hidden" } | { kind: "first"; body: string } | { kind: "last"; date: Date; next: NextCheck };
type Start = { last: Last; history: HistoryRow[] | null };

/**
 * The last check and the history, from the same data and rule as Today's
 * next-check tile (lastReadingDate, nextCheck). Never blocks the check:
 * signed out, still loading or failed, the cards are simply absent.
 */
function useStart(): Start {
  const { user } = useAuth();
  const [start, setStart] = useState<Start>({ last: { kind: "hidden" }, history: null });
  useEffect(() => {
    if (!user) return setStart({ last: { kind: "hidden" }, history: null });
    let active = true;
    loadDashboard(user.uid).then(
      (d) => {
        if (!active) return;
        const dashboard = deriveDashboard(user.uid, d.checks, d.analyses);
        const date = lastReadingDate(dashboard);
        // Checks with no photo reading do not start the count (as on Today).
        const last: Last = date ? { kind: "last", date, next: nextCheck(date, new Date(), tz()) } : { kind: "first", body: dashboard.history.length ? H.next.noReadingNote : H.next.first };
        setStart({ last, history: dashboard.history });
      },
      // Optional on this screen: the check itself works without it.
      () => active && setStart({ last: { kind: "hidden" }, history: [] })
    );
    return () => {
      active = false;
    };
  }, [user]);
  return start;
}

function LastCheckView({ last }: { last: Last }) {
  if (last.kind === "hidden") return null;
  if (last.kind === "first") return <TintCard icon={CalendarCheck} title={S.firstTitle} body={last.body} />;
  const n = last.next;
  const due = n.kind === "in" ? H.next.in(n.days) : n.kind === "today" ? H.next.today : n.kind === "overdue" ? H.next.overdue(n.days) : H.next.first;
  return (
    <TintCard
      icon={CalendarCheck}
      title={
        <>
          <span className="block text-sm font-normal text-brand-text-muted">{S.lastTitle}</span>
          {capital(H.latest.ago(daysAgo(last.date)))}
        </>
      }
      body={`${formatDate(last.date)}. ${due}. ${H.next.every(CHECK_INTERVAL_RULE.days)}`}
    />
  );
}

/** Screen 05 for a returning user (TD-43): the last check only. */
export function LastCheckCard() {
  return <LastCheckView last={useStart().last} />;
}

/** The lighting tip (mockup 05). One photo: Today's own wording; three angles: the same light and place each week. */
export function PhotoTip() {
  return <TintCard icon={Lightbulb} title={<span className="sr-only">{S.tipLabel}</span>} body={threeAngleUi() ? S.tipThree : H.next.tip} />;
}

/** A short-lived link to one of the user's own kept photos, or null (nothing kept, not theirs, or any failure). */
async function keptPhotoUrl(token: string, scanId: string, angle: CaptureAngle = "front"): Promise<string | null> {
  try {
    const q = `scanId=${encodeURIComponent(scanId)}${angle === "front" ? "" : `&angle=${angle}`}`;
    const res = await fetch(`${PHOTO_ROUTE}?${q}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
    const body = res.ok ? ((await res.json()) as { url?: unknown }) : null;
    return typeof body?.url === "string" ? body.url : null;
  } catch {
    return null;
  }
}

/** The newest kept check's three photos (front, left, right), each null when it was not kept. */
function useLastAngles(history: HistoryRow[] | null): Record<CaptureAngle, string | null> | null {
  const { user } = useAuth();
  const [urls, setUrls] = useState<Record<CaptureAngle, string | null> | null>(null);
  useEffect(() => {
    setUrls(null);
    const row = history?.find((h) => h.photoClaimed);
    if (!user || !row) return;
    let active = true;
    (async () => {
      const token = await user.getIdToken().catch(() => null);
      const [front, left, right] = token ? await Promise.all((["front", "left", "right"] as const).map((a) => keptPhotoUrl(token, row.scanId, a))) : [null, null, null];
      if (active) setUrls({ front: front ?? null, left: left ?? null, right: right ?? null });
    })();
    return () => {
      active = false;
    };
  }, [user, history]);
  return urls;
}

/**
 * Three-angle capture only: the three photos of a check. The user's own last
 * kept photos when there are any (through /api/checks/photo?angle=), otherwise
 * an outline. Never a photo of anyone else.
 */
function AnglesRow({ history }: { history: HistoryRow[] | null }) {
  const urls = useLastAngles(history);
  return (
    <section aria-labelledby="angles-title">
      <h2 id="angles-title" className="sr-only">{S.anglesTitle}</h2>
      <ul className="grid grid-cols-3 gap-2">
        {S.angles.map((a) => (
          <li key={a.id} className="flex flex-col overflow-hidden rounded-tile border border-brand-border bg-brand-surface">
            {urls?.[a.id] ? (
              <PhotoTile src={urls[a.id]!} alt={S.lastAngleAlt(a.label)} fallback={a.label} className="rounded-none [&_img]:aspect-square [&>div]:aspect-square" />
            ) : (
              <span aria-hidden className="grid aspect-square place-items-center bg-brand-50 text-brand-700">
                <ScanFace size={40} strokeWidth={1.5} />
              </span>
            )}
            <span className="px-3 py-3 text-[15px] font-medium text-brand-text">{a.label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

type Kept = { key: string; src: string; alt: string; label: string };

/** The user's own kept front photos, newest first, through /api/checks/photo (it checks ownership and that the photo was kept). */
function useKeptPhotos(history: HistoryRow[] | null): Kept[] | null {
  const { user } = useAuth();
  const [photos, setPhotos] = useState<Kept[] | null>(null);
  useEffect(() => {
    setPhotos(null);
    if (!user || !history) return;
    const rows = history.filter((h) => h.photoClaimed).slice(0, STRIP);
    let active = true;
    (async () => {
      const token = await user.getIdToken().catch(() => null);
      const found = token
        ? await Promise.all(
            rows.map(async (h): Promise<Kept | null> => {
              const src = await keptPhotoUrl(token, h.scanId);
              if (!src) return null;
              const when = h.date ? capital(H.latest.ago(daysAgo(h.date))) : S.justNow;
              return { key: h.scanId, src, alt: S.photoAlt(h.date ? formatDate(h.date) : S.justNow), label: when };
            })
          )
        : [];
      if (active) setPhotos(found.filter((p): p is Kept => p !== null));
    })();
    return () => {
      active = false;
    };
  }, [user, history]);
  return photos;
}

function KeptStrip({ history }: { history: HistoryRow[] | null }) {
  const photos = useKeptPhotos(history);
  return (
    <section aria-labelledby="start-photos-title" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 id="start-photos-title" className="text-xl font-semibold text-brand-text">{S.progressTitle}</h2>
        <Link href="/checks" className={`${textLink} -mr-1 text-[15px] font-medium`}>
          {S.history}
          <ChevronRight aria-hidden size={18} />
        </Link>
      </div>
      {photos === null ? (
        <div className="grid grid-cols-4 gap-2">{Array.from({ length: STRIP }, (_, i) => <Skel.Photo key={i} />)}</div>
      ) : photos.length ? (
        // Newest on the left, as in the mockup.
        <PhotoStrip photos={photos} />
      ) : (
        <p className="text-sm text-brand-text-muted">{S.noPhotos}</p>
      )}
    </section>
  );
}

/** Screen 05 under the choice: the last check, the three angles (flag on), the tip and the user's own photos. One read. */
export function StartOverview() {
  const { user } = useAuth();
  const { last, history } = useStart();
  return (
    <>
      <LastCheckView last={last} />
      {threeAngleUi() && <AnglesRow history={history} />}
      <PhotoTip />
      {/* Signed out there are no photos to show. */}
      {user && <KeptStrip history={history} />}
    </>
  );
}
