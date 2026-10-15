"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Info, Plus } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { OTHER_PRODUCT_ID as OTHER, type Schedule } from "@/lib/routine/events";
import { btnPrimary, btnSecondary, card, ErrorState, h2, LoadingState, PageHeader, ReloadButton, SignedOutCard } from "@/components/ui/page";
import { Arrow, IconWell, SegmentedControl } from "@/components/ui/kit";
import { slotNow } from "@/lib/home/today";
import { dueEntries, SlotSteps, STEPS, stepOf, type Slot, type Step } from "./RoutineSteps";
import { GuidedStep, RoutineLogged } from "./RoutineFlow";
import { getProduct } from "@/lib/catalog/catalogue";
import { PRODUCTS_COPY as P } from "@/components/products/copy";
import { ProductTile, productHref } from "@/components/products/ProductTile";
import { ProductPhoto } from "@/components/products/ProductPhoto";
import { useStoreProducts } from "@/components/products/useStoreProducts";
import { timeZone, useRoutine } from "./useRoutine";

// The user's own routine record (R-1 A): today's four steps for morning and
// evening, adding a product (an empty step links here with its step and slot),
// changing or stopping a product, and the last 7 days. Product names, steps,
// schedule and what the user logged only: no skin readings, no photos, no
// product marketing text (R-4 A). Every write goes through /api/routine/events (R-6 A).
// Redesign screen 03: one time of day at a time (morning until 3 pm, then
// evening), "Start routine" one step at a time, and the logged state (04).

const prettyDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
/** The four steps in order, then products outside them (as the step list above). */
const rank = (id: string) => {
  const s = stepOf(id);
  return s ? STEPS.indexOf(s) : STEPS.length;
};
const field = "h-12 w-full min-w-0 max-w-full rounded-lg border border-brand-border bg-brand-surface px-3 text-base text-brand-text";

