import { describe, expect, it } from "vitest";
import { CHECK_INTERVAL_RULE, isDue, nextCheck, partOfDay } from "@/lib/home/schedule";
import { daysLoggedLast7, routineStreak } from "@/lib/routine/streak";
import { aqiCategory, isLatE1, isLonE1, toTenths, uvCategory, UV_ADVICE } from "@/lib/home/weather";
import { needsHomeScreen, outcomeOf, promptFor, showPermissions } from "@/lib/home/permissions";
import { nearestPlace, searchPlaces } from "@/lib/home/places";

// TD-47 (docs/design/home-v2.md): the countdown, the streak, the advice rules,
// rounding the location and the permission states.

const IST = "Asia/Kolkata";
const at = (iso: string) => new Date(iso);

describe("next check countdown", () => {
  it("is a named, provisional 7-day setting", () => {
    expect(CHECK_INTERVAL_RULE).toEqual({ days: 7, status: "provisional" });
  });

  it("no check yet: the first check", () => {
    expect(nextCheck(null, at("2026-10-11T10:00:00Z"), IST)).toEqual({ kind: "first" });
  });

  it("counts whole local days: in X days, due today, overdue by X days", () => {
    const last = at("2026-10-04T05:00:00Z"); // 4 Oct, 10:30 IST
    expect(nextCheck(last, at("2026-10-05T05:00:00Z"), IST)).toEqual({ kind: "in", days: 6 });
    expect(nextCheck(last, at("2026-10-10T18:00:00Z"), IST)).toEqual({ kind: "in", days: 1 }); // 10 Oct 23:30 IST
    expect(nextCheck(last, at("2026-10-10T18:31:00Z"), IST)).toEqual({ kind: "today" }); // 11 Oct 00:01 IST
    expect(nextCheck(last, at("2026-10-14T05:00:00Z"), IST)).toEqual({ kind: "overdue", days: 3 });
    expect(isDue({ kind: "today" })).toBe(true);
    expect(isDue({ kind: "in", days: 1 })).toBe(false);
  });

  it("a check late in the evening counts on its own local date, not the UTC date", () => {
    const last = at("2026-10-04T20:00:00Z"); // 5 Oct 01:30 IST, still 4 Oct in UTC
    expect(nextCheck(last, at("2026-10-12T06:00:00Z"), IST)).toEqual({ kind: "today" });
    expect(nextCheck(last, at("2026-10-12T06:00:00Z"), "UTC")).toEqual({ kind: "overdue", days: 1 });
  });

  it("the same moment is a different day in another time zone", () => {
    const last = at("2026-10-04T12:00:00Z");
    const now = at("2026-10-11T02:00:00Z"); // 11 Oct in Kolkata, 10 Oct in Los Angeles
    expect(nextCheck(last, now, IST)).toEqual({ kind: "today" });
    expect(nextCheck(last, now, "America/Los_Angeles")).toEqual({ kind: "in", days: 1 });
  });

  it("greets by the user's own hour", () => {
    expect(partOfDay(at("2026-10-11T03:00:00Z"), IST)).toBe("morning"); // 08:30
    expect(partOfDay(at("2026-10-11T06:29:00Z"), IST)).toBe("morning"); // 11:59
    expect(partOfDay(at("2026-10-11T06:30:00Z"), IST)).toBe("afternoon"); // 12:00
    expect(partOfDay(at("2026-10-11T11:30:00Z"), IST)).toBe("evening"); // 17:00
    expect(partOfDay(at("2026-10-11T18:29:00Z"), IST)).toBe("evening"); // 23:59
  });
});

describe("routine streak", () => {
  const used = (d: string) => ({ type: "usage" as const, effectiveDate: d });
  const today = "2026-10-11";

  it("counts days in a row ending today", () => {
    expect(routineStreak([used("2026-10-09"), used("2026-10-10"), used("2026-10-11")], today)).toBe(3);
  });

  it("today not logged yet: the run up to yesterday still counts (it ends at midnight, not before)", () => {
    expect(routineStreak([used("2026-10-09"), used("2026-10-10")], today)).toBe(2);
  });

  it("a gap ends the run; a gap of two days before today is 0", () => {
    expect(routineStreak([used("2026-10-07"), used("2026-10-08"), used("2026-10-10"), used("2026-10-11")], today)).toBe(2);
    expect(routineStreak([used("2026-10-08")], today)).toBe(0);
  });

  it("several logs on one day count once; skipped counts as logged; other events never count", () => {
    const events = [used("2026-10-11"), used("2026-10-11"), { type: "usage" as const, effectiveDate: "2026-10-10" }, { type: "start" as const, effectiveDate: "2026-10-09" }];
    expect(routineStreak(events, today)).toBe(2);
  });

  it("over a month end and a year end", () => {
    expect(routineStreak([used("2026-09-30"), used("2026-10-01")], "2026-10-01")).toBe(2);
    expect(routineStreak([used("2025-12-31"), used("2026-01-01")], "2026-01-01")).toBe(2);
  });

  it("a log made just after midnight with yesterday's date (the page was opened before midnight) keeps the run", () => {
    // effectiveDate is the date the page had when the user tapped, so it belongs to that day.
    expect(routineStreak([used("2026-10-10")], "2026-10-11")).toBe(1);
  });

  it("days logged in the last 7 days, today included", () => {
    expect(daysLoggedLast7([used("2026-10-05"), used("2026-10-04"), used("2026-10-11"), used("2026-10-11")], today)).toBe(2);
    expect(daysLoggedLast7([], today)).toBe(0);
  });
});

