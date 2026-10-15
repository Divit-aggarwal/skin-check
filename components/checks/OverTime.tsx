"use client";

import Link from "next/link";
import { ChangeSlot, IconWell, LevelTimeline, PhotoStrip, READING_ICON } from "@/components/ui/kit";
import { cn } from "@/lib/utils";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { METRIC_LABELS, isEarlyEstimate, type ShownMetric } from "@/lib/skin-check-skus";
import type { ChangeSlot as Slot, ReadingSeries } from "@/lib/feature-contracts/readings-series";
import { usePhotoUrls } from "./series";

// Lane mm/a: the over-time pieces of screens 09, 11 and 12. A level word per
// check, the kit's timeline of those levels, the kit's change slot (fed only by
// lib/readings/series.ts) and the user's own kept photos.

const TILE: Record<ShownMetric, string> = {
  redness: "bg-concern-redness-soft",
  oiliness: "bg-concern-oiliness-soft",
  texture: "bg-concern-texture-soft",
  blemishes: "bg-concern-blemishes-soft",
  pigment: "bg-concern-pigment-soft",
};

export const shortDate = (at: string | Date) => new Date(at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

/** One reading's level with its change slot, in the reading's soft identity tint. A link when href is given. */
export function LevelTile({ metric, level, slot, href, className }: { metric: ShownMetric; level: string; slot: Slot; href?: string | undefined; className?: string }) {
  const { icon, well } = READING_ICON[metric];
  const body = (
    <>
      <span className="flex items-center gap-2">
        <IconWell icon={icon} size={32} className={cn(well, "bg-white/70")} />
        <span className="text-[13px] font-medium leading-tight text-brand-text">{METRIC_LABELS[metric]}</span>
      </span>
      <span className="text-lg font-semibold leading-tight text-brand-text">{level}</span>
      {isEarlyEstimate(metric) && <span className="text-[11px] text-brand-text-muted">{C.table.earlyEstimate}</span>}
      <span className="mt-auto">
        <ChangeSlot slot={slot} />
      </span>
    </>
  );
  const cls = cn("flex h-full flex-col gap-1.5 rounded-tile p-3", TILE[metric], className);
  return href ? <Link href={href} className={cn(cls, "transition-opacity duration-fast hover:opacity-90")}>{body}</Link> : <div className={cls}>{body}</div>;
}

/** The newest level of a series (the newest check in the window that has one). */
export const latestBand = (s: ReadingSeries) => [...s.points].reverse().find((p) => p.band)?.band ?? null;

/** One reading's level at each check in the window, on the kit timeline. */
export function SeriesTimeline({ series }: { series: ReadingSeries }) {
  return (
    <LevelTimeline
      reading={series.metric}
      label={METRIC_LABELS[series.metric]}
      points={series.points.map((p) => ({ key: p.scanId, dateLabel: shortDate(p.at), band: p.band }))}
    />
  );
}

/** The user's own kept photos (newest four), each labelled with its date. Nothing when none is kept. */
export function OwnPhotos({ checks, empty, action }: { checks: { scanId: string; date: Date | null }[]; empty: React.ReactNode; action?: React.ReactNode }) {
  const urls = usePhotoUrls(checks.map((c) => c.scanId));
  if (checks.length === 0) return <>{empty}</>;
  if (!urls)
    return (
      <ul aria-hidden className="grid grid-cols-4 gap-2">
        {checks.slice(-4).map((c) => (
          <li key={c.scanId} className="aspect-[3/4] animate-pulse rounded-tile bg-brand-50 motion-reduce:animate-none" />
        ))}
      </ul>
    );
  const shown = checks.filter((c) => urls.get(c.scanId));
  if (shown.length === 0) return <>{empty}</>;
  return (
    <PhotoStrip
      action={action}
      photos={shown.map((c) => {
        const date = c.date ? shortDate(c.date) : C.history.justNow;
        return { key: c.scanId, src: urls.get(c.scanId)!, alt: `Your kept photo from ${date}`, label: date };
      })}
    />
  );
}