export function RoutinePage() {
  const { user, loading } = useAuth();
  const { data, failed, busy, send } = useRoutine();
  const [slot, setSlot] = useState<Slot>(() => slotNow(new Date(), timeZone()));
  const [guided, setGuided] = useState(false);
  const store = useStoreProducts();
  // The brief hides the bottom bar during the active routine flow (globals.css, body[data-flow]).
  useEffect(() => {
    if (!guided) return;
    document.body.dataset.flow = "routine";
    return () => void delete document.body.dataset.flow;
  }, [guided]);

  // Before the routine loads, the page's own title (the slot title replaces it once loaded, screen 03).
  const titled = (body: React.ReactNode) => (
    <>
      <PageHeader title={C.title} intro={C.purpose} phoneCompact />
      {body}
    </>
  );
  if (loading) return titled(<LoadingState label={C.loading} blocks={["h-40", "h-40"]} />);
  if (!user) return titled(<SignedOutCard body={C.signIn} />);
  if (!data) return titled(failed ? <ErrorState body={C.error} action={<ReloadButton label={C.tryAgain} />} /> : <LoadingState label={C.loading} blocks={["h-40", "h-40"]} />);

  const nameOf = (id: string) => (id === OTHER ? C.otherProduct : data.products.find((p) => p.id === id)?.name ?? id);
  const choices = [...data.products.filter((p) => p.available).map((p) => ({ id: p.id, name: p.name })), { id: OTHER, name: C.otherProduct }];

  const entries = dueEntries(data, slot);
  const pending = entries.filter((e) => e.status === "unknown");
  const allLogged = entries.length > 0 && pending.length === 0;
  const eveningWaits = dueEntries(data, "PM").some((e) => e.status === "unknown");
  const choose = (s: Slot) => (setSlot(s), setGuided(false));

  return (
    // In the guided mode only the current step shows (the brief's focused routine flow).
    <div className={`flex flex-col gap-7 ${guided && pending.length > 0 ? "[&>*:not([data-keep])]:hidden" : ""}`}>
      {failed && <div data-keep><ErrorState body={C.error} action={<ReloadButton label={C.tryAgain} />} /></div>}

      <div data-keep className="flex flex-col gap-4">
        {/* Screen 03: the time of day's title and how many steps are due; no time estimates (none are stored). */}
        <div className="pt-1 sm:pt-12">
          <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.02em] text-brand-text">{C.slotTitle[slot]}</h1>
          <p className="mt-1.5 text-lg text-brand-text-muted">{entries.length > 0 ? C.dueCount(entries.length) : C.nothingInSlot}</p>
        </div>
        <SegmentedControl label={C.slotSwitch} value={slot} onChange={choose} options={[{ value: "AM", label: C.slot.AM }, { value: "PM", label: C.slot.PM }]} />
        {allLogged && <RoutineLogged entries={entries} slot={slot} eveningWaits={eveningWaits} onSeeEvening={() => choose("PM")} />}
        <section aria-label={C.slot[slot]} className="flex flex-col gap-4">
          {guided && pending.length > 0 ? (
            <GuidedStep entries={entries} slot={slot} busy={busy} send={send} onExit={() => setGuided(false)} />
          ) : (
            <SlotSteps data={data} slot={slot} busy={busy} send={send} store={store} />
          )}
        </section>
        {!guided && pending.length > 0 && (
          // Above the phone's bottom bar; in the page flow from 640px.
          <div className="sticky bottom-[calc(76px+env(safe-area-inset-bottom))] z-20 sm:static">
            <button type="button" className={`${btnPrimary} w-full`} onClick={() => setGuided(true)}>
              {pending.length === entries.length ? C.start : C.continue} <Arrow />
            </button>
          </div>
        )}
      </div>

      {/* The routine record's purpose (R-1 A), where screen 03 has its footer note. */}
      <p className="-mt-3 flex items-start gap-3 rounded-card bg-brand-50 px-4 py-3 text-sm text-brand-text-muted">
        <Info aria-hidden size={20} className="mt-0.5 shrink-0 text-brand-text" />
        {C.purpose}
      </p>

      {/* Redesign screen 06 as the routine set-up: the user's own products as step cards, then the add form (R-2 B: no recommendation here). */}
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
        <section aria-labelledby="products-title" className="flex flex-col gap-3 lg:col-span-7">
          <h2 id="products-title" className={h2}>
            {C.yourProducts}
          </h2>
          {data.routine.length === 0 && <p className={`${card} text-brand-text-muted`}>{C.empty}</p>}
          {[...data.routine].sort((a, b) => rank(a.productId) - rank(b.productId)).map((item, i) => {
            const others = choices.filter((c) => c.id !== item.productId);
            const name = nameOf(item.productId);
            const step = stepOf(item.productId);
            const listed = item.productId !== OTHER && getProduct(item.productId) !== undefined;
            return (
              <article key={item.productId} data-routine-card className={`${card} flex min-w-0 flex-col gap-3`}>
                <div className="flex min-w-0 items-start gap-3">
                  {/* Screen 06: the step number, then the store's photo (TD-52), or the step tile when the store is not read. */}
                  <span aria-hidden className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">{i + 1}</span>
                  <ProductPhoto image={store?.find((s) => s.productId === item.productId)?.images[0]} step={step} width={64} height={80} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-brand-text">{step ? C.steps[step] : C.otherGroup}</p>
                    <h3 className="break-words text-brand-text-muted">{name}</h3>
                    <p className="mt-2 inline-flex rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-700">{C.slot[item.schedule.slot]}</p>
                    <p className="mt-1 text-sm text-brand-text-muted">
                      {item.schedule.days.length === 7 ? C.everyDay : item.schedule.days.map((d) => C.weekdays[d]).join(", ")} · {C.since(prettyDate(item.since))}
                    </p>
                  </div>
                  {listed && (
                    <Link href={productHref(item.productId)} aria-label={P.detailsLabel(name)} className="-mr-2 grid size-11 shrink-0 place-items-center rounded-full text-brand-text-muted hover:bg-brand-50">
                      <ChevronRight aria-hidden size={20} />
                    </Link>
                  )}
                </div>
                <details className="group border-t border-brand-border pt-1">
                  <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-brand-700">{C.manage}</summary>
                  <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:items-end">
                    {/* R-6: a long product name in the list must not widen the card past a phone screen. */}
                    <label className="flex w-full min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
                      {C.swapFor}
                      <select
                        className={field}
                        disabled={busy}
                        value=""
                        aria-label={C.swapLabel(name)}
                        onChange={(e) => e.target.value && void send({ type: "substitute", productId: item.productId, toProductId: e.target.value, schedule: item.schedule })}
                      >
                        <option value="">{C.swapPlaceholder}</option>
                        {others.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className={btnSecondary} aria-disabled={busy} aria-label={C.stopLabel(name)} onClick={() => !busy && void send({ type: "stop", productId: item.productId })}>
                      {C.stop}
                    </button>
                  </div>
                </details>
              </article>
            );
          })}
        </section>

        <div className="lg:col-span-5">
          <AddProduct
            choices={choices.filter((c) => !data.routine.some((i) => i.productId === c.id))}
            busy={busy}
            onAdd={(productId, schedule) => void send({ type: "start", productId, schedule })}
          />
        </div>
      </div>

      <section aria-labelledby="week-title" className={`${card} flex flex-col gap-3`}>
        <h2 id="week-title" className={h2}>
          {C.last7}
        </h2>
        <dl className="grid grid-cols-3 gap-2">
          {(["used", "skipped", "unknown"] as const).map((k) => (
            <div key={k} className="rounded-tile bg-brand-50 px-3 py-2">
              <dt className="text-xs font-medium text-brand-text-muted">{C.status[k]}</dt>
              <dd className="text-xl font-semibold text-brand-text">{data.adherence.counts[k]}</dd>
            </div>
          ))}
        </dl>
        <ul className="divide-y divide-brand-border text-sm">
          {data.adherence.days.map((d) => (
            <li key={`${d.date}-${d.productId}-${d.slot}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
              <span className="min-w-0 break-words">
                {prettyDate(d.date)} · {C.slot[d.slot]} · {nameOf(d.productId)}
              </span>
              <span className={d.status === "unknown" ? "text-brand-text-muted" : "font-semibold"}>{C.status[d.status]}</span>
            </li>
          ))}
        </ul>
        <p className="text-sm text-brand-text-muted">{C.note}</p>
      </section>
    </div>
  );
}

const ADD_HASH = /^#add-([a-z]+)-(AM|PM)$/;

function AddProduct({
  choices,
  busy,
  onAdd,
}: {
  choices: { id: string; name: string }[];
  busy: boolean;
  onAdd: (productId: string, schedule: Schedule) => void;
}) {
  const [productId, setProductId] = useState("");
  const [step, setStep] = useState<Step | "">("");
  const [slot, setSlot] = useState<Schedule["slot"]>("AM");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const section = useRef<HTMLElement>(null);
  const select = useRef<HTMLSelectElement>(null);

  // An empty step links to #add-<step>-<slot> (Home and this page): preselect both.
  useEffect(() => {
    const read = () => {
      const m = ADD_HASH.exec(window.location.hash);
      if (!m || !(STEPS as readonly string[]).includes(m[1]!)) return;
      setStep(m[1] as Step);
      setSlot(m[2] as Schedule["slot"]);
      setProductId("");
      section.current?.scrollIntoView({ block: "start" });
      select.current?.focus({ preventScroll: true });
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  if (choices.length === 0) return null;
  const shown = step ? choices.filter((c) => c.id === OTHER || stepOf(c.id) === step) : choices;
  const ready = Boolean(productId) && days.length > 0;

  return (
    <section ref={section} id="add" aria-labelledby="add-title" className={`${card} flex scroll-mt-6 flex-col gap-4`}>
      <div className="flex items-center gap-3">
        <IconWell icon={Plus} />
        <div className="min-w-0">
          <h2 id="add-title" className={h2}>
            {C.add}
          </h2>
          <p className="text-sm text-brand-text-muted">{C.addIntro}</p>
        </div>
      </div>
      {/* The chosen step's tile beside its select, so the form reads as a step card (screen 06). */}
      <div className="flex min-w-0 items-end gap-3">
        <ProductTile step={step || null} size={48} />
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm font-medium">
          {C.stepLabel}
          <select className={field} value={step} onChange={(e) => (setStep(e.target.value as Step | ""), setProductId(""))}>
            <option value="">{C.allSteps}</option>
            {STEPS.map((s) => (
              <option key={s} value={s}>
                {C.steps[s]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {step && !shown.some((c) => c.id !== OTHER) && <p className="text-sm text-brand-text-muted">{C.noProductForStep}</p>}
      <label className="flex flex-col gap-1 text-sm font-medium">
        {C.product}
        <select ref={select} className={field} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">{C.productPlaceholder}</option>
          {shown.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {C.when}
        <select className={field} value={slot} onChange={(e) => setSlot(e.target.value as Schedule["slot"])}>
          {(["AM", "PM", "AM_PM"] as const).map((s) => (
            <option key={s} value={s}>
              {C.slot[s]}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{C.days}</legend>
        <div className="flex flex-wrap gap-2">
          {C.weekdays.map((label, d) => (
            <label key={label} className="relative">
              <input
                type="checkbox"
                className="peer absolute inset-0 cursor-pointer opacity-0"
                checked={days.includes(d)}
                onChange={(e) => setDays(e.target.checked ? [...days, d].sort() : days.filter((x) => x !== d))}
              />
              <span className="flex min-h-11 min-w-12 items-center justify-center rounded-full border border-brand-border bg-brand-surface px-3 text-sm font-medium peer-checked:border-brand-700 peer-checked:bg-brand-700 peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-700">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {!ready && <p className="text-sm text-brand-text-muted">{C.addHint}</p>}
      <button
        type="button"
        className={btnPrimary}
        // Never disabled: a disabled button drops keyboard focus (flow review G03).
        aria-disabled={busy || !ready}
        onClick={() => {
          if (busy || !ready) return;
          onAdd(productId, { slot, days });
          setProductId("");
        }}
      >
        {C.addButton}
      </button>
    </section>
  );
}
