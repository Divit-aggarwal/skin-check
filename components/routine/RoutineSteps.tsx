"use client";

import Link from "next/link";
import { Check, Circle, Minus, Plus } from "lucide-react";
import { getProduct } from "@/lib/catalog/catalogue";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { OTHER_PRODUCT_ID as OTHER } from "@/lib/routine/events";
import type { RoutineData } from "./useRoutine";

// The store's four steps, shown for morning and evening (G03 part 3). Shared
// by Home's "Today's routine" and /routine. Product name, step and what the
// user logged only: no reading, no photo, no claim (R-4 A, D-12).

export const STEPS = ["cleanse", "serum", "moisturise", "protect"] as const;
export type Step = (typeof STEPS)[number];
type Slot = "AM" | "PM";

// A routine event has no step, so the step comes from the catalogue category
// at display time. "Other product (not ours)" and category "other" have none.
const STEP_OF_CATEGORY: Record<string, Step> = { cleanser: "cleanse", serum: "serum", moisturiser: "moisturise", sunscreen: "protect" };
export const stepOf = (productId: string): Step | null =>
  productId === OTHER ? null : STEP_OF_CATEGORY[getProduct(productId)?.category ?? ""] ?? null;

/** The add form's address for one step and slot; /routine reads it (RoutinePage). */
export const addHref = (step: Step, slot: Slot) => `/routine#add-${step}-${slot}`;

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

type Send = (event: Record<string, unknown>) => Promise<void>;

/** One slot (morning or evening): the four steps in order, then products not in a step. */
export function SlotSteps({ data, slot, busy, send, compact = false }: { data: RoutineData; slot: Slot; busy: boolean; send: Send; compact?: boolean }) {
  const nameOf = (id: string) => (id === OTHER ? C.otherProduct : data.products.find((p) => p.id === id)?.name ?? id);
  const inSlot = data.routine.filter((i) => i.schedule.slot === slot || i.schedule.slot === "AM_PM");
  const other = inSlot.filter((i) => stepOf(i.productId) === null);
  const today = weekdayOf(data.today);
  const statusOf = (productId: string) =>
    data.adherence.days.find((d) => d.date === data.today && d.productId === productId && d.slot === slot)?.status ?? "unknown";
  const titleId = `slot-${slot}-${compact ? "home" : "page"}`;

  const entry = (productId: string, due: boolean) => {
    const name = nameOf(productId);
    const status = statusOf(productId);
    const Icon = status === "used" ? Check : status === "skipped" ? Minus : Circle;
    return (
      <div key={productId} data-routine-entry className="flex flex-col gap-3">
        <div className="min-w-0">
          <p className="break-words font-semibold">{name}</p>
          <p className="flex items-center gap-1.5 text-sm text-brand-muted">
            {due ? (
              <>
                <Icon aria-hidden size={14} className={status === "unknown" ? undefined : "text-brand-forest"} />
                {C.todayStatus(C.status[status])}
              </>
            ) : (
              C.notToday
            )}
          </p>
        </div>
        {due && (
          <div className="grid max-w-xs grid-cols-2 gap-2">
            {(["used", "skipped"] as const).map((s) => (
              <button
                key={s}
                type="button"
                aria-disabled={busy}
                aria-pressed={status === s}
                aria-label={C.logAs(C.status[s], name, C.slot[slot].toLowerCase())}
                onClick={() => !busy && void send({ type: "usage", productId, slot, status: s })}
                className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full border border-brand-line bg-brand-paper px-4 text-sm font-semibold hover:border-brand-ink aria-disabled:opacity-60 aria-pressed:border-brand-forest aria-pressed:bg-brand-forest aria-pressed:text-white"
              >
                {status === s && <Check aria-hidden size={16} />}
                {s === "used" ? C.used : C.skipped}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3">
      <h3 id={titleId} className="text-lg font-semibold">
        {C.slot[slot]}
      </h3>
      <ol className="flex flex-col gap-2">
        {STEPS.map((step, i) => {
          const items = inSlot.filter((it) => stepOf(it.productId) === step);
          const label = C.steps[step];
          return (
            <li
              key={step}
              className={
                items.length > 0
                  ? "flex flex-col gap-3 rounded-xl border border-brand-card-line bg-brand-paper p-4"
                  : "flex min-h-14 flex-wrap items-center justify-between gap-x-3 rounded-xl border border-dashed border-brand-line py-1 pl-4 pr-1"
              }
            >
              <p className="flex items-baseline gap-2 text-xs font-bold uppercase tracking-[0.08em] text-brand-eyebrow">
                <span>{C.stepNumber(i + 1)}</span>
                <span aria-hidden>·</span>
                <span>{label}</span>
                {items.length === 0 && !(step === "protect" && slot === "PM") && <span className="sr-only">{C.emptyStep}</span>}
              </p>
              {items.length > 0 ? (
                items.map((it) => entry(it.productId, it.schedule.days.includes(today)))
              ) : step === "protect" && slot === "PM" ? (
                <p className="py-2 pr-3 text-sm text-brand-muted">
                  {C.eveningProtect}
                </p>
              ) : (
                <Link
                  href={addHref(step, slot)}
                  onClick={(e) => {
                    // Already on /routine: Next does not fire hashchange for a same-page link.
                    if (window.location.pathname !== "/routine") return;
                    e.preventDefault();
                    window.history.replaceState(null, "", addHref(step, slot));
                    window.dispatchEvent(new HashChangeEvent("hashchange"));
                  }}
                  aria-label={C.addToStepLabel(label, C.slot[slot].toLowerCase())}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-brand-forest hover:bg-brand-mist"
                >
                  <Plus aria-hidden size={16} />
                  {C.addToStep}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
      {other.length > 0 && (
        <div className="flex flex-col gap-3 rounded-xl border border-brand-card-line bg-brand-paper p-4">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-brand-eyebrow">{C.otherGroup}</p>
          {other.map((it) => entry(it.productId, it.schedule.days.includes(today)))}
          {!compact && <p className="text-sm text-brand-muted">{C.otherNote}</p>}
        </div>
      )}
    </section>
  );
}
