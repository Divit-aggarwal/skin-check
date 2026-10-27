"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { User } from "firebase/auth";
import { CalendarClock, ChevronRight, Droplet, MapPin, Sun, Thermometer, Wind } from "lucide-react";
import { btnSecondary, card, h2, LoadingState, lead, textLink, titleDisplay } from "@/components/ui/page";
import { IconWell } from "@/components/ui/kit";
import { useSkinCheckSession } from "@/lib/skin-check-session-context";
import { type EchoRegion } from "@/lib/echo-regions";
import { aqiCategory, uvCategory, UV_ADVICE, type UvHour, type WeatherReading } from "@/lib/home/weather";
import { needsHomeScreen, promptFor, type BrowserState, type HomeSettings, type SavedCity } from "@/lib/home/permissions";
import type { Place } from "@/lib/home/places";
import { HOME_COPY as H } from "./homeCopy";
import type { DashboardData } from "./data";
import { type Dashboard } from "./state";
import { newestEchoSession } from "./echo-session";
import { ASK_KEY, browserState, hasSubscription, weatherAt, enableReminders, lastWeather, locateCity, placesNamed, rememberWeather, saveHomeSettings } from "./homeSettings";

// Pieces of the TD-47 Home v2 that the phone Home (PhoneHome, every width since
// 2026-10-25) still uses: the weather card (its sheet), the city chooser, the
// reminders prompt and opening Echo. The weather card never names the skin.

/** After a choice removes the focused button, focus goes to the card's heading (design review). */
const focusCard = (id: string) => requestAnimationFrame(() => document.getElementById(`${id}-title`)?.focus());

/** The newest check that has a reading (measured, or saved by the app): the countdown counts from it. */
export const lastReadingDate = (d: Dashboard) =>
  // A reading can land before its check record is saved (design §3, orphan record): its own date counts then.
  d.history.find((h) => h.kind === "reading" || h.kind === "legacy")?.date ?? (d.current.kind === "reading" ? d.current.view.date : null);

function Card({ id, title, children, className = "" }: { id: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-labelledby={`${id}-title`} className={`${card} flex min-w-0 flex-col gap-4 ${className}`}>
      {/* tabIndex -1: focus lands here when a choice inside the card replaces the button that had it. */}
      <h2 id={`${id}-title`} tabIndex={-1} className={`${h2} outline-none`}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Reminders missing: ask again where the browser can, else say how; the iPhone home-screen hint. */
export function RemindersPrompt({ user, settings, onSettings, inline = false }: { user: User; settings: HomeSettings | null; onSettings: (s: HomeSettings) => void; inline?: boolean }) {
  // inline: the phone Home, which shows its own iPhone hint and has no card around this.
  const edge = inline ? "" : "border-t border-brand-line pt-3";
  const [state, setState] = useState<BrowserState | null>(null);
  const [subscribed, setSubscribed] = useState(false);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    void browserState("notifications").then(setState);
    void hasSubscription().then(setSubscribed);
    setIos(needsHomeScreen(navigator.userAgent, window.matchMedia("(display-mode: standalone)").matches));
  }, []);
  if (ios) return inline ? null : <p className={`${edge} text-sm text-brand-muted`}>{H.next.iosHint}</p>;
  if (!state) return null;
  // "Allowed" counts only while this browser really holds a subscription (a sign-out removes it).
  const prompt = promptFor(state, settings?.reminders === "allowed" && state === "granted" && subscribed);
  if (prompt === "none" || prompt === "unsupported") return null;
  // TD-47 (3): no browser prompt before the permissions screen; with permission already granted, no prompt shows.
  if (prompt === "ask" && !settings?.askedAt && state !== "granted") return null;
  if (prompt === "blocked") return <p className={`${edge} text-sm text-brand-muted`}>{H.next.remindersBlocked}</p>;
  return (
    <div className={`flex flex-col items-start gap-2 ${edge}`}>
      <p className="text-sm text-brand-muted">{H.next.remindersAsk}</p>
      <button
        type="button"
        className={textLink}
        onClick={async () => {
          const reminders = await enableReminders(user);
          await saveHomeSettings(user.uid, { reminders }).catch(() => undefined);
          onSettings({ ...settings, reminders });
          setState(await browserState("notifications"));
          setSubscribed(await hasSubscription());
          focusCard("next");
        }}
      >
        {H.next.remindersOn}
      </button>
    </div>
  );
}

// ─── Weather and air today ──────────────────────────────────────────────────

type Weather = { kind: "loading" } | { kind: "ready"; c: WeatherReading } | { kind: "stale"; c: WeatherReading } | { kind: "unavailable" };

