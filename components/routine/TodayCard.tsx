"use client";

import Link from "next/link";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { SlotSteps } from "./RoutineSteps";
import type { useRoutine } from "./useRoutine";

// Home's "Today's routine" (TD-24 (2)): the four steps for morning and
// evening, each with its product and one-tap Used or Skipped. Product name,
// step and what the user logged only (R-4 A).

export function TodayCard({ routine }: { routine: ReturnType<typeof useRoutine> }) {
  const { data, failed, busy, send } = routine;

  return (
    <section aria-labelledby="today-title" className="flex flex-col gap-5 rounded-2xl border border-brand-card-line bg-brand-paper p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="today-title" className="font-display text-xl font-semibold uppercase leading-tight tracking-[0.04em] text-brand-title sm:text-[22px]">
          {C.todayTitle}
        </h2>
        <Link href="/routine" className="inline-flex min-h-11 items-center font-semibold text-brand-forest underline-offset-4 hover:underline">
          {C.open}
        </Link>
      </div>
      {!data && !failed && <p className="text-brand-muted" role="status">{C.loading}</p>}
      {failed && <p role="alert">{C.error}</p>}
      {data && (
        <div className="grid gap-6 md:grid-cols-2">
          <SlotSteps data={data} slot="AM" busy={busy} send={send} compact />
          <SlotSteps data={data} slot="PM" busy={busy} send={send} compact />
        </div>
      )}
    </section>
  );
}
