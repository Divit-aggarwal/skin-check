"use client";

import Link from "next/link";
import { Camera, ChevronRight, Repeat } from "lucide-react";
import { DASHBOARD_COPY } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/format";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import type { RoutineEvent } from "@/lib/routine/events";
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
 * Checks and routine entries by date. A check shows its date and kind (and a
 * kept photo); a routine entry shows what the user logged. Never a reading.
 */
export function TimelineList({
  items,
  nameOf,
  thumb,
}: {
  items: TimelineItem[];
  nameOf: (id: string) => string;
  thumb?: (scanId: string) => React.ReactNode;
}) {
  if (items.length === 0) return <p className="text-brand-muted">{T.empty}</p>;
  return (
    <ol className="divide-y divide-brand-line">
      {items.map((i) =>
        i.kind === "check" ? (
          <li key={i.key}>
            <Link
              href={`/checks/${encodeURIComponent(i.row.scanId)}`}
              aria-label={T.openCheck(formatDate(i.row.date))}
              className="group flex min-h-14 items-center gap-4 py-3"
            >
              {(thumb && thumb(i.row.scanId)) ?? (
                <span aria-hidden className={`grid shrink-0 place-items-center text-brand-muted ${thumb ? "size-12" : "size-6"}`}>
                  <Camera size={18} />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3">
                <span className="font-semibold">{formatDate(i.row.date)}</span>
                <span className="text-sm text-brand-muted">{DASHBOARD_COPY.history.kind[i.row.kind]}</span>
              </span>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-muted group-hover:text-brand-ink" />
            </Link>
          </li>
        ) : (
          <li key={i.key}>
            <Link href="/routine" className="group flex min-h-14 items-center gap-4 py-3">
              <span aria-hidden className={`grid shrink-0 place-items-center text-brand-muted ${thumb ? "size-12" : "size-6"}`}>
                <Repeat size={18} />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-semibold">{formatDate(dayDate(i.day))}</span>
                  <span className="text-sm text-brand-muted">{T.routineKind}</span>
                </span>
                <span className="mt-0.5 break-words text-sm text-brand-muted">{routineText(i.event, nameOf)}</span>
              </span>
              <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-muted group-hover:text-brand-ink" />
            </Link>
          </li>
        )
      )}
    </ol>
  );
}