export function WeatherCard({ user, settings, onSettings, sheet = false }: { user: User; settings: HomeSettings | null; onSettings: (s: HomeSettings) => void; sheet?: boolean }) {
  const city = settings?.city ?? null;
  const [weather, setWeather] = useState<Weather>({ kind: "loading" });
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    if (!city) return;
    let active = true;
    setWeather({ kind: "loading" });
    weatherAt(user, city).then(
      (c) => {
        rememberWeather(city, c);
        if (active) setWeather({ kind: "ready", c });
      },
      () => {
        const last = lastWeather(city);
        if (active) setWeather(last ? { kind: "stale", c: last } : { kind: "unavailable" });
      }
    );
    return () => {
      active = false;
    };
    // The place, not the object: a new object for the same place does not refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, city?.latE1, city?.lonE1]);

  const save = async (patch: HomeSettings) => {
    await saveHomeSettings(user.uid, patch).catch((e) => console.error("[home] settings not saved", e instanceof Error ? e.name : e));
    onSettings({ ...settings, ...patch });
    setChanging(false);
    focusCard("weather");
  };

  const title = sheet && (
    <h2 id="weather-title" tabIndex={-1} className={`${titleDisplay} outline-none`}>
      {H.weather.title}
    </h2>
  );

  if (!city || changing)
    return (
      <WeatherFrame sheet={sheet}>
        {title}
        <ChooseCity user={user} canAsk={!!settings?.askedAt} onCity={(c, location) => save({ city: c, ...(location ? { location } : {}) })} />
      </WeatherFrame>
    );

  const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
  const c = weather.kind === "ready" || weather.kind === "stale" ? weather.c : null;
  const category = c ? uvCategory(c.uv) : null;
  return (
    <WeatherFrame sheet={sheet}>
      {/* Mockup 02: title and intro, the place and "Change city" beside them. */}
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 basis-48">
          {title}
          <p className={sheet ? `mt-2 ${lead}` : "text-brand-text-muted"}>{H.weather.intro}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <p className="flex items-center gap-1.5 text-sm text-brand-text">
            <span className="grid size-8 place-items-center rounded-full bg-brand-50">
              <MapPin aria-hidden size={16} />
            </span>
            {[city.name, city.country].filter(Boolean).join(", ")}
          </p>
          <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-full bg-brand-100 px-4 text-sm font-medium text-brand-700 hover:bg-brand-50" onClick={() => setChanging(true)}>
            {H.weather.change}
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
      </div>
      {weather.kind === "loading" && <LoadingState label={H.weather.loading} blocks={["h-28", "h-24", "h-40"]} />}
      {weather.kind === "unavailable" && <p className="text-brand-muted">{H.weather.unavailable}</p>}
      {c && category && (
        <>
          {/* UV today (the day's peak), its category in words and colour, and the one advice line. */}
          <div className="flex items-center gap-4 rounded-card bg-sun-wash/70 p-4">
            <IconWell icon={Sun} size={72} className="bg-sun-soft/70 text-severity-moderate" />
            <dl className="min-w-0">
              <dt className="text-sm text-brand-text">{H.weather.uv}</dt>
              <dd className="flex flex-wrap items-baseline gap-x-3">
                <span className="text-[44px] font-semibold leading-none text-brand-text">{Math.round(c.uv)}</span>
                <span className={`text-lg font-semibold ${SEVERITY[uvLevel(category)]}`}>{H.weather.uvNote(category)}</span>
              </dd>
              <dd className="mt-1.5 text-sm text-brand-text-muted">{UV_ADVICE[category]}</dd>
            </dl>
          </div>
          <dl className="grid grid-cols-3 gap-2">
            <Tile icon={Droplet} label={H.weather.humidity} value={H.weather.humidityValue(c.humidity)} />
            {typeof c.temperature === "number" && <Tile icon={Thermometer} label={H.weather.temperature} value={H.weather.temperatureValue(c.temperature)} />}
            <Tile icon={Wind} label={H.weather.air} value={String(Math.round(c.usAqi))} note={H.weather.airNote(aqiCategory(c.usAqi))} noteClass={SEVERITY[aqiLevel(aqiCategory(c.usAqi))]} />
          </dl>
          {/* Today by the hour (real hourly values), when the source gave them. */}
          <div className="flex flex-col gap-3 rounded-card border border-brand-border bg-brand-surface p-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-brand-text">
                <MapPin aria-hidden size={18} />
                {H.weather.uvDay}
              </p>
              <p className="rounded-full bg-brand-50 px-3 py-1 text-xs text-brand-text-muted">{H.weather.updated(city.name, time(c.observedAt))}</p>
            </div>
            {c.hourly && <UvCurve hours={c.hourly} />}
            {typeof c.uvHighUntil === "number" && (
              <p className="flex items-center gap-3 rounded-tile bg-brand-50 p-3 text-sm text-brand-text">
                <IconWell icon={CalendarClock} size={40} />
                {H.weather.uvHighUntil(hourLabel(c.uvHighUntil))}
              </p>
            )}
          </div>
          {weather.kind === "stale" && <p className="text-sm text-brand-muted">{H.weather.lastKnown(time(c.observedAt))}</p>}
          <span className="-mt-2 flex flex-wrap gap-x-3">
            <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs text-brand-muted underline underline-offset-2">
              {H.weather.source}
            </a>
            {/* City names: GeoNames, CC BY 4.0 (lib/home/cities.json). */}
            <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center text-xs text-brand-muted underline underline-offset-2">
              {H.weather.places}
            </a>
          </span>
        </>
      )}
    </WeatherFrame>
  );
}

