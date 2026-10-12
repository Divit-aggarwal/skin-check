"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { Check, ChevronRight, CloudSun, X } from "lucide-react";
import { AccountButton, btnPrimary, card, eyebrow } from "@/components/ui/page";
import { Thumb } from "@/components/checks/Thumb";
import { stepOf, STEPS } from "@/components/routine/RoutineSteps";
import type { useRoutine } from "@/components/routine/useRoutine";
import { pickStarters } from "@/components/skin-check/echoStarters";
import { QuestionsCard } from "@/components/skin-check/QuestionsChoice";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { UNDO_STATUS } from "@/lib/routine/events";
import { daysLoggedLast7, routineStreak } from "@/lib/routine/streak";
import { ECHO_REGION_LABELS } from "@/lib/echo-regions";
import { echoOn } from "@/lib/echo-limits";
import { safetyQuestionsAnswered } from "@/lib/skin-check-validation";
import { isDue, nextCheck } from "@/lib/home/schedule";
import { mainAction, ringValues, slotNow, topReadings, type DueStep } from "@/lib/home/today";
import { uvCategory, type WeatherReading } from "@/lib/home/weather";
import { needsHomeScreen, type HomeSettings } from "@/lib/home/permissions";
import { pushOn, weatherOn } from "@/lib/home/switches";
import { DASHBOARD_COPY as C } from "./copy";
import { HOME_COPY as H } from "./homeCopy";
import { FaceDrawing } from "./FaceDrawing";
import { formatDate } from "./format";
import type { DashboardData } from "./data";
import { checkAnswers, type Dashboard } from "./state";
import { lastReadingDate, useOpenEcho, WeatherCard } from "./HomeCards";
import { lastWeather, weatherAt } from "./homeSettings";

// TD-48: Home below 1024px. One "Today" card and compact rows, so the
// greeting, Today, the routine row, the latest check row and the Echo chips
// fit one 390 x 844 screen. Same data, routes and rules as Home v2 (TD-47);
// the desktop Home is unchanged. Nothing here compares checks or links the
// weather to the skin.

type Routine = ReturnType<typeof useRoutine>;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
const row = `${card} !p-4 sm:!p-5`;

export function PhoneHome({
  user,
  data,
  dashboard,
  settings,
  onSettings,
  routine,
  productsOn,
  hello,
  waiting,
}: {
  user: User;
  data: DashboardData;
  dashboard: Dashboard;
  settings: HomeSettings | null;
  onSettings: (s: HomeSettings) => void;
  routine: Routine;
  productsOn: boolean;
  hello: string;
  waiting: { isEcho: boolean; date: Date | null } | null;
}) {
  const now = new Date();
  const slot = slotNow(now, tz());
  const rank = (id: string) => {
    const s = stepOf(id);
    return s ? STEPS.indexOf(s) : STEPS.length;
  };
  const steps: DueStep[] = routine.data
    ? routine.data.adherence.days
        .filter((d) => d.date === routine.data!.today)
        .sort((a, b) => (a.slot === b.slot ? rank(a.productId) - rank(b.productId) : a.slot === "AM" ? -1 : 1))
    : [];
  const next = nextCheck(lastReadingDate(dashboard), now, tz());
  const action = mainAction({ checkDue: isDue(next) || next.kind === "first", steps, slot });
  const nameOf = (id: string) => routine.data?.products.find((p) => p.id === id)?.name ?? ROUTINE_COPY.otherProduct;
  const stepLabel = (id: string) => {
    const s = stepOf(id);
    return s ? ROUTINE_COPY.steps[s] : nameOf(id);
  };
  const send = (d: DueStep, status: "used" | typeof UNDO_STATUS) => void routine.send({ type: "usage", productId: d.productId, slot: d.slot, status });
  const city = settings?.city ?? null;
  const date = now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <main className="mx-auto flex w-full max-w-[600px] flex-col gap-3 px-4 pb-28 pt-5 sm:px-6 sm:pt-8">
      {/* 1. Greeting: date and city on one small line; the Account button sits top right (shell). */}
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`${eyebrow} truncate`}>{city ? `${date} · ${city.name}` : date}</p>
          <h1 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.025em] text-brand-title sm:text-[32px]">{hello}</h1>
        </div>
        <AccountButton />
      </header>

      {/* 2. Today */}
      <TodayCard user={user} dashboard={dashboard} settings={settings} onSettings={onSettings} routine={routine} steps={steps} next={next} action={action} stepLabel={stepLabel} send={send} />

      {/* 3. Routine row: this time of day's steps. */}
      <RoutineRow routine={routine} steps={steps.filter((s) => s.slot === slot)} slot={slot} stepLabel={stepLabel} nameOf={nameOf} send={send} />

      {/* 4. Latest check row */}
      <LatestRow dashboard={dashboard} />

      {/* TD-33 (1): while a check's questions wait. */}
      {waiting && <QuestionsCard isEcho={waiting.isEcho} date={waiting.date ? formatDate(waiting.date) : null} />}

      {/* 5. Echo chips */}
      {echoOn() && <EchoChips uid={user.uid} dashboard={dashboard} data={data} productsOn={productsOn} />}

      {/* 6. Below the fold: two tiles and the one honest line. */}
      <section aria-label={H.tiles.progress} className="grid grid-cols-2 gap-3">
        <Tile title={H.tiles.progress} value={H.tiles.progressValue(routine.data ? daysLoggedLast7(routine.data.events, routine.data.today) : 0)} note={H.tiles.progressNote} />
        {/* The honest line sits in the tile, not loose on the page (design review). */}
        <Tile title={H.tiles.starting} value={H.tiles.startingValue(dashboard.trend.count, dashboard.trend.needed)} note={dashboard.trend.kind === "empty" ? C.trend.empty : C.trend.notEnough} />
      </section>
    </main>
  );
}

