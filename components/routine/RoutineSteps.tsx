"use client";

import Image from "next/image";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { getProduct } from "@/lib/catalog/catalogue";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { OTHER_PRODUCT_ID as OTHER, UNDO_STATUS } from "@/lib/routine/events";
import { ProductTile, StatusMark, type StepStatus } from "@/components/ui/kit";
import type { StoreImage } from "@/lib/feature-contracts/store-products";
import type { RoutineData } from "./useRoutine";

// The store's four steps, shown for one time of day at a time (redesign
// screen 03). Product name, step and what the user logged only: no reading,
// no photo, no claim (R-4 A, D-12). Used, Skipped and Not logged stay three
// different states (TD-50).

export const STEPS = ["cleanse", "serum", "moisturise", "protect"] as const;
export type Step = (typeof STEPS)[number];
export type Slot = "AM" | "PM";

// A routine event has no step, so the step comes from the catalogue category
// at display time. "Other product (not ours)" and category "other" have none.
const STEP_OF_CATEGORY: Record<string, Step> = { cleanser: "cleanse", serum: "serum", moisturiser: "moisturise", sunscreen: "protect" };
export const stepOf = (productId: string): Step | null =>
  productId === OTHER ? null : STEP_OF_CATEGORY[getProduct(productId)?.category ?? ""] ?? null;

/** The add form's address for one step and slot; /routine reads it (RoutinePage). */
export const addHref = (step: Step, slot: Slot) => `/routine#add-${step}-${slot}`;

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

export type Send = (event: Record<string, unknown>) => Promise<void>;
export type DueEntry = { productId: string; name: string; label: string; status: StepStatus };

export const nameIn = (data: RoutineData) => (id: string) => (id === OTHER ? C.otherProduct : data.products.find((p) => p.id === id)?.name ?? id);

const statusIn = (data: RoutineData, slot: Slot) => (productId: string): StepStatus =>
  data.adherence.days.find((d) => d.date === data.today && d.productId === productId && d.slot === slot)?.status ?? "unknown";

/** Today's due entries for one slot, in routine order (the four steps, then the rest). */
export function dueEntries(data: RoutineData, slot: Slot): DueEntry[] {
  const nameOf = nameIn(data);
  const statusOf = statusIn(data, slot);
  const today = weekdayOf(data.today);
  const rank = (id: string) => {
    const s = stepOf(id);
    return s ? STEPS.indexOf(s) : STEPS.length;
  };
  return data.routine
    .filter((i) => (i.schedule.slot === slot || i.schedule.slot === "AM_PM") && i.schedule.days.includes(today))
    .sort((a, b) => rank(a.productId) - rank(b.productId))
    .map((i) => {
      const s = stepOf(i.productId);
      return { productId: i.productId, name: nameOf(i.productId), label: s ? C.steps[s] : C.otherGroup, status: statusOf(i.productId) };
    });
}

/** Used and Skipped as one-tap toggles; tapping the pressed one undoes it (TD-49 "cleared"). */
export function LogButtons({ productId, name, slot, status, busy, send, large = false }: { productId: string; name: string; slot: Slot; status: StepStatus; busy: boolean; send: Send; large?: boolean }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(["used", "skipped"] as const).map((s) => (
        <button
          key={s}
          type="button"
          aria-disabled={busy}
          aria-pressed={status === s}
          aria-label={C.logAs(C.status[s], name, C.slot[slot].toLowerCase())}
          onClick={() => !busy && void send({ type: "usage", productId, slot, status: status === s ? UNDO_STATUS : s })}
          className={`inline-flex items-center justify-center gap-1.5 rounded-full border border-brand-border bg-brand-surface px-4 font-semibold text-brand-text transition-colors duration-fast hover:border-brand-700 aria-disabled:opacity-60 aria-pressed:border-brand-700 aria-pressed:bg-brand-700 aria-pressed:text-white ${large ? "min-h-[52px] text-base" : "min-h-11 text-sm"}`}
        >
          {status === s && <Check aria-hidden size={16} />}
          {s === "used" ? C.used : C.skipped}
        </button>
      ))}
    </div>
  );
}

