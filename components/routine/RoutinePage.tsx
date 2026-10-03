"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { getIdToken } from "firebase/auth";
import { useAuth } from "@/lib/auth-context";
import { ROUTINE_COPY as C } from "@/lib/routine/copy";
import { OTHER_PRODUCT_ID as OTHER, type RoutineItem, type Schedule } from "@/lib/routine/events";
import type { Adherence } from "@/lib/routine/adherence";

// The user's own routine record (R-1 A). Product names, schedule and what the
// user logged only: no scans, no skin readings, no product marketing text (R-4 A).
// Every write goes through /api/routine/events (R-6 A).

type ProductOption = { id: string; name: string; available: boolean };
type RoutineData = { today: string; products: ProductOption[]; routine: RoutineItem[]; adherence: Adherence };

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const button = "rounded-md border border-text/20 px-3 py-1 text-sm text-text hover:bg-text/5 disabled:opacity-50";

export function RoutinePage() {
  const { user, loading } = useAuth();
  const [data, setData] = useState<RoutineData | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const call = useCallback(
    async (init?: RequestInit) => {
      if (!user) throw new Error("signed out");
      const token = await getIdToken(user);
      const url = init ? "/api/routine/events" : `/api/routine/events?tz=${encodeURIComponent(timeZone())}`;
      const res = await fetch(url, {
        ...init,
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      });
      if (!res.ok) throw new Error(`routine ${res.status}`);
      return res.json();
    },
    [user]
  );

  const load = useCallback(async () => {
    try {
      setData(await call());
      setFailed(false);
    } catch (error) {
      console.error("[routine] load failed", error);
      setFailed(true);
    }
  }, [call]);

  useEffect(() => {
    if (user) void load();
    else setData(null);
  }, [user, load]);

  const send = async (event: Record<string, unknown>) => {
    if (!data) return;
    setBusy(true);
    try {
      await call({
        method: "POST",
        body: JSON.stringify({ eventId: crypto.randomUUID(), effectiveDate: data.today, timeZone: timeZone(), ...event }),
      });
      await load();
    } catch (error) {
      console.error("[routine] save failed", error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p className="text-body text-text/60">{C.loading}</p>;
  if (!user) {
    return (
      <Link href="/account" className="text-body text-text underline">
        {C.signIn}
      </Link>
    );
  }
  if (!data) return <p className="text-body text-text/60">{failed ? C.error : C.loading}</p>;

  const nameOf = (id: string) => (id === OTHER ? C.otherProduct : data.products.find((p) => p.id === id)?.name ?? id);
  const choices = [...data.products.filter((p) => p.available).map((p) => ({ id: p.id, name: p.name })), { id: OTHER, name: C.otherProduct }];
  const todayWeekday = weekdayOf(data.today);
  const statusOf = (productId: string, slot: string) =>
    data.adherence.days.find((d) => d.date === data.today && d.productId === productId && d.slot === slot)?.status;

  return (
    <div className="flex flex-col gap-8">
      {failed && <p className="text-body text-text/60">{C.error}</p>}

      <section className="flex flex-col gap-3">
        {data.routine.length === 0 && <p className="text-body text-text/60">{C.empty}</p>}
        {data.routine.map((item) => {
          const slots = item.schedule.slot === "AM_PM" ? (["AM", "PM"] as const) : [item.schedule.slot];
          const others = choices.filter((c) => c.id !== item.productId);
          return (
            <div key={item.productId} className="flex flex-col gap-2 rounded-lg border border-text/10 p-4">
              <div className="font-medium text-text">{nameOf(item.productId)}</div>
              <div className="text-sm text-text/60">
                {C.slot[item.schedule.slot]} · {item.schedule.days.map((d) => C.weekdays[d]).join(", ")} · {C.since(item.since)}
              </div>
              {item.schedule.days.includes(todayWeekday) &&
                slots.map((slot) => (
                  <div key={slot} className="flex items-center gap-2 text-sm">
                    <span className="text-text/70">
                      {C.today}, {C.slot[slot]}: {C.status[statusOf(item.productId, slot) ?? "unknown"]}
                    </span>
                    <button className={button} disabled={busy} onClick={() => send({ type: "usage", productId: item.productId, slot, status: "used" })}>
                      {C.used}
                    </button>
                    <button className={button} disabled={busy} onClick={() => send({ type: "usage", productId: item.productId, slot, status: "skipped" })}>
                      {C.skipped}
                    </button>
                  </div>
                ))}
              <div className="flex flex-wrap items-center gap-2">
                <button className={button} disabled={busy} onClick={() => send({ type: "stop", productId: item.productId })}>
                  {C.stop}
                </button>
                <label className="text-sm text-text/70">
                  {C.swapFor}{" "}
                  <select
                    className="rounded-md border border-text/20 bg-transparent px-2 py-1"
                    disabled={busy}
                    value=""
                    onChange={(e) =>
                      e.target.value &&
                      send({ type: "substitute", productId: item.productId, toProductId: e.target.value, schedule: item.schedule })
                    }
                  >
                    <option value="">…</option>
                    {others.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          );
        })}
      </section>

      <AddProduct choices={choices.filter((c) => !data.routine.some((i) => i.productId === c.id))} busy={busy} onAdd={(productId, schedule) => send({ type: "start", productId, schedule })} />

      <section className="flex flex-col gap-2">
        <h2 className="font-display text-lg text-text">{C.last7}</h2>
        <p className="text-sm text-text/70">{C.counts(data.adherence.counts)}</p>
        <ul className="text-sm text-text/70">
          {data.adherence.days.map((d) => (
            <li key={`${d.date}-${d.productId}-${d.slot}`}>
              {d.date} · {C.slot[d.slot]} · {nameOf(d.productId)}: {C.status[d.status]}
            </li>
          ))}
        </ul>
        <p className="text-xs text-text/50">{C.note}</p>
      </section>
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

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-text/10 p-4">
      <h2 className="font-display text-lg text-text">{C.add}</h2>
      <label className="flex flex-col gap-1 text-sm text-text/70">
        {C.product}
        <select className="rounded-md border border-text/20 bg-transparent px-2 py-1" value={productId} onChange={(e) => setProductId(e.target.value)}>
          <option value="">…</option>
          {choices.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm text-text/70">
        {C.when}
        <select
          className="rounded-md border border-text/20 bg-transparent px-2 py-1"
          value={slot}
          onChange={(e) => setSlot(e.target.value as Schedule["slot"])}
        >
          {(["AM", "PM", "AM_PM"] as const).map((s) => (
            <option key={s} value={s}>
              {C.slot[s]}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="flex flex-wrap gap-3 text-sm text-text/70">
        <legend className="mb-1">{C.days}</legend>
        {C.weekdays.map((label, d) => (
          <label key={label} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={days.includes(d)}
              onChange={(e) => setDays(e.target.checked ? [...days, d].sort() : days.filter((x) => x !== d))}
            />
            {label}
          </label>
        ))}
      </fieldset>
      <button
        className={button}
        disabled={busy || !productId || days.length === 0}
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
