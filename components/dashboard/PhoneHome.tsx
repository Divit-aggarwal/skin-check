"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { User } from "firebase/auth";
import { CalendarCheck, Check, ChevronLeft, ChevronRight, ListChecks, MapPin, MessageCircle, Sparkles, Sun } from "lucide-react";
import { AccountButton, card, heroCard } from "@/components/ui/page";
import { btnOnDark, IconWell, READING_ICON, Wordmark, type Reading } from "@/components/ui/kit";
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
// weather to the skin. TD-50 (Phase 2): laid out as mockup 01 (wordmark,
// greeting, dark "next step" hero, conditions row, ring and next-check tiles);
// the mockup's insight card is left out (no such data; the latest check row
// is the real item there).

type Routine = ReturnType<typeof useRoutine>;
const tz = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";
const row = `${card} !p-4`;

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
  const date = now.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

  return (
    <main className="mx-auto flex w-full max-w-[600px] flex-col gap-2 px-4 pb-28 pt-1 sm:px-6 sm:pt-6">
      {/* 1. Wordmark and Account (mockup 01), the date, the greeting. The mockup's line about
          the skin today is left out: Home never says how the skin is doing. */}
      <header className="flex flex-col">
        <div className="flex min-h-11 items-center justify-between gap-3">
          <Wordmark />
          <AccountButton />
        </div>
        <p className="mt-1 truncate text-[15px] text-brand-text-muted">{date}</p>
        <h1 className="text-[28px] font-semibold leading-[1.15] tracking-[-0.02em] text-brand-text sm:text-[32px]">
          {/* One line (mockup 01 breaks after the comma): home-v3's fold needs the room. */}
          {hello}
        </h1>
      </header>

      {/* 2. Today: the next step, the conditions, today's ring and the next check. */}
      <TodayCard user={user} dashboard={dashboard} settings={settings} onSettings={onSettings} routine={routine} steps={steps} next={next} action={action} stepLabel={stepLabel} send={send} />

      {/* 3. Routine row: this time of day's steps, one tap each. */}
      <RoutineRow routine={routine} steps={steps.filter((s) => s.slot === slot)} slot={slot} stepLabel={stepLabel} nameOf={nameOf} send={send} />

      {/* 4. Skin Twin: the latest check's level words (mockup 01's insight card without its comparison). */}
      <SkinTwinCard dashboard={dashboard} />

      {/* TD-33 (1): while a check's questions wait. */}
      {waiting && <QuestionsCard isEcho={waiting.isEcho} date={waiting.date ? formatDate(waiting.date) : null} />}

      {/* 5. Ask Echo */}
      {echoOn() && <EchoChips uid={user.uid} dashboard={dashboard} data={data} productsOn={productsOn} />}

      {/* 6. Below the fold: the week's count and the one honest line. */}
      <section aria-label={H.tiles.progress} className="grid grid-cols-2 gap-2.5">
        <Tile title={H.tiles.progress} value={H.tiles.progressValue(routine.data ? daysLoggedLast7(routine.data.events, routine.data.today) : 0)} note={H.tiles.progressNote} />
        {/* The honest line sits in the tile, not loose on the page (design review). */}
        <Tile title={H.tiles.starting} value={H.tiles.startingValue(dashboard.trend.count, dashboard.trend.needed)} note={dashboard.trend.kind === "empty" ? C.trend.empty : C.trend.notEnough} />
      </section>
    </main>
  );
}

