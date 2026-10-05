"use client";

import Link from "next/link";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { OTHER_PRODUCT_ID as OTHER } from "@/lib/routine/events";
import type { useRoutine } from "./useRoutine";

// Home's "Today's routine" (TD-24 (2)): what is due today, with one-tap Used
// or Skipped. Product name, slot and what the user logged only (R-4 A).

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export function TodayCard({ routine }: { routine: ReturnType<typeof useRoutine> }) {
  const { data, failed, busy, send } = routine;
  const nameOf = (id: string) => (id === OTHER ? C.otherProduct : data?.products.find((p) => p.id === id)?.name ?? id);

  const due = data
    ? data.routine
        .filter((i) => i.schedule.days.includes(weekdayOf(data.today)))
        .flatMap((i) => (i.schedule.slot === "AM_PM" ? (["AM", "PM"] as const) : [i.schedule.slot]).map((slot) => ({ productId: i.productId, slot })))
    : [];
  const statusOf = (productId: string, slot: string) =>
    data?.adherence.days.find((d) => d.date === data.today && d.productId === productId && d.slot === slot)?.status ?? "unknown";

  return (
    <section aria-labelledby="today-title" className="flex flex-col gap-4 rounded-2xl bg-brand-linen p-5 sm:p-6">
      <h2 id="today-title" className="font-display text-xl font-semibold sm:text-[22px]">
        {C.todayTitle}
      </h2>
      {!data && !failed && <p className="text-brand-muted" role="status">{C.loading}</p>}
      {failed && <p role="alert">{C.error}</p>}
      {data && due.length === 0 && <p className="text-brand-muted">{data.routine.length === 0 ? C.empty : C.nothingToday}</p>}
      {due.length > 0 && (
        <ul className="flex flex-col divide-y divide-brand-line">
          {due.map(({ productId, slot }) => {
            const status = statusOf(productId, slot);
            const name = nameOf(productId);
            return (
              <li key={`${productId}-${slot}`} className="flex flex-col gap-3 py-3 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="break-words font-medium">{name}</p>
                  <p className="text-sm text-brand-muted">
                    {C.slot[slot]} · {C.status[status]}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(["used", "skipped"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-disabled={busy}
                      aria-pressed={status === s}
                      aria-label={C.logAs(C.status[s], name, C.slot[slot].toLowerCase())}
                      onClick={() => !busy && void send({ type: "usage", productId, slot, status: s })}
                      className="min-h-11 rounded-full border border-brand-ink px-4 font-medium hover:bg-brand-paper aria-disabled:opacity-60 aria-pressed:bg-brand-action aria-pressed:text-white"
                    >
                      {s === "used" ? C.used : C.skipped}
                    </button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Link href="/routine" className="inline-flex min-h-11 items-center font-medium text-brand-forest underline-offset-4 hover:underline">
        {C.open}
      </Link>
    </section>
  );
}
