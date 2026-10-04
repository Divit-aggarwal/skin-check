import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DASHBOARD_COPY } from "@/components/dashboard/copy";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { CAUSE, CHANGE, DIAGNOSIS, FORECAST, MEDICAL } from "@/lib/context/lexicon";

// G01 wording (docs/lanes/dashboard-design.md §4; D-12). Every string and JSX
// text the dashboard shows goes through every existing banned-word check.
// The context lexicon's NUMBER pattern is NOT applied: the owner asked for the
// starting-check count ("n of 3"), and dates carry digits.

// Copied verbatim from tests/comparability-wording.test.ts.
const BANNED_WORDS = /\b(improve\w*|worse|better|reduc\w*|increas\w*|decreas\w*|because|caused|due to|effect\w*|works)\b/i;
const CHANGE_WORDS = "(up|down|more|less|higher|lower|change\\w*|delta|drop\\w*|rise|rose|gain\\w*|loss)";
const DIGIT_NEXT_TO_CHANGE = new RegExp(`\\d\\s*${CHANGE_WORDS}\\b|\\b${CHANGE_WORDS}\\s*[+-]?\\d`, "i");

function problems(text: string): string[] {
  const out = bannedWordsIn(text);
  for (const [name, re] of Object.entries({ BANNED_WORDS, DIGIT_NEXT_TO_CHANGE, CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST })) {
    if (re.test(text)) out.push(name);
  }
  return out;
}

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  // Every value the page passes: dates as formatDate prints them, and each count 0..3.
  if (typeof v === "function") return ["3 Oct 2026", "4 October 2026", "Just now", 0, 1, 2, 3].flatMap((x) => strings(v(x, 3)));
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

/** String literals and JSX text (text between > and <) in a source file, comments removed; same regex extraction as tests/routine-copy.test.ts. */
function sourceText(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const literals = Array.from(code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)).map((m) => m[1] ?? m[2] ?? m[3]!);
  const jsx = Array.from(code.matchAll(/>([^<]+)</g))
    .map((m) => m[1]!.replace(/\{[^}]*\}/g, " ").trim())
    .filter(Boolean);
  return [...literals, ...jsx];
}

const DIRS = ["components/dashboard", "app/(marketing)/dashboard"];
const files = () =>
  DIRS.filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d, { recursive: true, encoding: "utf8" }).map((f) => join(d, f)))
    .filter((f) => /\.(ts|tsx)$/.test(f));

describe("dashboard wording (D-12)", () => {
  it("each checker catches its own words (positive control)", () => {
    expect(problems("your redness improved")).toEqual(expect.arrayContaining(["improve*", "BANNED_WORDS", "CHANGE"]));
    expect(problems("down 3 points")).toContain("DIGIT_NEXT_TO_CHANGE");
    expect(problems("lower than last time")).toContain("CHANGE");
    expect(problems("a clinical reading")).toContain("MEDICAL");
    expect(problems("looks like acne")).toContain("DIAGNOSIS");
    expect(problems("this is due to stress")).toContain("CAUSE");
    expect(problems("nothing over time")).toContain("FORECAST");
    expect(problems("Starting checks: 2 of 3")).toEqual([]);
  });

  it("no sentence in the dashboard copy has a banned word", () => {
    const all = strings(DASHBOARD_COPY);
    expect(all.length).toBeGreaterThan(40);
    for (const s of all) expect(problems(s), s).toEqual([]);
  });

  it("no string or JSX text in the dashboard files has a banned word", () => {
    const found = files();
    expect(found.length).toBeGreaterThanOrEqual(4);
    for (const f of found) {
      for (const s of sourceText(readFileSync(f, "utf8"))) expect(problems(s), `${f}: ${s}`).toEqual([]);
    }
  });

  it("the dashboard files never show a score, a band colour or an arrow", () => {
    for (const f of files()) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\/100|toConcern|BAND_STYLE|scorePct|Arrow|Trending|Chart/);
      expect(src, f).not.toMatch(/text-(red|green|emerald|rose|amber)-|text-blush|border-blush/);
    }
  });

  it("a band's style never depends on the band: every reading row has one fixed class", () => {
    const src = readFileSync("components/dashboard/CheckReadings.tsx", "utf8");
    const rows = Array.from(src.matchAll(/<(dt|dd)\b[^>]*>/g)).map((m) => m[0]);
    expect(rows.length).toBe(2);
    for (const r of rows) expect(r, r).toMatch(/^<d[dt] className="[^"{]*">$/);
  });

  it("the dashboard never imports the rules feature or the longitudinal engine", () => {
    for (const f of files()) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/@\/lib\/rules|lib\/longitudinal\/eng|@\/lib\/context|@\/lib\/gemini/);
    }
  });
});

// TD-18: O-D1, O-D3, O-D6.
describe("dashboard owner decisions (TD-18)", () => {
  it("O-D1: no recommendation in any build: no rules, catalogue or product import, no product wording", () => {
    for (const f of [...files(), "app/(marketing)/dashboard/page.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/@\/lib\/rules|@\/lib\/catalog\/catalogue|recommend|RULES_ENABLED/i);
    }
    expect(JSON.stringify(DASHBOARD_COPY)).not.toMatch(/recommend|product|try this|you should use/i);
  });

  it("O-D3: the results screen, /account and the signed-in start page link to /dashboard", () => {
    const link = readFileSync("components/dashboard/DashboardLink.tsx", "utf8");
    expect(link).toMatch(/href="\/dashboard"/);
    expect(link).toMatch(/if \(loading \|\| !user\) return null/);
    const flow = readFileSync("components/skin-check/SkinCheckFlow.tsx", "utf8");
    // Once on the results screen (complete) and once on the first section (start page).
    expect(flow.match(/<DashboardLink\b/g)).toHaveLength(2);
    expect(flow).toMatch(/isFirst && !complete && \(/);
    expect(readFileSync("app/(marketing)/account/page.tsx", "utf8")).toMatch(/<DashboardLink \/>/);
  });

  it("O-D6: no trend text says 'yet'", () => {
    for (const text of Object.values(DASHBOARD_COPY.trend)) {
      const s = typeof text === "function" ? (text as (...a: number[]) => string)(1, 3) : text;
      expect(s, s).not.toMatch(/\byet\b/i);
    }
  });
});

// K-1: a dashboard hand-off to Echo is never reopened as a results screen.
describe("K-1", () => {
  it("the dashboard marks its Echo session, Echo's back link follows it, and the flow ignores it", () => {
    expect(readFileSync("components/dashboard/DashboardPage.tsx", "utf8")).toMatch(/fromDashboard: true/);
    const echo = readFileSync("components/skin-check/EchoPage.tsx", "utf8");
    expect(echo).toMatch(/href=\{session\.fromDashboard \? "\/dashboard" : "\/skin-check"\}/);
    const flow = readFileSync("lib/useSkinCheckFlow.ts", "utf8");
    expect(flow).toMatch(/const session = liveSession\?\.fromDashboard \? null : liveSession;/);
    // Every later use reads the filtered `session`, never the raw one.
    expect(flow.match(/liveSession/g)).toHaveLength(3);
  });
});
