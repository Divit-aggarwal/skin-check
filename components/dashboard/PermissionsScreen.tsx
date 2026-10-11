"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "firebase/auth";
import { BellRing, MapPin } from "lucide-react";
import { btnPrimary, btnSecondary, card } from "@/components/ui/page";
import { needsHomeScreen, type HomeSettings, type PermissionOutcome } from "@/lib/home/permissions";
import { weatherOn, pushOn } from "@/lib/home/switches";
import { HOME_COPY } from "./homeCopy";
import { enableReminders, locateCity, saveHomeSettings } from "./homeSettings";

const P = HOME_COPY.permissions;

// TD-47 (3): one screen, right after a check's results and before Home, the
// first time only (DashboardPage decides when). A browser prompt runs only
// from "Allow" here or a button on Home, never on its own. "Not now" or a
// refusal never blocks: "Continue to Home" is always there.

type Choice = PermissionOutcome | null;

export function PermissionsScreen({ user, settings, onDone }: { user: User; settings: HomeSettings | null; onDone: (s: HomeSettings) => void }) {
  const [location, setLocation] = useState<Choice>(null);
  const [reminders, setReminders] = useState<Choice>(null);
  const [city, setCity] = useState<HomeSettings["city"]>(settings?.city ?? null);
  const [busy, setBusy] = useState<"location" | "reminders" | "done" | null>(null);
  const [failed, setFailed] = useState(false);
  const [ios, setIos] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus();
    setIos(needsHomeScreen(navigator.userAgent, window.matchMedia("(display-mode: standalone)").matches));
  }, []);

  const finish = async () => {
    setBusy("done");
    // Anything not chosen counts as "not now"; the screen never shows again.
    const result: HomeSettings = {
      ...(weatherOn() ? { location: location ?? "not_now", city: city ?? null } : {}),
      ...(pushOn() ? { reminders: reminders ?? "not_now" } : {}),
    };
    try {
      await saveHomeSettings(user.uid, result, true);
    } catch (e) {
      console.error("[home] permissions not saved", e instanceof Error ? e.name : e);
      setFailed(true);
    }
    onDone({ ...settings, ...result, askedAt: new Date() });
  };

  const status = (c: Choice) =>
    c === "allowed" ? P.allowed : c === "refused" ? P.refused : c === "unsupported" ? P.unsupported : c === "not_now" ? P.notNowDone : null;

  const item = (kind: "location" | "reminders", icon: React.ReactNode, title: string, why: string, choice: Choice, allow: () => Promise<void>, notNow: () => void, extra?: React.ReactNode) => (
    <li className="flex flex-col gap-3 rounded-2xl border border-brand-card-line p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span aria-hidden className="mt-0.5 text-brand-forest">
          {icon}
        </span>
        <div className="flex flex-col gap-1">
          <h2 id={`perm-${kind}`} className="font-display text-lg font-semibold text-brand-title">
            {title}
          </h2>
          <p>{why}</p>
          {extra}
        </div>
      </div>
      {choice ? (
        <p role="status" className="font-semibold">
          {status(choice)}
        </p>
      ) : (
        <div className="flex flex-wrap gap-3" role="group" aria-labelledby={`perm-${kind}`}>
          <button type="button" className={btnSecondary} aria-disabled={busy !== null} onClick={() => !busy && void allow()}>
            {P.allow}
          </button>
          <button type="button" className={btnSecondary} aria-disabled={busy !== null} onClick={() => !busy && notNow()}>
            {P.notNow}
          </button>
        </div>
      )}
    </li>
  );

  return (
    <section aria-labelledby="perm-title" className={`${card} mx-auto flex max-w-2xl flex-col gap-5`}>
      <div>
        <h1 ref={heading} tabIndex={-1} id="perm-title" className="font-display text-[30px] font-semibold leading-[1.15] tracking-[-0.025em] text-brand-title outline-none sm:text-[40px]">
          {P.title}
        </h1>
        <p className="mt-2 text-brand-muted">{P.intro}</p>
      </div>
      <ul className="flex flex-col gap-4">
        {weatherOn() &&
          item(
            "location",
            <MapPin size={22} />,
            P.locationTitle,
            P.locationWhy,
            location,
            async () => {
              setBusy("location");
              try {
                const r = await locateCity(user);
                setLocation(r.outcome);
                if (r.city) setCity(r.city);
              } catch {
                setLocation("not_now");
              } finally {
                setBusy(null);
              }
            },
            () => setLocation("not_now"),
            <p className="text-sm text-brand-muted" data-legal-review="TD-47 location consent">
              {P.locationConsent}
            </p>
          )}
        {pushOn() &&
          item(
            "reminders",
            <BellRing size={22} />,
            P.remindersTitle,
            P.remindersWhy,
            reminders,
            async () => {
              setBusy("reminders");
              try {
                setReminders(await enableReminders(user));
              } finally {
                setBusy(null);
              }
            },
            () => setReminders("not_now"),
            ios ? <p className="text-sm text-brand-muted">{P.iosHint}</p> : undefined
          )}
      </ul>
      {failed && <p role="alert">{P.saveFailed}</p>}
      <button type="button" className={`${btnPrimary} self-start`} aria-disabled={busy !== null} onClick={() => !busy && void finish()}>
        {P.continue}
      </button>
    </section>
  );
}