const badge = "grid size-9 shrink-0 place-items-center rounded-full bg-brand-100 text-base font-semibold text-brand-700";

/** Screen 03: the product's store photo (TD-52), else its step tile. Decorative: the name is beside it. */
function ProductPhoto({ productId, photos }: { productId: string; photos: Record<string, StoreImage> }) {
  const photo = photos[productId];
  if (!photo) return <ProductTile step={stepOf(productId)} size={64} />;
  return <Image src={photo.src} width={photo.width} height={photo.height} alt="" sizes="64px" className="size-16 shrink-0 rounded-tile bg-brand-50 object-contain" />;
}

/** One slot: the four steps in order, then products not in a step. */
export function SlotSteps({ data, slot, busy, send, photos = {} }: { data: RoutineData; slot: Slot; busy: boolean; send: Send; photos?: Record<string, StoreImage> }) {
  const nameOf = nameIn(data);
  const statusOf = statusIn(data, slot);
  const inSlot = data.routine.filter((i) => i.schedule.slot === slot || i.schedule.slot === "AM_PM");
  const other = inSlot.filter((i) => stepOf(i.productId) === null);
  const today = weekdayOf(data.today);

  // Screen 03's step card: photo, then the step (on its first product), the product, today's status.
  const entry = (productId: string, due: boolean, head?: React.ReactNode) => {
    const name = nameOf(productId);
    const status = statusOf(productId);
    return (
      <div key={productId} data-routine-entry className="flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <ProductPhoto productId={productId} photos={photos} />
          <div className="min-w-0 flex-1">
            {head}
            <p className="break-words text-brand-text-muted">{name}</p>
            <p className="mt-1.5 inline-flex rounded-full bg-brand-50 px-2.5 py-0.5 text-sm text-brand-700">{due ? C.todayStatus(C.status[status]) : C.notToday}</p>
          </div>
          {due && <StatusMark status={status} label={C.status[status]} />}
        </div>
        {due && <LogButtons productId={productId} name={name} slot={slot} status={status} busy={busy} send={send} />}
      </div>
    );
  };

  return (
    <ol className="flex flex-col gap-3">
      {STEPS.map((step, i) => {
        const items = inSlot.filter((it) => stepOf(it.productId) === step);
        const label = C.steps[step];
        const number = (
          <span aria-hidden className={badge}>
            {i + 1}
          </span>
        );
        const name = (
          <p className="text-lg font-semibold leading-snug text-brand-text">
            <span className="sr-only">{C.stepNumber(i + 1)}: </span>
            {label}
            {items.length === 0 && !(step === "protect" && slot === "PM") && <span className="sr-only">{C.emptyStep}</span>}
          </p>
        );
        return items.length > 0 ? (
          <li key={step} className="flex items-start gap-3 rounded-card border border-brand-border bg-brand-surface p-4">
            {number}
            <div className="flex min-w-0 flex-1 flex-col gap-4">{items.map((it, n) => entry(it.productId, it.schedule.days.includes(today), n === 0 ? name : undefined))}</div>
          </li>
        ) : (
          <li key={step} className="flex min-h-14 flex-wrap items-center justify-between gap-x-3 rounded-card border border-dashed border-brand-border py-2 pl-4 pr-1">
            <span className="flex items-center gap-3">
              {number}
              {name}
            </span>
            {step === "protect" && slot === "PM" ? (
              <p className="py-2 pr-3 text-sm text-brand-text-muted">{C.eveningProtect}</p>
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
                className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50"
              >
                <Plus aria-hidden size={16} />
                {C.addToStep}
              </Link>
            )}
          </li>
        );
      })}
      {other.length > 0 && (
        <li className="flex flex-col gap-3 rounded-card border border-brand-border bg-brand-surface p-4">
          <p className="font-semibold text-brand-text">{C.otherGroup}</p>
          {other.map((it) => entry(it.productId, it.schedule.days.includes(today)))}
          <p className="text-sm text-brand-text-muted">{C.otherNote}</p>
        </li>
      )}
    </ol>
  );
}