describe("weather and air rules", () => {
  it("UV categories (WHO), at each edge", () => {
    expect([0, 2, 2.4, 2.5, 5, 6, 7, 8, 10, 11, 14].map(uvCategory)).toEqual([
      "Low", "Low", "Low", "Moderate", "Moderate", "High", "High", "Very high", "Very high", "Extreme", "Extreme",
    ]);
  });

  it("US AQI categories, at each edge", () => {
    expect([0, 50, 51, 100, 101, 150, 151, 200, 201, 300, 301].map(aqiCategory)).toEqual([
      "Good", "Good", "Moderate", "Moderate", "Unhealthy for sensitive groups", "Unhealthy for sensitive groups",
      "Unhealthy", "Unhealthy", "Very unhealthy", "Very unhealthy", "Hazardous",
    ]);
  });

  it("one advice line per UV category, and none mentions the skin or a reading", () => {
    expect(Object.keys(UV_ADVICE)).toEqual(["Low", "Moderate", "High", "Very high", "Extreme"]);
    for (const line of Object.values(UV_ADVICE)) expect(line).not.toMatch(/skin|redness|oil|breakout|texture|dark mark|reading|check/i);
  });

  it("rounds a position to tenths of a degree; the stored forms are integers in range", () => {
    expect(toTenths(12.97194)).toBe(130);
    expect(toTenths(77.59369)).toBe(776);
    expect(toTenths(-0.04)).toBe(-0);
    expect(isLatE1(130)).toBe(true);
    expect(isLatE1(12.9)).toBe(false);
    expect(isLatE1(901)).toBe(false);
    expect(isLonE1(-1800)).toBe(true);
    expect(isLonE1("776")).toBe(false);
  });

  it("finds the nearest listed place, and places by name", () => {
    expect(nearestPlace(130, 776)).toMatchObject({ name: "Bengaluru", country: "India", latE1: 130, lonE1: 776 });
    expect(nearestPlace(191, 729).name).toBe("Mumbai");
    // The 180th meridian: just east and just west of it find the same place.
    expect(nearestPlace(-181, -1800)).toEqual(nearestPlace(-181, 1800));
    expect(nearestPlace(-181, -1799)).toEqual(nearestPlace(-181, 1799));
    expect(searchPlaces("bengal")[0]).toMatchObject({ name: "Bengaluru" });
    expect(searchPlaces("DELHI")[0]!.country).toBe("India");
    expect(searchPlaces("x")).toEqual([]);
    expect(searchPlaces("zzzz")).toEqual([]);
  });
});

describe("permission states", () => {
  it("records what the browser decided", () => {
    expect(outcomeOf("granted")).toBe("allowed");
    expect(outcomeOf("denied")).toBe("refused");
    expect(outcomeOf("prompt")).toBe("not_now"); // the prompt was dismissed
    expect(outcomeOf("unsupported")).toBe("unsupported");
  });

  it("Home asks again only while the browser can ask; a block shows the browser settings", () => {
    expect(promptFor("prompt", false)).toBe("ask");
    expect(promptFor("denied", false)).toBe("blocked");
    expect(promptFor("unsupported", false)).toBe("unsupported");
    expect(promptFor("granted", false)).toBe("none");
    expect(promptFor("denied", true)).toBe("none");
  });

  it("the screen shows only after a check, only once, only for a choice not made yet, never after a failed read", () => {
    const on = { weather: true, push: true };
    expect(showPermissions({ afterCheck: true, settings: null, ...on })).toBe(true);
    expect(showPermissions({ afterCheck: false, settings: null, ...on })).toBe(false); // sign-in, a link, the nav
    expect(showPermissions({ afterCheck: true, settings: { askedAt: new Date() }, ...on })).toBe(false);
    expect(showPermissions({ afterCheck: true, settings: { location: "not_now" }, ...on })).toBe(true); // reminders not chosen yet
    // Both chosen on Home cards or in Account: nothing to ask, the screen never wipes them.
    expect(showPermissions({ afterCheck: true, settings: { location: "allowed", reminders: "allowed" }, ...on })).toBe(false);
    expect(showPermissions({ afterCheck: true, settings: { location: "allowed" }, weather: true, push: false })).toBe(false);
    expect(showPermissions({ afterCheck: true, settings: "error", ...on })).toBe(false);
    expect(showPermissions({ afterCheck: true, settings: null, weather: false, push: false })).toBe(false);
  });

  it("the home-screen hint is for iPhone and iPad in the browser only", () => {
    const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
    const ipad = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
    const android = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/129.0 Mobile Safari/537.36";
    const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
    expect(needsHomeScreen(iphone, false)).toBe(true);
    expect(needsHomeScreen(iphone, true)).toBe(false);
    expect(needsHomeScreen(ipad, false)).toBe(true);
    expect(needsHomeScreen(android, false)).toBe(false);
    expect(needsHomeScreen(mac, false)).toBe(false);
  });
});
