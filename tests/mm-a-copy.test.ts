import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { CAUSE, CHANGE, DIAGNOSIS, FORECAST, MEDICAL } from "@/lib/context/lexicon";
import { CHECKS_COPY } from "@/components/checks/copy";
import { PROGRESS_COPY } from "@/components/progress/copy";
import { parseWindow, READING_ORDER, seriesChecks } from "@/components/checks/series";
import { readingsOverTime } from "@/lib/readings/series";
import { SHOWN_METRICS } from "@/lib/skin-check-skus";

// Lane mm/a (G37, screens 09-12): the new words pass the D-12 checks, the
// window control is wired to the address, and empty data gives the empty state.

const files = (dirs: string[]) => dirs.flatMap((d) => readdirSync(d, { recursive: true, encoding: "utf8" }).map((f) => join(d, f))).filter((f) => /\.tsx?$/.test(f));
const strings = (v: unknown): string[] =>
  typeof v === "string" ? [v] : typeof v === "function" ? [String(v("3 Oct 2026")), String(v(2))] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];

describe("mm/a copy", () => {
  it("every Skin Twin, concern, check and Progress string passes the banned-word and change/cause checks", () => {
    for (const s of [...strings(CHECKS_COPY), ...strings(PROGRESS_COPY)]) {
      expect(bannedWordsIn(s), s).toEqual([]);
      // TD-51: the names "Skin Twin" and "Progress" are allowed; every other change, medical, cause or forecast word is not.
      const rest = s.replace(/\bSkin Twin\b|\bProgress\b/g, "");
      expect([CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST].filter((re) => re.test(rest)), s).toEqual([]);
    }
  });

  it("the new screens' files never draw a score, an arrow or a chart of their own", () => {
    for (const f of files(["components/progress", "app/(marketing)/progress", "components/checks"])) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\/100|scorePct|toConcern|ArrowUp|ArrowDown|Trending|Chart/);
    }
  });
});

describe("mm/a window control", () => {
  it("reads the weeks from the address, falling back to 12 weeks", () => {
    expect(parseWindow("4w")).toBe("4w");
    expect(parseWindow("all")).toBe("all");
    expect(parseWindow(null)).toBe("12w");
    expect(parseWindow("52w")).toBe("12w");
  });

  it("readings follow a fixed order (never sorted by a level), all five", () => {
    expect([...READING_ORDER].sort()).toEqual([...SHOWN_METRICS].sort());
  });
});

describe("mm/a empty state", () => {
  it("no checks: no series points and every change slot needs more checks", () => {
    const empty = { checks: [], analyses: [], laterAnswers: [] };
    const checks = seriesChecks("u1", empty, []);
    expect(checks).toEqual([]);
    const over = readingsOverTime(checks, "12w", new Date());
    for (const s of over.series) {
      expect(s.points).toEqual([]);
      expect(s.change.status).toBe("needs_more_checks");
    }
  });
});
