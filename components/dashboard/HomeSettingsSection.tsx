"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { btnSecondary, card, h2 } from "@/components/ui/page";
import type { HomeSettings } from "@/lib/home/permissions";
import { weatherOn, pushOn } from "@/lib/home/switches";
import { HOME_COPY } from "./homeCopy";
import { ChooseCity } from "./HomeCards";
import { disableReminders, enableReminders, loadHomeSettings, saveHomeSettings } from "./homeSettings";

const A = HOME_COPY.account;

// TD-47: Account's place to change the location and reminder choices and the
// city. Only the parts whose switch is on are shown.
export function HomeSettingsSection() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<HomeSettings | null | undefined>(undefined);
  const [message, setMessage] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    loadHomeSettings(user.uid).then(setSettings, () => setSettings(null));
  }, [user]);

  if (!user || settings === undefined || (!weatherOn() && !pushOn())) return null;

  const save = async (patch: HomeSettings) => {
    setBusy(true);
    setMessage(null);
    try {
      await saveHomeSettings(user.uid, patch);
      setSettings({ ...settings, ...patch });
      setMessage(A.saved);
      setChanging(false);
    } catch {
      setMessage(A.failed);
    } finally {
      setBusy(false);
    }
  };
  const state = (v: HomeSettings["location"]) => A.states[v ?? "unset"];

  return (
    <section aria-labelledby="home-settings-title" className={`${card} flex flex-col items-start gap-3`}>
      <h2 id="home-settings-title" className={h2}>
        {A.title}
      </h2>
      {weatherOn() && (
        <div className="flex w-full flex-col items-start gap-2">
          <p>{A.location(state(settings?.location))}</p>
          <p>{settings?.city ? A.city(settings.city.name) : A.noCity}</p>
          {changing ? (
            <ChooseCity user={user} onCity={(city, location) => void save({ city, ...(location ? { location } : {}) })} />
          ) : (
            <div className="flex flex-wrap gap-3">
              <button type="button" className={btnSecondary} onClick={() => setChanging(true)}>
                {HOME_COPY.weather.change}
              </button>
              {settings?.city && (
                <button type="button" className={btnSecondary} aria-disabled={busy} onClick={() => !busy && void save({ city: null })}>
                  {A.removeCity}
                </button>
              )}
            </div>
          )}
        </div>
      )}
      {pushOn() ? (
        <div className="flex w-full flex-col items-start gap-2 border-t border-brand-line pt-3">
          <p>{A.reminders(state(settings?.reminders))}</p>
          {settings?.reminders === "allowed" ? (
            <button
              type="button"
              className={btnSecondary}
              aria-disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await disableReminders(user);
                } catch {
                  // Not confirmed by the server: say so, and keep showing "allowed".
                  setBusy(false);
                  return setMessage(A.failed);
                }
                setBusy(false);
                await save({ reminders: "not_now" });
              }}
            >
              {A.remindersOff}
            </button>
          ) : (
            <button
              type="button"
              className={btnSecondary}
              aria-disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                const reminders = await enableReminders(user).catch(() => "unsupported" as const);
                setBusy(false);
                await save({ reminders });
              }}
            >
              {A.remindersOn}
            </button>
          )}
        </div>
      ) : (
        <p className="text-sm text-brand-muted">{A.off}</p>
      )}
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
