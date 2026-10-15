import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { HOME_COPY } from "@/components/dashboard/homeCopy";
import { aqiCategory, uvCategory, UV_ADVICE } from "@/lib/home/weather";
import { bannedWordsIn, labelIsExcepted, LABEL_EXCEPTIONS } from "@/lib/catalog/wording";
import { CAUSE, CHANGE, DIAGNOSIS, FORECAST, MEDICAL } from "@/lib/context/lexicon";

// TD-47 (4): every new string on Home, the permissions screen and Account's
// Home settings: no change words, no percentages, no diagnosis, no link
// between the weather and the skin. Same checkers as
// tests/dashboard-copy.test.ts (which also scans the new files' source).

const BANNED_WORDS = /\b(improve\w*|worse|better|reduc\w*|increas\w*|decreas\w*|because|caused|due to|effect\w*|works)\b/i;
const problems = (text: string) => {
  // TD-49: the three owner-approved labels, exact whole text only.
  if (labelIsExcepted(text)) return [];
  const out = bannedWordsIn(text);
  for (const [name, re] of Object.entries({ BANNED_WORDS, CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST })) if (re.test(text)) out.push(name);
  return out;
};

/** Every string, functions called with the values the page passes (counts 0 to 9, names, dates, times). */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") return [0, 1, 2, 3, 7, 9].flatMap((n) => strings((v as (...a: unknown[]) => unknown)(n, 3))).concat(strings((v as (...a: unknown[]) => unknown)("Bengaluru", "8:30 am")));
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

const ALL = [...strings(HOME_COPY), ...Object.values(UV_ADVICE), ...[0, 3, 6, 8, 11].map(uvCategory), ...[0, 60, 120, 180, 250, 400].map(aqiCategory)];
const WEATHER = [...strings(HOME_COPY.weather), ...Object.values(UV_ADVICE), ...[0, 3, 6, 8, 11].map(uvCategory), ...[0, 60, 120, 180, 250, 400].map(aqiCategory)];

describe("Home v2 wording (TD-47 (4), D-12)", () => {
  it("the checkers catch their own words (positive control)", () => {
    expect(problems("your redness is lower than last check")).not.toEqual([]);
    expect(problems("a sign of acne")).not.toEqual([]);
    expect(problems("your skin will improve")).not.toEqual([]);
    // TD-51: "progress" left the D-12 word list; Home's own CHANGE check still has it.
    expect(problems("Your progress so far")).not.toContain("progress*");
    expect(problems("Skin conditions")).toContain("MEDICAL");
  });

  it("TD-49: the three label exceptions are exact; the words stay banned everywhere else", () => {
    expect(LABEL_EXCEPTIONS).toEqual(["Your progress", "Today's conditions", "View full results"]);
    for (const s of ["Skin conditions today", "View full results of your skin", "Today's conditions "]) expect(problems(s), s).not.toEqual([]);
    expect(Array.from(new Set(ALL.filter(labelIsExcepted))).sort()).toEqual([...LABEL_EXCEPTIONS].sort());
  });

  it("no change, cause, forecast, medical or diagnosis word in any new string", () => {
    expect(ALL.length).toBeGreaterThan(100);
    for (const s of ALL) expect(problems(s), s).toEqual([]);
  });

  it("no percentage, score or arrow; the one % is the humidity value's unit", () => {
    const withPercent = ALL.filter((s) => s.includes("%"));
    expect(withPercent.length).toBeGreaterThan(0);
    // Only the humidity value ("68%"): a number and its unit, nothing else.
    for (const s of withPercent) expect(s, s).toMatch(/^(\d+|NaN)%$/);
    expect(HOME_COPY.weather.humidityValue(68.4)).toBe("68%");
    for (const s of ALL) expect(s, s).not.toMatch(/\/100|out of 100|score|↑|↓|▲|▼|→|←|percent/i);
  });

  it("no weather line names the skin, a reading or a check", () => {
    for (const s of WEATHER) expect(s, s).not.toMatch(/skin|redness|oil|breakout|texture|dark mark|pore|reading|check|face|acne/i);
  });

  it("no line on Home claims a change between checks or ties the routine to a result", () => {
    for (const s of ALL) expect(s, s).not.toMatch(/since your last|than before|compared|change in your|thanks to your routine/i);
  });

  it("the location consent line is marked for legal review in the code", () => {
    const src = readFileSync("components/dashboard/homeCopy.ts", "utf8");
    expect(src).toMatch(/LEGAL REVIEW NEEDED \(TD-47\): consent line for location\.\n\s+locationConsent:/);
    expect(readFileSync("components/dashboard/PermissionsScreen.tsx", "utf8")).toMatch(/data-legal-review="TD-47 location consent"/);
  });
});