function Tile({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-2xl border border-brand-card-line bg-brand-paper p-4">
      <p className="text-xs font-semibold text-brand-muted">{title}</p>
      <p className="font-display text-lg font-semibold text-brand-title">{value}</p>
      {note && <p className="text-xs text-brand-muted">{note}</p>}
    </div>
  );
}

// ─── Today ──────────────────────────────────────────────────────────────────

function Ring({ done, total }: { done: number; total: number }) {
  const r = 30;
  const c = 2 * Math.PI * r;
  const part = total > 0 ? done / total : 0;
  return (
    <div role="img" aria-label={H.today.ringLabel(done, total)} className="relative size-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="size-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" className="stroke-brand-line" />
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="7" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - part)} className="stroke-brand-action motion-safe:transition-[stroke-dashoffset] motion-safe:duration-500" />
      </svg>
      <span aria-hidden className="absolute inset-0 flex flex-col items-center justify-center text-center leading-none">
        <span className="font-display text-lg font-semibold text-brand-title">{H.today.ringCount(done, total)}</span>
        <span className="mt-0.5 text-xs font-medium text-brand-muted">{H.today.ringToday}</span>
      </span>
    </div>
  );
}

function TodayCard({
  user,
  dashboard,
  settings,
  onSettings,
  routine,
  steps,
  next,
  action,
  stepLabel,
  send,
}: {
  user: User;
  dashboard: Dashboard;
  settings: HomeSettings | null;
  onSettings: (s: HomeSettings) => void;
  routine: Routine;
  steps: DueStep[];
  next: ReturnType<typeof nextCheck>;
  action: ReturnType<typeof mainAction>;
  stepLabel: (id: string) => string;
  send: (d: DueStep, s: "used" | typeof UNDO_STATUS) => void;
}) {
  const { done, total } = ringValues(steps);
  const streak = routine.data ? routineStreak(routine.data.events, routine.data.today) : 0;
  const nextLine = next.kind === "first" ? H.today.nextFirst : next.kind === "today" ? H.today.nextToday : next.kind === "overdue" ? H.today.nextOverdue(next.days) : H.today.nextIn(next.days);
  const [ios, setIos] = useState(false);
  useEffect(() => setIos(needsHomeScreen(navigator.userAgent, window.matchMedia("(display-mode: standalone)").matches)), []);
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <section aria-labelledby="today-title" className={`${row} flex flex-col gap-3`}>
      <h2 id="today-title" className="sr-only">
        {H.today.title}
      </h2>
      <div className="flex items-center gap-4">
        <Ring done={done} total={total} />
        <ul className="flex min-w-0 flex-col gap-0.5 text-sm">
          <li>{H.today.streak(streak)}</li>
          <li data-testid="next-check" className="font-semibold">
            {nextLine}
          </li>
          {/* Third line: UV when weather is on and a city is set; else the starting checks. */}
          <li>{weatherOn() && settings?.city ? <UvLine user={user} settings={settings} open={() => dialog.current?.showModal()} /> : H.today.starting(dashboard.trend.count, dashboard.trend.needed)}</li>
        </ul>
      </div>
      {weatherOn() && !settings?.city && (
        <button type="button" onClick={() => dialog.current?.showModal()} className="-my-2 inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-brand-forest underline-offset-4 hover:underline">
          <CloudSun aria-hidden size={16} />
          {H.today.addCity}
        </button>
      )}
      {action.kind === "check" ? (
        <Link href="/skin-check" className={btnPrimary}>
          {H.today.takeCheck}
        </Link>
      ) : action.kind === "step" ? (
        <button type="button" className={btnPrimary} aria-disabled={routine.busy} onClick={() => !routine.busy && send(action.step, "used")}>
          {H.today.markStep(stepLabel(action.step.productId))}
        </button>
      ) : action.kind === "allDone" || action.kind === "slotDone" ? (
        <p role="status" className="flex min-h-11 items-center justify-center gap-2 rounded-full bg-brand-linen text-sm font-semibold text-brand-forest">
          <Check aria-hidden size={16} />
          {action.kind === "allDone" ? H.today.allDone : H.today.slotDone[steps.find((s) => s.status === "used")?.slot ?? "AM"]}
        </p>
      ) : null}
      {pushOn() && ios && <p className="text-xs text-brand-muted">{H.today.iosHint}</p>}
      {weatherOn() && (
        <dialog ref={dialog} aria-label={H.today.weatherSheet} className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-transparent p-0 backdrop:bg-black/30 sm:m-auto sm:max-w-md sm:rounded-2xl" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
          <div className="relative">
            <button type="button" aria-label={H.today.close} onClick={() => dialog.current?.close()} className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full text-brand-muted hover:bg-brand-linen">
              <X aria-hidden size={20} />
            </button>
            <WeatherCard user={user} settings={settings} onSettings={onSettings} />
          </div>
        </dialog>
      )}
    </section>
  );
}

