"use client";
// PREVIEW ONLY (direction A). Today's routine with one-tap Used / Skipped per
// product and slot. Local state only; both choices look the same.
import { useState } from "react";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { A_COPY as A } from "./copy";

type Slot = { key: string; name: string; slot: string; status: "used" | "skipped" | "unknown" };

export function RoutineToday({ slots }: { slots: Slot[] }) {
  const [state, setState] = useState<Record<string, Slot["status"]>>(() => Object.fromEntries(slots.map((s) => [s.key, s.status])));
  if (slots.length === 0) return <p className="text-[var(--a-muted)]">{A.home.routineNone}</p>;
  return (
    <ul className="flex flex-col divide-y divide-[var(--a-border)]">
      {slots.map((s) => (
        <li key={s.key} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
          <div className="flex items-start gap-3">
            <span aria-hidden className="mt-2 size-2 shrink-0 rounded-full bg-[var(--a-accent)]" />
            <div className="min-w-0">
              <p className="font-medium leading-snug [overflow-wrap:anywhere]">{s.name}</p>
              <p className="text-[14px] text-[var(--a-muted)]">{s.slot}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 pl-5">
            {(["used", "skipped"] as const).map((st) => {
              const on = state[s.key] === st;
              return (
                <button
                  key={st}
                  type="button"
                  aria-pressed={on}
                  aria-label={A.routine.slotLabel(s.name, s.slot, R.status[st])}
                  onClick={() => setState((p) => ({ ...p, [s.key]: on ? "unknown" : st }))}
                  className="min-h-[44px] rounded-full border border-[var(--a-ink)] bg-[var(--a-paper)] px-3 text-[14px] font-medium aria-pressed:bg-[var(--a-ink)] aria-pressed:text-white"
                >
                  {R.status[st]}
                </button>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
