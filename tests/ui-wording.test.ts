import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { SHOWN_METRICS } from "@/lib/skin-check-skus";
import { describe, expect, it } from "vitest";
import { CHECKS_COPY } from "@/components/checks/copy";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { CAUSE, CHANGE, DIAGNOSIS, FORECAST, MEDICAL } from "@/lib/context/lexicon";

// G03: the redesigned screens outside components/dashboard (which
// tests/dashboard-copy.test.ts covers) pass the same D-12 checks, and TD-25 (6):
// the word "check" on screen, never "scan".

const DIRS = ["components/checks", "components/timeline", "components/shell", "components/ui/page.tsx", "app/(marketing)/checks", "components/skin-check/echoCopy.ts", "app/(marketing)/account/AccountView.tsx", "app/(marketing)/account/copy.ts", "app/not-found.tsx", "app/(marketing)/error.tsx", "app/(marketing)/page.tsx", "app/(marketing)/echo/page.tsx", "components/skin-check/SkinCheckDashboard.tsx", "components/mesh", "components/routine", "components/dashboard/FaceDrawing.tsx", "components/skin-check/questionsCopy.ts", "components/skin-check/QuestionsChoice.tsx", "components/skin-check/LaterQuestions.tsx", "components/skin-check/captureStates.ts", "components/skin-check/inputs/ProductNameBox.tsx", "app/(marketing)/questions", "components/skin-check/ProductCards.tsx", "components/products", "app/(marketing)/products"];

function sourceText(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const literals = Array.from(code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)).map((m) => m[1] ?? m[2] ?? m[3]!);
  const jsx = Array.from(code.matchAll(/>([^<]+)</g)).map((m) => m[1]!.replace(/\{[^}]*\}/g, " ").trim()).filter(Boolean);
  return [...literals, ...jsx];
}

export function uiFiles(dirs: string[]): string[] {
  return dirs
    .filter((d) => existsSync(d))
    .flatMap((d) => (d.endsWith(".tsx") || d.endsWith(".ts") ? [d] : readdirSync(d, { recursive: true, encoding: "utf8" }).map((f) => join(d, f))))
    .filter((f) => /\.(ts|tsx)$/.test(f));
}

/** A Tailwind class list, not words a user reads ("animate-in fade-in" is not the banned "fade"). */
const isClassList = (s: string) => /(^|\s)(flex|grid|rounded|text-|bg-|border|px-|py-|inset-|object-|animate-|absolute|relative|h-|w-)/.test(s);

const problems = (text: string) => isClassList(text) ? [] : [
  ...bannedWordsIn(text),
  ...Object.entries({ CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST }).filter(([, re]) => re.test(text)).map(([n]) => n),
];

/** "scan" as a word a user reads; paths, imports and identifiers (scanId) are not on screen. */
export const saysScan = (s: string) => !/^[@./]/.test(s.trim()) && !/[={}()]/.test(s) && /(^|[^\w/-])scans?\b/i.test(s);

