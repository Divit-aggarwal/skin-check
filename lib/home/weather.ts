// TD-47: today's weather and air. Pure rules, no fetch. Nothing here names
// the skin or a reading (no link between the weather and the user's skin).

export type UvCategory = "Low" | "Moderate" | "High" | "Very high" | "Extreme";
export type AqiCategory = "Good" | "Moderate" | "Unhealthy for sensitive groups" | "Unhealthy" | "Very unhealthy" | "Hazardous";

/** What the server returns for one place. */
export interface WeatherReading {
  uv: number;
  humidity: number;
  usAqi: number;
  /** ISO time of the reading. */
  observedAt: string;
  /** °C now (G37, screen 02). Optional: an older saved reading, or a source that left it out. */
  temperature?: number;
  /** Today's hourly UV in the place's own time (G37, screen 02). */
  hourly?: UvHour[];
  /** The last hour today with UV of 6 or more, while still ahead (uvHighUntil); null when none. */
  uvHighUntil?: number | null;
}

/** One hour of today's UV: hour 0-23 in the place's own time. */
export interface UvHour {
  hour: number;
  uv: number;
}

/** Open-Meteo's hourly arrays (local "YYYY-MM-DDTHH:MM") → the hours of `day` that have a number. */
export function hoursOf(times: unknown, values: unknown, day: string): UvHour[] {
  if (!Array.isArray(times) || !Array.isArray(values)) return [];
  return times.flatMap((t, i) => {
    const v = values[i];
    return typeof t === "string" && t.startsWith(`${day}T`) && typeof v === "number" && Number.isFinite(v) ? [{ hour: Number(t.slice(11, 13)), uv: v }] : [];
  });
}

/**
 * "UV high until <hour>": the last hour today with UV of 6 or more (WHO High,
 * rounded like uvCategory), only while that hour is not yet past. `nowHour`
 * is the place's own hour from the reading, not this machine's clock.
 */
export function uvHighUntil(hours: readonly UvHour[], nowHour: number): number | null {
  const high = hours.filter((h) => Math.round(h.uv) >= 6);
  const last = high[high.length - 1];
  return last && last.hour >= nowHour ? last.hour : null;
}

/** WHO UV index categories. */
export function uvCategory(uv: number): UvCategory {
  const i = Math.round(uv);
  return i <= 2 ? "Low" : i <= 5 ? "Moderate" : i <= 7 ? "High" : i <= 10 ? "Very high" : "Extreme";
}

/** US EPA AQI categories. */
export function aqiCategory(aqi: number): AqiCategory {
  const i = Math.round(aqi);
  return i <= 50 ? "Good" : i <= 100 ? "Moderate" : i <= 150 ? "Unhealthy for sensitive groups" : i <= 200 ? "Unhealthy" : i <= 300 ? "Very unhealthy" : "Hazardous";
}

/** The one advice line, chosen from the UV category only (docs/design/home-v2.md). */
export const UV_ADVICE: Record<UvCategory, string> = {
  Low: "If you are outdoors for long, sunscreen still helps.",
  Moderate: "Wear sunscreen when you go outdoors, and seek shade around midday.",
  High: "Wear sunscreen outdoors and reapply every two hours. Seek shade around midday.",
  "Very high": "Wear sunscreen, a hat and sunglasses outdoors. Stay in the shade around midday.",
  Extreme: "Stay out of the midday sun if you can. Outdoors, wear sunscreen, a hat and sunglasses.",
};

/**
 * A coordinate in whole tenths of a degree (about 11 km). The only form a
 * position is kept or sent in; the browser rounds before anything leaves it.
 */
export const toTenths = (degrees: number) => Math.round(degrees * 10);

export const isLatE1 = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= -900 && (v as number) <= 900;
export const isLonE1 = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= -1800 && (v as number) <= 1800;
