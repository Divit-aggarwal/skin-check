import CITIES from "./cities.json";
import type { SavedCity } from "./permissions";

// SERVER ONLY (the list is 440 KB). TD-47: a place name from a rounded
// position, or from what the user typed, looked up in an offline list
// (GeoNames, CC BY 4.0; scripts/build-cities.mjs), so no outside service ever
// sees a position or a typed city.

type Row = [name: string, region: string, country: string, lat100: number, lon100: number];
const ROWS = CITIES as Row[];

export type Place = Omit<SavedCity, "source">;

const place = (r: Row): Place => ({ name: r[0], region: r[1], country: r[2], latE1: Math.round(r[3] / 10), lonE1: Math.round(r[4] / 10) });

/** Within this distance the largest place wins, so a suburb shows as its city. */
const CITY_RADIUS_KM = 25;

/** The largest listed place within CITY_RADIUS_KM of a position in tenths of a degree, else the nearest. */
export function nearestPlace(latE1: number, lonE1: number): Place {
  const lat = latE1 / 10;
  const lon = lonE1 / 10;
  const k = Math.cos((lat * Math.PI) / 180);
  const km2 = (r: Row) => {
    const dLat = r[3] / 100 - lat;
    // Shortest way round the 180th meridian.
    const dLon = ((((r[4] / 100 - lon) % 360) + 540) % 360) - 180;
    return 111.2 ** 2 * (dLat * dLat + dLon * k * (dLon * k));
  };
  // ROWS is sorted by population, largest first.
  const city = ROWS.find((r) => km2(r) <= CITY_RADIUS_KM ** 2);
  if (city) return place(city);
  let best = ROWS[0]!;
  for (const r of ROWS) if (km2(r) < km2(best)) best = r;
  return place(best);
}

const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

/** Up to five places whose name starts with the query; the list is sorted by population, largest first. */
export function searchPlaces(query: string): Place[] {
  const q = fold(query);
  if (q.length < 2) return [];
  return ROWS.filter((r) => fold(r[0]).startsWith(q)).slice(0, 5).map(place);
}
