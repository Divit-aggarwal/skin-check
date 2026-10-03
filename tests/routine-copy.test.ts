import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { CATALOGUE, PRODUCT_NAME_EXCEPTIONS } from "@/lib/catalog/catalogue";
import { bannedWordsIn, nameIsExcepted } from "@/lib/catalog/wording";

// D-12: no routine wording links a product to a skin change (R-4 A).

function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") return [v("2026-10-03"), v({ used: 1, skipped: 2, unknown: 3 })].flatMap(strings);
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

function filesUnder(...dirs: string[]): string[] {
  return dirs
    .filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d, { recursive: true, encoding: "utf8" }).map((f) => join(d, f)))
    .filter((f) => /\.(ts|tsx)$/.test(f));
}

/** String literals and JSX text in a source file, comments removed. */
function sourceText(src: string): string[] {
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const literals = Array.from(code.matchAll(/"([^"\n]*)"|'([^'\n]*)'|`([^`]*)`/g)).map((m) => m[1] ?? m[2] ?? m[3]!);
  const jsx = Array.from(code.matchAll(/>([^<>{}]+)</g)).map((m) => m[1]!.trim()).filter(Boolean);
  return [...literals, ...jsx];
}

const UI_DIRS = ["components/routine", "app/(marketing)/routine"];
const ROUTINE_DIRS = ["lib/routine", "lib/catalog", "app/api/routine", ...UI_DIRS];

describe("routine copy (D-12)", () => {
  it("self-check: a planted causal string is caught", () => {
    expect(bannedWordsIn("your skin improved")).toContain("improve*");
    expect(bannedWordsIn("Since you started, redness went down")).toEqual(expect.arrayContaining(["since you started", "went down"]));
    expect(bannedWordsIn("use before moisturiser")).toEqual([]);
    expect(bannedWordsIn("Since 2026-10-03")).toEqual([]);
    expect(bannedWordsIn("lowercase")).toEqual([]);
  });

  it("no string in lib/routine/copy.ts has a banned word", () => {
    const all = strings(ROUTINE_COPY);
    expect(all.length).toBeGreaterThan(10);
    for (const s of all) expect(bannedWordsIn(s), s).toEqual([]);
  });

  it("no string or JSX text in the routine UI has a banned word", () => {
    for (const f of filesUnder(...UI_DIRS)) {
      for (const s of sourceText(readFileSync(f, "utf8"))) expect(bannedWordsIn(s), `${f}: ${s}`).toEqual([]);
    }
  });

  it("catalogue name (except owner exceptions) and usage text pass", () => {
    for (const p of CATALOGUE.products) {
      if (!nameIsExcepted(p, PRODUCT_NAME_EXCEPTIONS)) expect(bannedWordsIn(p.name), p.name).toEqual([]);
      expect(bannedWordsIn(p.usageText), p.usageText).toEqual([]);
    }
  });
});

describe("routine import boundaries", () => {
  const files = filesUnder(...ROUTINE_DIRS);

  it("finds the routine files", () => expect(files.length).toBeGreaterThan(3));

  it("no routine file imports gemini, echo, skin-check-rules, skin-state or touches scanAnalyses", () => {
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      expect(src, f).not.toMatch(/from\s+["'][^"']*(gemini|echo|skin-check-rules|skin-state)[^"']*["']/i);
      expect(src, f).not.toMatch(/import\(\s*["'][^"']*(gemini|echo|skin-check-rules|skin-state)/i);
      expect(src, f).not.toContain("scanAnalyses");
    }
  });

  it("no routine UI file references claims", () => {
    for (const f of filesUnder(...UI_DIRS)) expect(readFileSync(f, "utf8"), f).not.toMatch(/\bclaims\b/);
  });
});