/** The UV line (opens the weather sheet); compact for no city or no reading. */
function UvLine({ user, settings, open }: { user: User; settings: HomeSettings | null; open: () => void }) {
  const city = settings?.city ?? null;
  const [w, setW] = useState<WeatherReading | null | "down">(null);
  useEffect(() => {
    if (!city) return;
    let active = true;
    weatherAt(user, city).then(
      (r) => active && setW(r),
      () => active && setW(lastWeather(city) ?? "down")
    );
    return () => {
      active = false;
    };
  }, [user, city?.latE1, city?.lonE1]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = !city ? "" : w === "down" ? H.today.uvDown : w ? H.today.uv(Math.round(w.uv), uvCategory(w.uv)) : "…";
  return (
    <button type="button" onClick={open} className="inline-flex min-h-11 items-center gap-1.5 text-left font-medium text-brand-forest underline-offset-4 hover:underline">
      <CloudSun aria-hidden size={16} />
      {text}
    </button>
  );
}

// ─── Routine row ────────────────────────────────────────────────────────────

function RoutineRow({ routine, steps, slot, stepLabel, nameOf, send }: { routine: Routine; steps: DueStep[]; slot: "AM" | "PM"; stepLabel: (id: string) => string; nameOf: (id: string) => string; send: (d: DueStep, s: "used" | typeof UNDO_STATUS) => void }) {
  const slotName = ROUTINE_COPY.slot[slot];
  if (routine.failed) return <p role="alert" className="text-sm">{ROUTINE_COPY.error}</p>;
  if (!routine.data) return <div aria-hidden className={`${row} h-[104px] motion-safe:animate-pulse`} />;
  if (routine.data.routine.length === 0)
    return (
      <section aria-label={ROUTINE_COPY.todayTitle} className={`${row} flex min-h-14 items-center justify-between gap-3 !py-2`}>
        <p className="text-sm text-brand-muted">{H.routineRow.empty}</p>
        <Link href="/routine" className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-forest underline-offset-4 hover:underline">
          {H.routineRow.setUp}
        </Link>
      </section>
    );
  return (
    <section aria-labelledby="routine-row-title" className={`${row} flex flex-col gap-2`}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 id="routine-row-title" className="font-display text-base font-semibold text-brand-title">
          {slotName}
        </h2>
        <p className="text-xs text-brand-muted">{slot === "AM" ? H.routineRow.eveningFrom : H.routineRow.morningTomorrow}</p>
      </div>
      {steps.length === 0 ? (
        <p className="text-sm text-brand-muted">{ROUTINE_COPY.nothingToday}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {steps.slice(0, 4).map((d) => {
            const isDone = d.status === "used";
            const name = nameOf(d.productId);
            return (
              <li key={d.productId} className="w-[84px]">
                <button
                  type="button"
                  aria-pressed={isDone}
                  aria-disabled={routine.busy}
                  aria-label={isDone ? H.routineRow.undo(name, slotName.toLowerCase()) : H.routine.markDoneLabel(name, slotName.toLowerCase())}
                  onClick={() => !routine.busy && send(d, isDone ? UNDO_STATUS : "used")}
                  className="flex min-h-[56px] w-full flex-col items-center justify-center gap-1 rounded-xl border border-brand-line px-1 text-xs font-semibold text-brand-ink aria-pressed:border-brand-forest aria-pressed:bg-brand-forest aria-pressed:text-white"
                >
                  {isDone ? <Check aria-hidden size={16} /> : <span aria-hidden className="size-4 rounded-full border-2 border-brand-line" />}
                  <span className="w-full truncate text-center">{stepLabel(d.productId)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Latest check row ───────────────────────────────────────────────────────

function LatestRow({ dashboard }: { dashboard: Dashboard }) {
  const view = dashboard.current.kind === "reading" ? dashboard.current.view : null;
  const newest = dashboard.history[0];
  if (!view && !newest)
    return (
      <Link href="/skin-check" className={`${row} flex min-h-14 items-center justify-between gap-3 font-semibold text-brand-forest`}>
        {H.latestRow.first}
        <ChevronRight aria-hidden size={20} />
      </Link>
    );
  const analysing = !!newest && newest.kind === "questions" && newest.date !== null && Date.now() - newest.date.getTime() < 10 * 60_000;
  const shown = view ? dashboard.history.find((h) => h.scanId === view.scanId) : newest;
  const date = formatDate(shown?.date ?? view?.date ?? null);
  const href = view ? `/checks/${encodeURIComponent(view.scanId)}` : "/checks";
  const { top, more } = view?.bands ? topReadings(view.bands) : { top: [], more: 0 };
  const picture =
    view && view.areas.length > 0 ? (
      <span className="block size-12">
        <FaceDrawing labels={ECHO_REGION_LABELS} available={view.areas.map((a) => a.region)} />
      </span>
    ) : null;
  return (
    <Link href={href} aria-label={H.latestRow.open(date)} className={`${row} flex items-center gap-3`}>
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-linen [&_svg]:max-w-[48px]">
        {shown?.photoClaimed && view ? <Thumb scanId={view.scanId} date={date} fallback={picture} /> : picture}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-xs font-semibold text-brand-muted">
          {H.latest.eyebrow} · {date}
        </span>
        <span className="truncate text-sm text-brand-ink">
          {analysing ? H.latestRow.analysing : top.length ? top.map((b) => `${b.label} ${b.band}`).join(", ") : H.latestRow.noReading}
          {!analysing && more > 0 && <span className="text-brand-muted"> {H.latestRow.more(more)}</span>}
        </span>
      </span>
      <ChevronRight aria-hidden size={20} className="shrink-0 text-brand-muted" />
    </Link>
  );
}

// ─── Echo chips ─────────────────────────────────────────────────────────────

function EchoChips({ uid, dashboard, data, productsOn }: { uid: string; dashboard: Dashboard; data: DashboardData; productsOn: boolean }) {
  const openEcho = useOpenEcho(uid, data);
  const { threads } = useSkinCheckSession();
  const scanId = dashboard.echoScanId;
  const answered = scanId ? safetyQuestionsAnswered(checkAnswers(scanId, data.checks, data.laterAnswers)) : false;
  const asked = Object.values(threads).flatMap((t) => t.messages.filter((m) => m.role === "user").map((m) => m.text));
  const [starters] = useState(() => pickStarters({ productsOn, asked }).slice(0, 2));
  if (!scanId) return null;
  if (!answered)
    return (
      <button type="button" onClick={() => openEcho()} className="flex min-h-11 w-full items-center justify-between rounded-2xl border border-brand-line bg-brand-paper px-3 text-sm font-semibold text-brand-forest hover:border-brand-action">
        {H.echo.open}
        <ChevronRight aria-hidden size={16} />
      </button>
    );
  return (
    <section aria-label={H.echo.title} className="flex flex-col gap-2">
      <ul className="grid grid-cols-2 gap-2">
        {starters.map((q) => (
          <li key={q} className="min-w-0">
            <button type="button" onClick={() => openEcho({ ask: q })} className="flex h-full min-h-11 w-full items-center rounded-2xl border border-brand-line bg-brand-paper px-3 py-2 text-left text-sm font-medium leading-snug text-brand-forest hover:border-brand-action">
              <span className="line-clamp-2">{q}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
