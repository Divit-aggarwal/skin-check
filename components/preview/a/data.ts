// PREVIEW ONLY (direction A). Server-side shaping of the fixtures into plain,
// serialisable props. Never import this from a client component: the fixtures
// pull in server code.
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { formatDate } from "@/components/dashboard/CheckReadings";
import { pastCheck, type HistoryRow } from "@/components/dashboard/state";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { DATA, productName, ROUTINE_EVENTS, ROUTINE_WEEK, TODAY } from "@/components/preview/fixtures";
import { A_COPY as A } from "./copy";

export const P = "/preview/a";

/** One timeline or list item: date, kind, photo check and thumbnail only. Never a reading. */
export type Item = {
  key: string;
  sort: string;
  date: string;
  kind: string;
  detail: string | null;
  href: string;
  label: string;
  thumb: boolean;
  routine: boolean;
};

const fmtIso = (iso: string) => formatDate(new Date(`${iso}T12:00:00+05:30`));

type Data = (typeof DATA)[keyof typeof DATA];

export function checkItem(h: HistoryRow, data: Data = DATA.set): Item {
  const date = formatDate(h.date);
  const pc = pastCheck("preview-user", h.scanId, data.checks, data.analyses)?.photoCheck;
  const img = data.checks.find((c) => c.id === h.scanId)?.data.image as { stored?: boolean } | null | undefined;
  return {
    key: h.scanId,
    // Same-day ties: checks after routine events of that day, so the check leads (descending sort).
    sort: `${h.date ? h.date.toISOString().slice(0, 10) : "9999"}|1|${h.scanId}`,
    date,
    kind: C.history.kind[h.kind],
    detail: pc ? C.photoCheck[pc] : null,
    href: `${P}/checks/${h.scanId}`,
    label: C.history.openLabel(date),
    thumb: img?.stored === true,
    routine: false,
  };
}

function routineItems(): Item[] {
  return ROUTINE_EVENTS.map((e) => {
    const name = productName(e.productId);
    const text =
      e.type === "usage"
        ? A.routine.usage(name, R.slot[e.slot], R.status[e.status])
        : e.type === "start"
          ? A.routine.added(name)
          : e.type === "stop"
            ? A.routine.stopped(name)
            : e.type === "substitute"
              ? A.routine.swapped(name)
              : A.routine.changed(name);
    return {
      key: e.eventId,
      sort: `${e.effectiveDate}|0|${e.recordedAt}|${e.eventId}`,
      date: fmtIso(e.effectiveDate),
      kind: A.checks.kindRoutine,
      detail: text,
      href: "#",
      label: A.checks.openRoutine(text),
      thumb: false,
      routine: true,
    };
  });
}

/** Checks and routine events together, newest first. */
export function timeline(history: HistoryRow[], data: Data = DATA.set, withRoutine = true): Item[] {
  const items = [...history.map((h) => checkItem(h, data)), ...(withRoutine ? routineItems() : [])];
  return items.sort((a, b) => (a.sort < b.sort ? 1 : a.sort > b.sort ? -1 : 0));
}

export type Slot = { key: string; name: string; slot: string; status: "used" | "skipped" | "unknown" };

/** Today's planned product slots (AM_PM expanded), from the real adherence helper. */
export const todaySlots = (): Slot[] =>
  ROUTINE_WEEK.days
    .filter((d) => d.date === TODAY)
    .map((d) => ({ key: `${d.productId}|${d.slot}`, name: productName(d.productId), slot: R.slot[d.slot], status: d.status }));
