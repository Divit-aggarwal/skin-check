"use client";

import Link from "next/link";
import { Camera, ChevronRight, Repeat } from "lucide-react";
import { DASHBOARD_COPY } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/format";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import type { RoutineEvent } from "@/lib/routine/events";
import { IconWell } from "@/components/ui/kit";
import { TIMELINE_COPY as T } from "./copy";
import type { TimelineItem } from "./timeline";

const dayDate = (day: string) => new Date(`${day}T12:00:00`);

function routineText(e: RoutineEvent, nameOf: (id: string) => string): string {
  const name = nameOf(e.productId);
  switch (e.type) {
    case "start":
      return T.routine.start(name);
    case "stop":
      return T.routine.stop(name);
    case "substitute":
      return T.routine.substitute(name, nameOf(e.toProductId));
    case "schedule_change":
      return T.routine.schedule_change(name);
    case "usage":
      return T.routine.usage(name, ROUTINE_COPY.slot[e.slot].toLowerCase(), ROUTINE_COPY.status[e.status]);
  }
}

/**
 * Checks and routine entries by date. A check shows its date and kind; a
 * routine entry shows what the user logged. Never a reading, never a photo
 * (a column of faces between routine entries would read as before and after, D-12).
 */
export function TimelineList({ items, nameOf }: { items: TimelineItem[]; nameOf: (id: string) => string }) {
  if (items.length === 0) return <p className="py-3 text-brand-text-muted">{T.empty}</p>;
  const row = "group flex min-h-16 items-center gap-3 py-3";
  const chevron = <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-text-muted group-hover:text-brand-text" />;
  return (
    <ol className="divide-y divide-brand-border">
      {items.map((i) =>
        i.kind === "check" ? (
          <li key={i.key}>
            <Link href={`/checks/${encodeURIComponent(i.row.scanId)}`} aria-label={T.openCheck(formatDate(i.row.date))} className={row}>
              <IconWell icon={Camera} />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-brand-text">{formatDate(i.row.date)}</span>
                <span className="text-sm text-brand-text-muted">{DASHBOARD_COPY.history.kind[i.row.kind]}</span>
              </span>
              {chevron}
            </Link>
          </li>
        ) : (
          <li key={i.key}>
            <Link href="/routine" className={row}>
              <IconWell icon={Repeat} className="bg-brand-50 text-brand-text-muted" />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-semibold text-brand-text">{formatDate(dayDate(i.day))}</span>
                  <span className="text-sm text-brand-text-muted">{T.routineKind}</span>
                </span>
                <span className="mt-0.5 break-words text-sm text-brand-text-muted">{routineText(i.event, nameOf)}</span>
              </span>
              {chevron}
            </Link>
          </li>
        )
      )}
    </ol>
  );
}
