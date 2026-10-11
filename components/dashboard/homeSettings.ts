"use client";

import { doc, getDocFromServer, serverTimestamp, setDoc } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase/client";
import { toTenths, type WeatherReading } from "@/lib/home/weather";
import type { BrowserState, HomeSettings, PermissionOutcome, SavedCity } from "@/lib/home/permissions";
import type { Place } from "@/lib/home/places";
import { timeZone } from "@/components/routine/useRoutine";

// TD-47, browser side: users/{uid}/settings/home (owner only, firestore.rules),
// the two browser prompts, and the calls to our own Home routes. Nothing here
// talks to an outside service.

const ref = (uid: string) => doc(db(), "users", uid, "settings", "home");

export async function loadHomeSettings(uid: string): Promise<HomeSettings | null> {
  const snap = await getDocFromServer(ref(uid));
  return snap.exists() ? (snap.data() as HomeSettings) : null;
}

export function saveHomeSettings(uid: string, patch: Omit<HomeSettings, "askedAt">, answered = false) {
  return setDoc(ref(uid), { ...patch, ...(answered ? { askedAt: serverTimestamp() } : {}) }, { merge: true });
}

/** The browser's current answer for one permission, without prompting. */
export async function browserState(kind: "geolocation" | "notifications"): Promise<BrowserState> {
  if (kind === "geolocation" && !("geolocation" in navigator)) return "unsupported";
  if (kind === "notifications" && !("Notification" in window && "serviceWorker" in navigator && "PushManager" in window)) return "unsupported";
  if (kind === "notifications") return Notification.permission === "default" ? "prompt" : Notification.permission;
  try {
    return (await navigator.permissions.query({ name: "geolocation" })).state;
  } catch {
    return "prompt";
  }
}

/**
 * The browser's location prompt. The position is rounded to tenths of a
 * degree inside the callback and the rest of it is dropped there: the precise
 * position never leaves this function.
 */
export function roundedPosition(): Promise<{ state: BrowserState; latE1?: number; lonE1?: number }> {
  if (!("geolocation" in navigator)) return Promise.resolve({ state: "unsupported" });
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => resolve({ state: "granted", latE1: toTenths(coords.latitude), lonE1: toTenths(coords.longitude) }),
      (err) => resolve({ state: err.code === err.PERMISSION_DENIED ? "denied" : "prompt" }),
      { enableHighAccuracy: false, maximumAge: 3_600_000, timeout: 15_000 }
    )
  );
}

async function post<T>(user: User, path: string, body: unknown, method = "POST"): Promise<T> {
  const res = await fetch(path, { method, headers: { authorization: `Bearer ${await user.getIdToken()}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} ${res.status}`);
  return res.json() as Promise<T>;
}

export const placesNear = (user: User, latE1: number, lonE1: number) => post<{ places: Place[] }>(user, "/api/home/place", { latE1, lonE1 }).then((r) => r.places);
export const placesNamed = (user: User, query: string) => post<{ places: Place[] }>(user, "/api/home/place", { query }).then((r) => r.places);
export const weatherAt = (user: User, city: SavedCity) => post<WeatherReading>(user, "/api/home/weather", { latE1: city.latE1, lonE1: city.lonE1 });

/** "Use my location": the browser prompt, then our own lookup of the nearest place. */
export async function locateCity(user: User): Promise<{ outcome: PermissionOutcome; city: SavedCity | null }> {
  const pos = await roundedPosition();
  if (pos.state !== "granted") return { outcome: pos.state === "denied" ? "refused" : pos.state === "unsupported" ? "unsupported" : "not_now", city: null };
  const [place] = await placesNear(user, pos.latE1!, pos.lonE1!);
  return { outcome: "allowed", city: place ? { ...place, source: "device" } : null };
}

/** The notification prompt, then a push subscription saved on our server. */
export async function enableReminders(user: User): Promise<PermissionOutcome> {
  if ((await browserState("notifications")) === "unsupported") return "unsupported";
  const answer = await Notification.requestPermission();
  if (answer !== "granted") return answer === "denied" ? "refused" : "not_now";
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null }));
    await post(user, "/api/home/reminders", { endpoint: sub.endpoint, timeZone: timeZone() });
    return "allowed";
  } catch (error) {
    console.error("[home] reminders not set up", error instanceof Error ? error.name : error);
    return "unsupported";
  }
}

/** Account's "Turn reminders off": every browser of the account on our server, then this one. Throws when the server did not confirm. */
export async function disableReminders(user: User): Promise<void> {
  await post(user, "/api/home/reminders", { all: true }, "DELETE");
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/sw.js") : undefined;
  await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
}

/** The last reading this device saw for a place, so an outage still shows something with its time. */
const LAST_KEY = "home-v2:last-weather";
export function rememberWeather(city: SavedCity, c: WeatherReading) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ at: `${city.latE1},${city.lonE1}`, c }));
  } catch {
    /* private mode: nothing kept */
  }
}
export function lastWeather(city: SavedCity): WeatherReading | null {
  try {
    const v = JSON.parse(localStorage.getItem(LAST_KEY) ?? "null");
    return v?.at === `${city.latE1},${city.lonE1}` ? (v.c as WeatherReading) : null;
  } catch {
    return null;
  }
}

/**
 * Sign-out and account erase: this device's weather and its push
 * subscription go, so a shared phone keeps nothing of the account. With a
 * user (sign-out), this browser's subscription is removed on our server
 * first; after an erase the server copy is already gone.
 */
export async function forgetHomeDevice(user?: User): Promise<void> {
  try {
    localStorage.removeItem(LAST_KEY);
    sessionStorage.removeItem("home-v2:after-check");
    sessionStorage.removeItem(ASK_KEY);
  } catch {
    /* nothing kept */
  }
  const reg = "serviceWorker" in navigator ? await navigator.serviceWorker.getRegistration("/sw.js").catch(() => undefined) : undefined;
  const sub = await reg?.pushManager.getSubscription().catch(() => null);
  if (!sub) return;
  if (user) await post(user, "/api/home/reminders", { endpoint: sub.endpoint }, "DELETE").catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
}

/** The starter question Home hands to Echo; Echo sends ?ask= only when it matches (no sending from an outside link). */
export const ASK_KEY = "home-v2:ask";
