"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { btnPrimary, btnSecondary, card, tintCard } from "@/components/ui/page";
import { Arrow, IconWell, StatusMark } from "@/components/ui/kit";
import { LogButtons, type DueEntry, type Send, type Slot } from "./RoutineSteps";

// "Start routine" (screen 03): one step at a time, the first not-logged step
// of this time of day, over the same Used / Skipped events as the list. No new
// data. Ends in the logged state below.
export function GuidedStep({ entries, slot, busy, send, onExit }: { entries: DueEntry[]; slot: Slot; busy: boolean; send: Send; onExit: () => void }) {
  const i = entries.findIndex((e) => e.status === "unknown");
  const e = entries[i];
  if (!e) return null;
  return (
    <section aria-label={C.stepOfTotal(i + 1, entries.length)} className={`${card} flex flex-col gap-5 p-5`}>
      <p className="text-sm font-semibold text-brand-text-muted">{C.stepOfTotal(i + 1, entries.length)}</p>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold text-brand-text">{e.label}</p>
          <p className="break-words text-brand-text-muted">{e.name}</p>
        </div>
        <StatusMark status={e.status} label={C.status[e.status]} />
      </div>
      <LogButtons productId={e.productId} name={e.name} slot={slot} status={e.status} busy={busy} send={send} large />
      <button type="button" onClick={onExit} className="self-center text-sm font-semibold text-brand-700 underline-offset-4 hover:underline min-h-11">
        {C.exit}
      </button>
    </section>
  );
}

/**
 * Routine Complete (screen 04, no mockup; for owner review): every step of
 * this time of day is logged. What was used and what was skipped, listed
 * apart; the next useful action; back to Today. No streak, no celebration.
 */
export function RoutineLogged({ entries, slot, eveningWaits, onSeeEvening }: { entries: DueEntry[]; slot: Slot; eveningWaits: boolean; onSeeEvening: () => void }) {
  const used = entries.filter((e) => e.status === "used");
  const skipped = entries.filter((e) => e.status === "skipped");
  const list = (title: string, items: DueEntry[]) =>
    items.length > 0 && (
      <div>
        <p className="text-sm font-semibold text-brand-text">{title}</p>
        <ul className="mt-1 text-sm text-brand-text-muted">
          {items.map((e) => (
            <li key={e.productId} className="break-words">
              {e.name}
            </li>
          ))}
        </ul>
      </div>
    );
  return (
    <section aria-labelledby="logged-title" role="status" className={`${tintCard} flex flex-col gap-4`}>
      <div className="flex items-center gap-3">
        <IconWell icon={Check} className="bg-brand-surface" />
        <h2 id="logged-title" className="text-lg font-semibold text-brand-text">
          {C.logged[slot]}
        </h2>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {list(C.usedList, used)}
        {list(C.skippedList, skipped)}
      </div>
      <p className="text-sm text-brand-text">{slot === "AM" && eveningWaits ? C.nextEvening : C.nextNone}</p>
      <div className="flex flex-wrap gap-3">
        <Link href="/dashboard" className={btnPrimary}>
          {C.backToday} <Arrow />
        </Link>
        {slot === "AM" && eveningWaits && (
          <button type="button" onClick={onSeeEvening} className={btnSecondary}>
            {C.seeEvening}
          </button>
        )}
      </div>
    </section>
  );
}
