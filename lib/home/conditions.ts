// TD-47: today's weather and air. Pure rules, no fetch. Nothing here names
// the skin or a reading (no link between the weather and the user's skin).

export type UvCategory = "Low" | "Moderate" | "High" | "Very high" | "Extreme";
export type AqiCategory = "Good" | "Moderate" | "Unhealthy for sensitive groups" | "Unhealthy" | "Very unhealthy" | "Hazardous";

/** What the server returns for one place. */
export interface Conditions {
  uv: number;
  humidity: number;
  usAqi: number;
  /** ISO time of the reading. */
  observedAt: string;
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
