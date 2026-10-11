import type { Conditions } from "./conditions";

// SERVER ONLY. TD-47: today's UV, humidity and air quality from Open-Meteo
// (https://open-meteo.com, data CC BY 4.0). Business use needs the paid
// customer hosts and OPEN_METEO_API_KEY; the free hosts are never used in a
// production build. Only the rounded position (tenths of a degree) is sent:
// no user id, no city name, no token.

export class ConditionsUnavailableError extends Error {}

/** How long one place's reading is reused, across users and instances (Next's fetch cache). */
export const CONDITIONS_CACHE_SECONDS = 1800;
const TIMEOUT_MS = 5000;

function hosts(): { forecast: string; air: string; key: string | null } {
  // Local stack only (scripts/fake-conditions.mjs): never in a production build.
  const local = process.env.NODE_ENV !== "production" ? process.env.CONDITIONS_LOCAL_BASE_URL : undefined;
  if (local) return { forecast: local, air: local, key: null };
  const key = process.env.OPEN_METEO_API_KEY;
  if (!key) throw new ConditionsUnavailableError("OPEN_METEO_API_KEY is not set");
  return { forecast: "https://customer-api.open-meteo.com", air: "https://customer-air-quality-api.open-meteo.com", key };
}

async function get(url: URL): Promise<Record<string, unknown>> {
  const res = await fetch(url, { next: { revalidate: CONDITIONS_CACHE_SECONDS }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new ConditionsUnavailableError(`conditions source ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

export async function fetchConditions(latE1: number, lonE1: number): Promise<Conditions> {
  const { forecast, air, key } = hosts();
  const where = (path: string, base: string, params: Record<string, string>) => {
    const u = new URL(path, base);
    u.search = new URLSearchParams({ latitude: (latE1 / 10).toFixed(1), longitude: (lonE1 / 10).toFixed(1), timezone: "auto", ...params, ...(key ? { apikey: key } : {}) }).toString();
    return u;
  };
  const [w, a] = await Promise.all([
    get(where("/v1/forecast", forecast, { current: "relative_humidity_2m", daily: "uv_index_max", forecast_days: "1" })),
    get(where("/v1/air-quality", air, { current: "us_aqi" })),
  ]);
  const wc = (w.current ?? {}) as Record<string, unknown>;
  const daily = (w.daily ?? {}) as Record<string, unknown>;
  const uv = num(Array.isArray(daily.uv_index_max) ? daily.uv_index_max[0] : null);
  const humidity = num(wc.relative_humidity_2m);
  const usAqi = num(((a.current ?? {}) as Record<string, unknown>).us_aqi);
  const offset = num(w.utc_offset_seconds) ?? 0;
  if (uv === null || humidity === null || usAqi === null || typeof wc.time !== "string") throw new ConditionsUnavailableError("conditions source: missing values");
  // Open-Meteo gives local time without a zone; turn it into a real instant.
  const observedAt = new Date(Date.parse(`${wc.time}:00Z`) - offset * 1000).toISOString();
  return { uv, humidity, usAqi, observedAt };
}