/** Screen 02 (G37): in the phone sheet the card is the page (large title, no frame); on the desktop Home a card. */
function WeatherFrame({ sheet, children }: { sheet: boolean; children: React.ReactNode }) {
  return sheet ? (
    <section aria-labelledby="weather-title" className="flex min-w-0 flex-col gap-4">
      {children}
    </section>
  ) : (
    <Card id="weather" title={H.weather.title}>
      {children}
    </Card>
  );
}

const hourLabel = (h: number) => new Date(2000, 0, 1, h).toLocaleTimeString("en-IN", { hour: "numeric" });

/** Screen 02's curve: today's hourly UV from the first to the last hour above 0, every second hour labelled. */
function UvCurve({ hours }: { hours: UvHour[] }) {
  const lit = hours.filter((h) => Math.round(h.uv) >= 1);
  const from = lit[0]?.hour;
  const to = lit[lit.length - 1]?.hour;
  if (from === undefined || to === undefined || to - from < 2) return null;
  const shown = hours.filter((h) => h.hour >= from && h.hour <= to);
  const labelled = shown.filter((h) => h.hour % 2 === 0);
  const peak = Math.max(...shown.map((h) => h.uv));
  const W = 320, H0 = 22, PH = 78, PAD = 22;
  const x = (h: number) => PAD + ((h - from) / (to - from)) * (W - 2 * PAD);
  const y = (uv: number) => H0 + (1 - uv / Math.max(peak, 1)) * PH;
  const line = shown.map((h, i) => `${i ? "L" : "M"}${x(h.hour).toFixed(1)} ${y(h.uv).toFixed(1)}`).join(" ");
  const base = H0 + PH;
  return (
    <svg role="img" aria-label={H.weather.uvDayLabel(labelled.map((h) => `${hourLabel(h.hour)} ${Math.round(h.uv)}`).join(", "))} viewBox={`0 0 ${W} ${base + 24}`} className="w-full">
      <path d={`${line} L${x(to).toFixed(1)} ${base} L${x(from).toFixed(1)} ${base} Z`} className="fill-sun-soft/60" />
      <path d={line} fill="none" strokeWidth="2" strokeLinejoin="round" className="stroke-sun-line" />
      {labelled.map((h) => {
        const top = h.uv === peak;
        return (
          <g key={h.hour}>
            <line x1={x(h.hour)} x2={x(h.hour)} y1={y(h.uv)} y2={base} className="stroke-brand-border" />
            <circle cx={x(h.hour)} cy={y(h.uv)} r="5.5" className={top ? "fill-severity-high" : "fill-sun"} stroke="white" strokeWidth="1.5" />
            <text x={x(h.hour)} y={y(h.uv) - 10} textAnchor="middle" className="fill-brand-text text-[13px] font-semibold">
              {Math.round(h.uv)}
            </text>
            <text x={x(h.hour)} y={base + 18} textAnchor="middle" className="fill-brand-text-muted text-[12px]">
              {hourLabel(h.hour)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function Tile({ icon, label, value, note, noteClass = "text-brand-ink" }: { icon: typeof Sun; label: string; value: string; note?: string; noteClass?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-card border border-brand-border bg-brand-surface p-3">
      <IconWell icon={icon} size={36} />
      <div className="min-w-0">
        <dt className="text-xs text-brand-text">{label}</dt>
        <dd className="text-xl font-semibold text-brand-title">{value}</dd>
        {note && <dd className={`text-xs font-semibold ${noteClass}`}>{note}</dd>}
      </div>
    </div>
  );
}

// Brief §1: weather severity in words and a text colour (the words carry it; every colour is AA on white).
// Weather only: never on a reading.
type Level = "none" | "moderate" | "warm" | "high";
const SEVERITY: Record<Level, string> = { none: "text-brand-ink", moderate: "text-severity-moderate", warm: "text-severity-warm", high: "text-severity-high" };
const uvLevel = (c: string): Level => (c === "Low" ? "none" : c === "Moderate" ? "moderate" : c === "High" ? "warm" : "high");
const aqiLevel = (c: string): Level => (c === "Good" ? "none" : c === "Moderate" ? "moderate" : c === "Unhealthy for sensitive groups" ? "warm" : "high");

/** No city yet (or changing it): why it helps, "Use my location" while the browser can ask, and always "Type my city". */
/**
 * `canAsk`: the permissions screen has been shown (TD-47 (3): the app never
 * triggers a browser prompt before it). Without it, "Use my location" shows
 * only when the browser already allows it, which needs no prompt.
 */
export function ChooseCity({ user, canAsk, onCity }: { user: User; canAsk: boolean; onCity: (c: SavedCity, location?: HomeSettings["location"]) => void }) {
  const [state, setState] = useState<BrowserState | null>(null);
  const [busy, setBusy] = useState<false | "locating">(false);
  const [message, setMessage] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    void browserState("geolocation").then(setState);
  }, []);
  // No city yet: offer the location while the browser can ask, or has already allowed it.
  const prompt = state === "granted" ? "ask" : state ? promptFor(state, false) : null;
  const offerLocation = prompt === "ask" && (canAsk || state === "granted");

  return (
    <div className="flex flex-col gap-3">
      <p>{H.weather.why}</p>
      {prompt === "blocked" && <p className="text-sm text-brand-muted">{H.weather.blocked}</p>}
      {prompt === "unsupported" && <p className="text-sm text-brand-muted">{H.weather.unsupported}</p>}
      {message && (
        <p role="status" className="text-sm text-brand-muted">
          {message}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        {offerLocation && (
          <button
            type="button"
            className={btnSecondary}
            aria-disabled={busy !== false}
            onClick={async () => {
              if (busy) return;
              setBusy("locating");
              setMessage(H.weather.locating);
              try {
                const { outcome, city } = await locateCity(user);
                if (city) return onCity(city, outcome);
                setState(await browserState("geolocation"));
                setMessage(outcome === "refused" ? null : H.weather.locateFailed);
              } catch {
                setMessage(H.weather.locateFailed);
              } finally {
                setBusy(false);
              }
            }}
          >
            <MapPin aria-hidden size={16} />
            {H.weather.useLocation}
          </button>
        )}
        {!typing && (
          <button type="button" className={btnSecondary} onClick={() => setTyping(true)}>
            {H.weather.typeCity}
          </button>
        )}
      </div>
      {typing && <CitySearch user={user} onPick={(p) => onCity({ ...p, source: "typed" })} />}
    </div>
  );
}

function CitySearch({ user, onPick }: { user: User; onPick: (p: Place) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Place[] | null>(null);
  const [failed, setFailed] = useState(false);
  const search = async (e: FormEvent) => {
    e.preventDefault();
    setFailed(false);
    try {
      setFound(await placesNamed(user, q));
    } catch {
      setFailed(true);
    }
  };
  return (
    <form onSubmit={search} className="flex flex-col gap-3">
      <label htmlFor="city-q" className="text-sm font-semibold">
        {H.weather.cityLabel}
      </label>
      <div className="flex gap-2">
        <input
          id="city-q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoComplete="address-level2"
          maxLength={100}
          className="h-12 min-w-0 flex-1 rounded-lg border border-brand-line bg-brand-paper px-3 text-base"
        />
        <button type="submit" className={btnSecondary}>
          {H.weather.search}
        </button>
      </div>
      {failed && <p role="alert">{H.weather.unavailable}</p>}
      <a href="https://www.geonames.org/" target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center self-start text-xs text-brand-muted underline underline-offset-2">
        {H.weather.places}
      </a>
      {found && found.length === 0 && <p role="status">{H.weather.noMatch}</p>}
      {found && found.length > 0 && (
        <ul className="flex flex-col gap-2">
          {found.map((p) => (
            <li key={`${p.name}-${p.latE1}-${p.lonE1}`}>
              <button type="button" className="min-h-11 w-full rounded-lg border border-brand-line px-3 py-2 text-left text-sm font-semibold hover:border-brand-ink" onClick={() => onPick(p)}>
                {H.weather.choose(p.name, p.region || p.country)}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}

// ─── Ask Echo ───────────────────────────────────────────────────────────────

/** Echo on the newest reading, optionally on one face area (TD-46) or with a starter question to send. */
export function useOpenEcho(uid: string, data: DashboardData) {
  const { setSession } = useSkinCheckSession();
  const router = useRouter();
  return (opts: { region?: EchoRegion; ask?: string } = {}) => {
    const session = newestEchoSession(uid, data);
    if (!session) return;
    setSession(session);
    if (opts.ask) {
      try {
        sessionStorage.setItem(ASK_KEY, opts.ask);
      } catch {
        /* storage blocked: Echo opens without sending */
      }
    }
    const q = new URLSearchParams({ ...(opts.region ? { region: opts.region } : {}), ...(opts.ask ? { ask: opts.ask } : {}) }).toString();
    router.push(q ? `/echo?${q}` : "/echo");
  };
}
