"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth-context";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { OTHER_PRODUCT_ID as OTHER, type Schedule } from "@/lib/routine/events";
import { btnPrimary, btnSecondary, card, EmptyState, ErrorState, h2, LoadingState, ReloadButton } from "@/components/ui/page";
import { useRoutine } from "./useRoutine";

// The user's own routine record (R-1 A). Product names, schedule and what the
// user logged only: no skin readings, no product marketing text (R-4 A).
// Every write goes through /api/routine/events (R-6 A).

const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const prettyDate = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
const field = "h-12 w-full min-w-0 max-w-full rounded-lg border border-brand-line bg-brand-paper px-3 text-base text-brand-ink";
const pill = "min-h-11 rounded-full border border-brand-ink px-4 font-medium hover:bg-brand-paper disabled:opacity-50";

export function RoutinePage() {
  const { user, loading } = useAuth();
  const { data, failed, busy, send } = useRoutine();

  if (loading) return <LoadingState label={C.loading} blocks={["h-40", "h-40"]} />;
  if (!user)
    return (
      <EmptyState
        body={C.signIn}
        action={
          <Link href="/account" className={btnPrimary}>
            {C.signInButton}
          </Link>
        }
      />
    );
  if (!data) return failed ? <ErrorState body={C.error} action={<ReloadButton label={C.tryAgain} />} /> : <LoadingState label={C.loading} blocks={["h-40", "h-40"]} />;

  const nameOf = (id: string) => (id === OTHER ? C.otherProduct : data.products.find((p) => p.id === id)?.name ?? id);
  const choices = [...data.products.filter((p) => p.available).map((p) => ({ id: p.id, name: p.name })), { id: OTHER, name: C.otherProduct }];
  const todayWeekday = weekdayOf(data.today);
  const statusOf = (productId: string, slot: string) =>
    data.adherence.days.find((d) => d.date === data.today && d.productId === productId && d.slot === slot)?.status;

  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-12 lg:items-start">
      {failed && (
        <div className="lg:col-span-12">
          <ErrorState body={C.error} action={<ReloadButton label={C.tryAgain} />} />
        </div>
      )}

      <section aria-labelledby="products-title" className="flex flex-col gap-4 sm:gap-6 lg:col-span-7">
        <h2 id="products-title" className={h2}>
          {C.yourProducts}
        </h2>
        {data.routine.length === 0 && <p className={`${card} text-brand-muted`}>{C.empty}</p>}
        {data.routine.map((item) => {
          const slots = item.schedule.slot === "AM_PM" ? (["AM", "PM"] as const) : [item.schedule.slot];
          const others = choices.filter((c) => c.id !== item.productId);
          const name = nameOf(item.productId);
          return (
            <article key={item.productId} data-routine-card className={`${card} flex min-w-0 flex-col gap-4`}>
              <div className="min-w-0">
                <h3 className="break-words font-semibold">{name}</h3>
                <p className="text-sm text-brand-muted">
                  {C.slot[item.schedule.slot]} · {item.schedule.days.map((d) => C.weekdays[d]).join(", ")} · {C.since(prettyDate(item.since))}
                </p>
              </div>
              {item.schedule.days.includes(todayWeekday) &&
                slots.map((slot) => {
                  const status = statusOf(item.productId, slot);
                  return (
                    <div key={slot} className="flex flex-col gap-2 rounded-xl bg-brand-paper p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm">
                        {C.today}, {C.slot[slot]}: {C.status[status ?? "unknown"]}
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        {(["used", "skipped"] as const).map((s) => (
                          <button
                            key={s}
                            type="button"
                            className={`${pill} aria-pressed:bg-brand-action aria-pressed:text-white`}
                            disabled={busy}
                            aria-pressed={status === s}
                            aria-label={C.logAs(C.status[s], name, C.slot[slot].toLowerCase())}
                            onClick={() => void send({ type: "usage", productId: item.productId, slot, status: s })}
                          >
                            {s === "used" ? C.used : C.skipped}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              <div className="flex flex-col gap-3 border-t border-brand-line pt-4 sm:flex-row sm:items-end">
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
                <button type="button" className={btnSecondary} disabled={busy} aria-label={C.stopLabel(name)} onClick={() => void send({ type: "stop", productId: item.productId })}>
                  {C.stop}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      <div className="flex flex-col gap-6 lg:col-span-5">
        <AddProduct choices={choices.filter((c) => !data.routine.some((i) => i.productId === c.id))} busy={busy} onAdd={(productId, schedule) => void send({ type: "start", productId, schedule })} />

        <section aria-labelledby="week-title" className="flex flex-col gap-3 rounded-2xl border border-brand-line p-5 sm:p-6">
          <h2 id="week-title" className={h2}>
            {C.last7}
          </h2>
          <p className="font-medium">{C.counts(data.adherence.counts)}</p>
          <ul className="divide-y divide-brand-line text-sm">
            {data.adherence.days.map((d) => (
              <li key={`${d.date}-${d.productId}-${d.slot}`} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
                <span className="min-w-0 break-words">
                  {prettyDate(d.date)} · {C.slot[d.slot]} · {nameOf(d.productId)}
                </span>
                <span className="font-medium">{C.status[d.status]}</span>
              </li>
            ))}
          </ul>
          <p className="text-sm text-brand-muted">{C.note}</p>
        </section>
      </div>
    </div>
  );
}

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
  const [slot, setSlot] = useState<Schedule["slot"]>("AM");
  const [days, setDays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  if (choices.length === 0) return null;
  const ready = Boolean(productId) && days.length > 0;

  return (
    <section aria-labelledby="add-title" className={`${card} flex flex-col gap-4`}>
      <h2 id="add-title" className={h2}>
        {C.add}
      </h2>
      <label className="flex flex-col gap-1 text-sm font-medium">
        {C.product}
        <select className={field} value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">{C.productPlaceholder}</option>
          {choices.map((c) => (
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
              <span className="flex min-h-11 min-w-12 items-center justify-center rounded-full border border-brand-line bg-brand-paper px-3 text-sm font-medium peer-checked:border-brand-action peer-checked:bg-brand-action peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-forest">
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {!ready && <p className="text-sm text-brand-muted">{C.addHint}</p>}
      <button
        type="button"
        className={btnPrimary}
        disabled={busy || !ready}
        onClick={() => {
          onAdd(productId, { slot, days });
          setProductId("");
        }}
      >
        {C.addButton}
      </button>
    </section>
  );
}
