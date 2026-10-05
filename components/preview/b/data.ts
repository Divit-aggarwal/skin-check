// PREVIEW ONLY (direction B). Server-side: turns the seeded fixtures into plain,
// pre-formatted view data, so client parts never import the fixtures and dates
// render the same on server and client.
import { DASHBOARD_COPY as D } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/CheckReadings";
import type { Dashboard, PhotoCheck } from "@/components/dashboard/state";
import { DASHBOARDS, ROUTINE_EVENTS, ROUTINE_TODAY, TODAY, openCheckWithReadings, productName, regionReadings } from "@/components/preview/fixtures";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { weekdayOf, type RoutineEvent } from "@/lib/routine/events";
import { B_COPY as B } from "./copy";
import { ROUTINE_HREF, checkHref } from "./links";
import type { Area, Reading, Slot, TimelineItem } from "./types";



const dayKey = (d: Date | null) => (d ?? new Date()).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dayLabel = (key: string) => formatDate(new Date(`${key}T12:00:00+05:30`));
export const todayLabel = dayLabel(TODAY);

export const photoLine = (p: PhotoCheck | null) => (p ? D.photoCheck[p] : null);

/** The latest check with a reading: Home's latest-check card and Echo's context. */
export function latest(d: Dashboard) {
  if (d.current.kind !== "reading") return null;
  const v = d.current.view;
  return {
    scanId: v.scanId,
    date: formatDate(v.date),
    photoCheck: v.photoCheck,
    photoLine: photoLine(v.photoCheck),
    wholeFace: v.bands as Reading[] | null,
    regions: v.source === "measured" ? (regionReadings(v.scanId) as Area[]) : null,
    hardToRead: v.hardToRead,
    legacy: v.source === "legacy",
  };
}
export type Latest = NonNullable<ReturnType<typeof latest>>;

/** One opened check (TD-24 (1)): its own readings, always shown with PAST_CHECK_LINE. */
export function opened(scanId: string) {
  const c = openCheckWithReadings(scanId);
  if (!c) return null;
  return {
    scanId,
    date: formatDate(c.date),
    kind: c.kind,
    kindLabel: D.history.kind[c.kind],
    photoLine: photoLine(c.photoCheck),
    wholeFace: c.wholeFace as Reading[] | null,
    regions: c.regions as Area[] | null,
    kept: c.photoKept === true,
    isNewest: DASHBOARDS.set.echoScanId === scanId,
  };
}
export type Opened = NonNullable<ReturnType<typeof opened>>;

/** The checks list: date, kind, photo check and a thumbnail flag only. Never readings. */
export const checkRows = () =>
  DASHBOARDS.set.history.map((h) => {
    const c = openCheckWithReadings(h.scanId);
    return {
      scanId: h.scanId,
      date: formatDate(h.date),
      kindLabel: D.history.kind[h.kind],
      photoLine: photoLine(c?.photoCheck ?? null),
      kept: c?.photoKept === true,
    };
  });
export type CheckRow = ReturnType<typeof checkRows>[number];


function routineItem(e: RoutineEvent): TimelineItem {
  const product = productName(e.productId);
  let title: string = product;
  let meta: string | null = null;
  if (e.type === "usage") {
    title = B.timeline.usage(product);
    meta = `${R.slot[e.slot]} · ${R.status[e.status]}`;
  } else if (e.type === "start") {
    title = B.timeline.started(product);
    meta = R.slot[e.schedule.slot];
  } else if (e.type === "stop") title = B.timeline.stopped(product);
  else if (e.type === "substitute") title = B.timeline.swapped(productName(e.toProductId));
  else title = B.timeline.schedule(product);
  return { key: e.eventId, day: e.effectiveDate, dayLabel: dayLabel(e.effectiveDate), type: "routine", title, meta, href: ROUTINE_HREF, linkLabel: B.timeline.openRoutine(title), kept: false };
}

/** Checks and routine events together, newest day first; on one day, checks first. Never readings. */
export function timeline(d: Dashboard, events: readonly RoutineEvent[] = ROUTINE_EVENTS): TimelineItem[] {
  const checks: TimelineItem[] = d.history.map((h) => {
    const c = openCheckWithReadings(h.scanId);
    const date = formatDate(h.date);
    return {
      key: h.scanId,
      day: dayKey(h.date),
      dayLabel: date,
      type: "check",
      title: D.history.kind[h.kind],
      meta: photoLine(c?.photoCheck ?? null),
      href: checkHref(h.scanId),
      linkLabel: D.history.openLabel(date),
      kept: c?.photoKept === true,
    };
  });
  const routine = [...events].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)).map(routineItem);
  return [...checks, ...routine].sort((a, b) => b.day.localeCompare(a.day) || Number(a.type === "routine") - Number(b.type === "routine"));
}


/** Today's routine, one row per product and slot scheduled today. */
export function routineToday(): Slot[] {
  const wd = weekdayOf(TODAY);
  return ROUTINE_TODAY.filter((i) => i.schedule.days.includes(wd)).flatMap((i) =>
    (i.schedule.slot === "AM_PM" ? (["AM", "PM"] as const) : [i.schedule.slot]).map((slot) => ({
      key: `${i.productId}-${slot}`,
      product: productName(i.productId),
      slot,
      slotLabel: R.slot[slot],
    }))
  );
}