function Tile({ title, value, note }: { title: string; value: string; note?: string }) {
  return (
    <div className={`${card} flex flex-col gap-0.5 !p-4`}>
      <p className="text-xs font-semibold text-brand-muted">{title}</p>
      <p className="text-lg font-semibold text-brand-title">{value}</p>
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
    <div role="img" aria-label={H.today.ringLabel(done, total)} className="size-10 shrink-0">
      <svg viewBox="0 0 76 76" className="size-full -rotate-90" aria-hidden>
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="10" className="stroke-brand-100" />
        <circle cx="38" cy="38" r={r} fill="none" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - part)} className="stroke-brand-700 motion-safe:transition-[stroke-dashoffset] motion-safe:duration-base" />
      </svg>
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

  const slotName = ROUTINE_COPY.slot[action.kind === "step" ? action.step.slot : "AM"];
  const left = action.kind === "step" ? steps.filter((d) => d.slot === action.step.slot && d.status !== "used").length : 0;

  const tile = `${card} flex min-w-0 flex-col gap-1.5 !p-3`;
  return (
    <section aria-labelledby="today-title" className="flex flex-col gap-2">
      <h2 id="today-title" className="sr-only">
        {H.today.title}
      </h2>

      {/* Your next step: the one main action (lib/home/today.ts mainAction). No product picture (the brief keeps the kit hero). */}
      <div className={`${heroCard} flex flex-col !px-5 !py-3`}>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-white/80">{H.today.heroEyebrow}</p>
        {action.kind === "allDone" || action.kind === "slotDone" ? (
          <p role="status" className="mt-1 flex items-center gap-2 text-[24px] font-semibold leading-tight">
            <Check aria-hidden size={22} />
            {action.kind === "allDone" ? H.today.allDone : H.today.slotDone[steps.find((s) => s.status === "used")?.slot ?? "AM"]}
          </p>
        ) : (
          <p className="mt-1 text-[24px] font-semibold leading-tight">{action.kind === "check" ? H.today.heroCheck : action.kind === "step" ? H.today.heroStep(slotName) : H.today.heroNone}</p>
        )}
        {action.kind === "step" && <p className="mt-0.5 text-base text-white/85">{H.today.stepsLeft(left)}</p>}
        {action.kind === "check" ? (
          <Link href="/skin-check" className={`${btnOnDark} mt-2.5 !min-h-11 self-start !px-7`}>
            {H.today.takeCheck}
          </Link>
        ) : action.kind === "step" ? (
          <button type="button" className={`${btnOnDark} mt-2.5 !min-h-11 self-start !px-7`} aria-disabled={routine.busy} onClick={() => !routine.busy && send(action.step, "used")}>
            {H.today.markStep(stepLabel(action.step.productId))}
          </button>
        ) : null}
      </div>

      {/* Today's conditions: the city, then UV once a city is set, or the way to add one. Hidden while weather is off. */}
      {weatherOn() && (
        <div className={`${card} relative flex flex-col !px-3.5 !py-2.5`}>
          <div className="flex items-center gap-3">
            <IconWell icon={Sun} size={40} className="bg-amber-50 text-severity-moderate" />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1 text-sm text-brand-text">
                {H.weather.title}
                {/* The city on the same line (mockup 01 gives it a row; home-v3's fold has no room). */}
                {settings?.city && (
                  <span className="flex min-w-0 items-center gap-0.5 truncate text-brand-text-muted">
                    · <MapPin aria-hidden size={13} className="shrink-0" /> {settings.city.name}
                  </span>
                )}
              </p>
              {settings?.city ? (
                <UvLine user={user} settings={settings} open={() => dialog.current?.showModal()} />
              ) : (
                <button type="button" onClick={() => dialog.current?.showModal()} className="flex min-h-8 items-center text-left text-lg font-semibold text-brand-text after:absolute after:inset-0 after:rounded-card">
                  {H.today.addCity}
                </button>
              )}
            </div>
            <ChevronRight aria-hidden size={20} className="shrink-0 text-brand-text" />
          </div>
        </div>
      )}

      {/* Today's ring with the run of days, and the next check (mockup 01's two tiles). */}
      <div className="grid grid-cols-2 gap-2">
        <Link href="/routine" className={`${tile} transition-colors duration-fast hover:bg-brand-50`}>
          <span className="flex items-center gap-2">
            <IconWell icon={ListChecks} size={24} />
            <span className="flex-1 text-sm text-brand-text">{H.today.todayTile}</span>
            <ChevronRight aria-hidden size={18} className="shrink-0 text-brand-text" />
          </span>
          <span className="flex items-center gap-2.5">
            <Ring done={done} total={total} />
            <span className="min-w-0">
              <span className="block text-xl font-semibold leading-tight text-brand-text">{H.today.ringCount(done, total)}</span>
              <span className="block text-xs leading-snug text-brand-text-muted">{H.today.streak(streak)}</span>
            </span>
          </span>
        </Link>
        <div className={tile}>
          <span className="flex items-center gap-2">
            <IconWell icon={CalendarCheck} size={24} />
            <span className="flex-1 text-sm text-brand-text">{H.today.nextTile}</span>
          </span>
          <p data-testid="next-check" className="text-base font-semibold leading-tight text-brand-text">
            {nextLine}
          </p>
          <p className="text-xs leading-snug text-brand-text-muted">{H.today.starting(dashboard.trend.count, dashboard.trend.needed)}</p>
        </div>
      </div>

      {pushOn() && ios && <p className="text-xs text-brand-muted">{H.today.iosHint}</p>}
      {/* Screen 02: the conditions as their own screen on a phone (a full-height sheet), a centred sheet from 640px. */}
      {weatherOn() && (
        <dialog ref={dialog} aria-label={H.today.weatherSheet} className="m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto bg-brand-bg p-0 backdrop:bg-black/30 sm:m-auto sm:h-auto sm:max-h-[90dvh] sm:max-w-md sm:rounded-card" onClick={(e) => e.target === dialog.current && dialog.current?.close()}>
          <div className="px-4 pb-8">
            <div className="grid h-14 grid-cols-[44px_1fr_44px] items-center">
              <button type="button" aria-label={H.today.close} onClick={() => dialog.current?.close()} className="-ml-2 grid size-11 place-items-center rounded-full text-brand-text hover:bg-brand-50">
                <ChevronLeft aria-hidden size={22} />
              </button>
              <Wordmark className="justify-self-center pl-[0.35em]" />
            </div>
            <WeatherCard user={user} settings={settings} onSettings={onSettings} sheet />
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
    // The whole row opens the sheet (after: covers the card); the name stays the UV text.
    <button type="button" onClick={open} className="flex min-h-8 items-center text-left text-lg font-semibold text-brand-text after:absolute after:inset-0 after:rounded-card">
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
    // Not in mockup 01; kept for one-tap logging (TD-48). Named by the time of day, no visible heading (the fold).
    <section aria-label={slotName} className={`${row} flex flex-col gap-2 !py-2`}>
      {steps.length === 0 ? (
        <p className="text-sm text-brand-muted">{ROUTINE_COPY.nothingToday}</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {steps.slice(0, 4).map((d) => {
            const isDone = d.status === "used";
            const name = nameOf(d.productId);
            return (
              <li key={d.productId} className="max-w-full">
                <button
                  type="button"
                  aria-pressed={isDone}
                  aria-disabled={routine.busy}
                  aria-label={isDone ? H.routineRow.undo(name, slotName.toLowerCase()) : H.routine.markDoneLabel(name, slotName.toLowerCase())}
                  onClick={() => !routine.busy && send(d, isDone ? UNDO_STATUS : "used")}
                  className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full border border-brand-border px-3 text-sm font-semibold text-brand-text transition-colors duration-fast aria-pressed:border-brand-700 aria-pressed:bg-brand-700 aria-pressed:text-white"
                >
                  {isDone ? <Check aria-hidden size={16} /> : <span aria-hidden className="size-4 rounded-full border-2 border-dashed border-brand-text-subtle" />}
                  <span className="truncate">{stepLabel(d.productId)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ─── Skin Twin card ─────────────────────────────────────────────────────────

/** Mockup 01's "Skin Twin insight" without its before/after and change line: the latest check's level words only. */
function SkinTwinCard({ dashboard }: { dashboard: Dashboard }) {
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
    <Link href={href} aria-label={H.latestRow.open(date)} className={`${row} flex items-center gap-3 !py-2.5 transition-colors duration-fast hover:bg-brand-50`}>
      {/* The user's own kept photo only (data rule 1), else the face drawing. */}
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-tile bg-brand-50 [&_svg]:max-w-[48px]">
        {shown?.photoClaimed && view ? <Thumb scanId={view.scanId} date={date} fallback={picture} /> : picture}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-1.5 text-sm text-brand-text">
          <Sparkles aria-hidden size={16} className="shrink-0 text-brand-700" />
          {H.today.skinTwin} <span className="truncate text-brand-text-muted">· {date}</span>
        </span>
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 text-sm text-brand-text">
          {analysing ? (
            H.latestRow.analysing
          ) : top.length ? (
            top.map((b) => {
              const icon = READING_ICON[b.metric as Reading];
              return (
                <span key={b.metric} className="inline-flex items-center gap-1">
                  {icon && <IconWell icon={icon.icon} size={20} className={icon.well} />}
                  {b.label} <span className="font-semibold">{b.band}</span>
                </span>
              );
            })
          ) : (
            H.latestRow.noReading
          )}
          {!analysing && more > 0 && <span className="text-brand-muted">{H.latestRow.more(more)}</span>}
        </span>
      </span>
      <ChevronRight aria-hidden size={20} className="shrink-0 text-brand-text" />
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
      <button type="button" onClick={() => openEcho()} className="flex min-h-11 w-full items-center justify-between rounded-card border border-brand-border bg-brand-surface px-3 text-sm font-semibold text-brand-700 hover:bg-brand-50">
        {H.echo.open}
        <ChevronRight aria-hidden size={16} />
      </button>
    );
  return (
    // Mockup 01's Ask Echo card: the header opens Echo; the two starters are the region (home-v3 counts its buttons).
    <div className={`${card} flex flex-col gap-1 !p-2.5`}>
      <button type="button" onClick={() => openEcho()} className="flex min-h-11 items-center gap-2.5 rounded-tile p-1 text-left text-sm text-brand-text hover:bg-brand-50">
        <IconWell icon={MessageCircle} size={28} />
        <span className="flex-1">{H.echo.title}</span>
        <ChevronRight aria-hidden size={20} className="shrink-0" />
      </button>
      <section aria-label={H.echo.title}>
        <ul className="grid grid-cols-2 gap-2">
          {starters.map((q) => (
            <li key={q} className="min-w-0">
              <button type="button" onClick={() => openEcho({ ask: q })} className="flex h-full min-h-11 w-full items-center gap-2 rounded-tile border border-brand-border bg-brand-surface px-2.5 py-2 text-left text-[13px] font-medium leading-snug text-brand-text transition-colors duration-fast hover:bg-brand-50">
                <IconWell icon={MessageCircle} size={28} className="bg-brand-50" />
                <span className="line-clamp-2">{q}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
