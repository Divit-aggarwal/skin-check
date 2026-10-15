import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchWeather, WeatherUnavailableError } from "@/lib/home/open-meteo";
import { hoursOf, uvHighUntil } from "@/lib/home/weather";
import { HOME_COPY } from "@/components/dashboard/homeCopy";
import { ECHO_COPY } from "@/components/skin-check/echoCopy";
import { bannedWordsIn, labelIsExcepted } from "@/lib/catalog/wording";

// Mockup match lane D (G37): screen 02's temperature, hourly UV and "UV high
// until", and the copy added for 01, 02, 03, 18 and 19.

const hour = (h: number) => `2026-10-11T${String(h).padStart(2, "0")}:00`;
const HOURS = Array.from({ length: 24 }, (_, h) => hour(h));
//            0  1  2  3  4  5  6    7    8    9    10   11   12   13   14   15   16   17   18 19 20 21 22 23
const UV = [0, 0, 0, 0, 0, 0, 0.1, 0.8, 2.1, 3.9, 5.2, 6.6, 7.9, 7.4, 6.1, 4.2, 2.3, 0.7, 0, 0, 0, 0, 0, 0];
const FORECAST = {
  utc_offset_seconds: 19800,
  current: { time: "2026-10-11T09:30", relative_humidity_2m: 68, temperature_2m: 29.6 },
  daily: { uv_index_max: [7.9] },
  hourly: { time: HOURS, uv_index: UV },
};
const AIR = { current: { time: "2026-10-11T09:00", us_aqi: 85 } };

function stubFetch(forecast: unknown = FORECAST) {
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: URL | string) => {
    calls.push(String(url));
    return Response.json(String(url).includes("air-quality") ? AIR : forecast);
  }));
  return calls;
}

beforeEach(() => vi.stubEnv("WEATHER_LOCAL_BASE_URL", "http://weather.test"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("hourly UV (02)", () => {
  it("parses today's hours only, skipping values that are not numbers", () => {
    const times = [...HOURS, "2026-10-12T00:00"];
    const values = [...UV.slice(0, 23), null, 4];
    const out = hoursOf(times, values, "2026-10-11");
    expect(out).toHaveLength(23);
    expect(out[12]).toEqual({ hour: 12, uv: 7.9 });
    expect(out.some((h) => h.hour === 23)).toBe(false);
    expect(hoursOf("x", UV, "2026-10-11")).toEqual([]);
    expect(hoursOf(HOURS, undefined, "2026-10-11")).toEqual([]);
  });

  it("UV high until: the last hour today at 6 or more (WHO High), while it is still ahead", () => {
    const hours = hoursOf(HOURS, UV, "2026-10-11");
    expect(uvHighUntil(hours, 9)).toBe(14);
    expect(uvHighUntil(hours, 14)).toBe(14);
    // Already past: nothing is said.
    expect(uvHighUntil(hours, 15)).toBeNull();
    // Rounded like the category: 5.5 counts as 6, 5.4 does not.
    expect(uvHighUntil([{ hour: 10, uv: 5.5 }, { hour: 11, uv: 5.4 }], 8)).toBe(10);
    expect(uvHighUntil([{ hour: 10, uv: 5.4 }], 8)).toBeNull();
    expect(uvHighUntil([], 8)).toBeNull();
  });
});

describe("conditions source: temperature and hourly UV in the same forecast call", () => {
  it("one forecast call and one air call; temperature, today's hours and the until hour come back", async () => {
    const calls = stubFetch();
    const r = await fetchWeather(130, 776);
    expect(calls).toHaveLength(2);
    const forecast = new URL(calls.find((c) => c.includes("/v1/forecast"))!);
    expect(forecast.searchParams.get("current")).toBe("relative_humidity_2m,temperature_2m");
    expect(forecast.searchParams.get("hourly")).toBe("uv_index");
    expect(r).toMatchObject({ uv: 7.9, humidity: 68, usAqi: 85, temperature: 29.6, uvHighUntil: 14 });
    expect(r.hourly).toHaveLength(24);
  });

  it("without temperature or hours the reading still comes back, without them", async () => {
    stubFetch({ ...FORECAST, current: { time: "2026-10-11T09:30", relative_humidity_2m: 68 }, hourly: undefined });
    const r = await fetchWeather(130, 776);
    expect(r.temperature).toBeUndefined();
    expect(r.hourly).toBeUndefined();
    expect(r.uvHighUntil).toBeUndefined();
  });

  it("hidden without the key: production without OPEN_METEO_API_KEY calls nothing", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OPEN_METEO_API_KEY", "");
    const calls = stubFetch();
    await expect(fetchWeather(130, 776)).rejects.toBeInstanceOf(WeatherUnavailableError);
    expect(calls).toEqual([]);
  });

  it("the local stand-in sends the same new fields (no real host in local runs)", () => {
    const src = readFileSync("scripts/fake-weather.mjs", "utf8");
    expect(src).toMatch(/temperature_2m/);
    expect(src).toMatch(/uv_index:/);
    expect(src).not.toMatch(/open-meteo\.com/);
  });
});

describe("copy (01, 02, 03, 18, 19)", () => {
  const all = (v: unknown): string[] =>
    typeof v === "string" ? [v] : typeof v === "function" ? all((v as (...a: unknown[]) => unknown)(2, 3)).concat(all((v as (...a: unknown[]) => unknown)("2 pm", "Bengaluru"))) : Array.isArray(v) ? v.flatMap(all) : v && typeof v === "object" ? Object.values(v).flatMap(all) : [];
  it("no banned word in the Home, weather or Echo strings", () => {
    for (const s of [...all(HOME_COPY), ...all(ECHO_COPY)].filter((t) => !labelIsExcepted(t))) expect(bannedWordsIn(s), s).toEqual([]);
  });
  it("no weather line names the skin; the until line is about the hour only", () => {
    expect(HOME_COPY.weather.uvHighUntil("2 pm")).toBe("UV is high until 2 pm today.");
    for (const s of all(HOME_COPY.weather)) expect(s, s).not.toMatch(/skin|pigment|sensitiv|redness|oil|breakout|acne/i);
  });
  it("no claim words in the Echo quick actions", () => {
    for (const s of all(ECHO_COPY.quick)) expect(s, s).not.toMatch(/working|improv|track changes|learns|personalised/i);
  });
});
