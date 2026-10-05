import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { CHECKS_COPY } from "@/components/checks/copy";
import { bannedWordsIn } from "@/lib/catalog/wording";
import { CAUSE, CHANGE, DIAGNOSIS, FORECAST, MEDICAL } from "@/lib/context/lexicon";

// G03: the redesigned screens outside components/dashboard (which
// tests/dashboard-copy.test.ts covers) pass the same D-12 checks, and TD-25 (6):
// the word "check" on screen, never "scan".

const DIRS = ["components/checks", "components/timeline", "components/shell", "components/ui/page.tsx", "app/(marketing)/checks"];

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

const problems = (text: string) => [
  ...bannedWordsIn(text),
  ...Object.entries({ CHANGE, MEDICAL, DIAGNOSIS, CAUSE, FORECAST }).filter(([, re]) => re.test(text)).map(([n]) => n),
];

/** "scan" as a word a user reads; paths, imports and identifiers (scanId) are not on screen. */
export const saysScan = (s: string) => !/^[@./]/.test(s.trim()) && /(^|[^\w/-])scans?\b/i.test(s);

describe("redesigned screens: wording (D-12, TD-25 (6))", () => {
  it("self-check: the checks catch planted words", () => {
    expect(problems("your redness improved")).not.toEqual([]);
    expect(saysScan("Take a new scan")).toBe(true);
    expect(saysScan("Your previous scans")).toBe(true);
    expect(saysScan("/api/skin-scan/upload")).toBe(false);
    expect(saysScan("scanId")).toBe(false);
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

  it("no redesigned file shows a score, an arrow, a chart or a band colour", () => {
    for (const f of uiFiles(DIRS)) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/\/100|toConcern|BAND_STYLE|scorePct|ArrowUp|ArrowDown|Trending|Chart/);
      expect(src, f).not.toMatch(/text-(red|green|emerald|rose|amber)-|confidence-|subscore-/);
    }
  });

  it("TD-24 (1): the opened check always shows the fixed line", () => {
    const src = readFileSync("components/checks/ChecksView.tsx", "utf8");
    const detail = src.slice(src.indexOf("function CheckDetail("), src.indexOf("function TimelineSection("));
    expect(detail).toContain("{C.history.pastLine}");
    // Not behind a condition: the line sits directly in the opened check's section.
    expect(detail).not.toMatch(/&&\s*<p[^>]*>\{C\.history\.pastLine\}/);
  });
});