describe("redesigned screens: wording (D-12, TD-25 (6))", () => {
  it("self-check: the checks catch planted words", () => {
    expect(problems("your redness improved")).not.toEqual([]);
    expect(problems("absolute inset-0 animate-in fade-in")).toEqual([]);
    expect(problems("Dark marks fade over time")).not.toEqual([]);
    expect(saysScan("Take a new scan")).toBe(true);
    expect(saysScan("Your previous scans")).toBe(true);
    expect(saysScan("/api/skin-scan/upload")).toBe(false);
    expect(saysScan("scanId")).toBe(false);
    expect(saysScan("onScanChange={setScan} scan={scan}")).toBe(false);
  });

  it("every Checks string passes", () => {
    const strings = (v: unknown): string[] =>
      typeof v === "string" ? [v] : typeof v === "function" ? [String(v("3 Oct 2026")), String(v(2))] : v && typeof v === "object" ? Object.values(v).flatMap(strings) : [];
    for (const s of strings(CHECKS_COPY)) {
      expect(problems(s), s).toEqual([]);
      expect(saysScan(s), s).toBe(false);
    }
  });

  it("no string or JSX text in the redesigned files has a banned word or says scan", () => {
    const files = uiFiles(DIRS);
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) {
      for (const s of sourceText(readFileSync(f, "utf8"))) {
        expect(problems(s), `${f}: ${s}`).toEqual([]);
        expect(saysScan(s), `${f}: ${s}`).toBe(false);
      }
    }
  });

  it("TD-25 (6): the restyled Echo and check-flow screens never say scan (their lane wording keeps its own tests)", () => {
    for (const f of uiFiles(["components/skin-check/EchoPage.tsx", "components/skin-check/SkinCheckFlow.tsx", "components/skin-check/SkinCheckDashboard.tsx", "components/mesh", "components/skin-check/inputs/PhotoCapture.tsx"])) {
      // Log lines never reach the screen.
      const shown = readFileSync(f, "utf8").replace(/console\.\w+\([^;]*\);/g, "");
      for (const s of sourceText(shown)) expect(saysScan(s), `${f}: ${s}`).toBe(false);
    }
  });

  it("no redesigned file shows a score, an arrow, a chart or a band colour", () => {
    for (const f of uiFiles(DIRS)) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\/100|toConcern|BAND_STYLE|scorePct|ArrowUp|ArrowDown|Trending|Chart/);
      expect(src, f).not.toMatch(/text-(red|green|emerald|rose|amber)-|confidence-|subscore-/);
    }
  });

  it("TD-25 (3): the results screen follows the dashboard rule: band words only, no score, no Dryness, no band colour", () => {
    for (const f of ["components/skin-check/SkinCheckDashboard.tsx", "components/mesh/FacePhoto.tsx", "components/dashboard/CheckReadings.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\/100|toConcern|BAND_STYLE|scorePct|tabular-nums/);
    }
    const results = readFileSync("components/skin-check/SkinCheckDashboard.tsx", "utf8");
    // TD-39: no chips; the table's columns come from the fixed list (no
    // Dryness in it, TD-40), in a fixed order: never sorted by a band.
    expect(results).not.toMatch(/\.sort\(|role="tab|ANSWER_TOPICS/);
    expect(readFileSync("components/dashboard/CheckReadings.tsx", "utf8")).not.toMatch(/\.sort\(/);
    expect(SHOWN_METRICS).toEqual(["redness", "oiliness", "blemishes", "texture", "pigment"]);
    expect(results).toMatch(/readingsOf\(/);
    expect(results).toMatch(/<CheckReadings view=\{view\} picture=\{<FacePhoto photo=\{scan\.photo\} overlays=\{overlays\} read \/>\} \/>/);
  });

  it("G03 3.9: every page has a designed loading state, an unknown address and a failed page get a designed screen with ways on", () => {
    for (const f of ["app/(marketing)/dashboard/page.tsx", "app/(marketing)/checks/page.tsx", "app/(marketing)/checks/[scanId]/page.tsx", "app/(marketing)/echo/page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/fallback=\{\s*<main[\s\S]*<LoadingState/);
    }
    for (const f of ["app/not-found.tsx", "app/(marketing)/error.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(src, f).toMatch(/href="\/dashboard"/);
    }
    expect(readFileSync("app/(marketing)/error.tsx", "utf8")).toMatch(/role="alert"[\s\S]*onClick=\{reset\}/);
  });

  it("D-12: on Home the routine card is never beside the readings, and the timeline carries no photos", () => {
    // TD-47: no grid row holds both the readings and the routine (desktop areas in app/globals.css); on phones
    // they are separate cards in one column. The routine card itself shows no reading or photo.
    const css = readFileSync("app/globals.css", "utf8");
    const rows = Array.from(css.slice(css.indexOf("grid-template-areas:"), css.indexOf(";", css.indexOf("grid-template-areas:"))).matchAll(/"([a-z ]+)"/g)).map((m) => m[1]!);
    expect(rows.length).toBe(5);
    for (const row of rows) expect(row.includes("latest") && row.includes("routine"), row).toBe(false);
    expect(rows.findIndex((r) => r.includes("routine"))).toBeGreaterThan(rows.findIndex((r) => r.includes("latest")));
    const home = readFileSync("components/dashboard/DashboardPage.tsx", "utf8");
    expect(home).toMatch(/<Area name="routine">\s*<RoutineCard/);
    expect(home).not.toMatch(/\border-\d/);
    const cards = readFileSync("components/dashboard/HomeCards.tsx", "utf8");
    const routineCard = cards.slice(cards.indexOf("export function RoutineCard("), cards.indexOf("// ─── Weather and air today"));
    expect(routineCard).not.toMatch(/bands|<Thumb|<FaceDrawing|band\b/);
    const checks = readFileSync("components/checks/ChecksView.tsx", "utf8");
    const timeline = checks.slice(checks.indexOf("function TimelineSection("));
    expect(timeline).not.toMatch(/<Thumb|thumb=/);
  });

  it("TD-24 (1): the opened check always shows the fixed line", () => {
    const src = readFileSync("components/checks/ChecksView.tsx", "utf8");
    const detail = src.slice(src.indexOf("function CheckDetail("), src.indexOf("function TimelineSection("));
    expect(detail).toContain("{C.history.pastLine}");
    // Shown whenever the opened check has readings, never behind a toggle; a
    // check with no photo reading has no photos to compare, so no line.
    expect(detail).toMatch(/\{check\.view \? \(\s*<>\s*\{\/\*[^*]*\*\/\}\s*<p[^>]*>\{C\.history\.pastLine\}/);
    expect(detail).not.toMatch(/useState|<details|aria-expanded/);
  });
});

// G23: the check flow shows only the last 4 digits of the phone number, as the account button does.
describe("G23: phone number on the check flow", () => {
  it("never renders the full number", () => {
    const src = readFileSync("components/skin-check/inputs/PhoneAuthStep.tsx", "utf8");
    expect(src).not.toMatch(/\{activeUser\.phoneNumber\}/);
    expect(src).toMatch(/phone ending <span[^>]*>\{activeUser\.phoneNumber\?\.slice\(-4\)\}<\/span>/);
  });
});
