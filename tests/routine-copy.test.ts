import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROUTINE_COPY } from "@/lib/routine/copy";
import { ROUTINE_PURPOSE_COPY } from "@/lib/consent";
import { CATALOGUE, PRODUCT_NAME_EXCEPTIONS } from "@/lib/catalog/catalogue";
import { bannedWordsIn, nameIsExcepted, stepLabelIsExcepted } from "@/lib/catalog/wording";

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
  // Text between tags, with {expressions} blanked, so "Results {n}" is still seen.
  const jsx = Array.from(code.matchAll(/>([^<]+)</g))
    .map((m) => m[1]!.replace(/\{[^}]*\}/g, " ").trim())
    .filter(Boolean);
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
    const planted = sourceText("<p>Results {n}</p><span>{x} improved</span>");
    expect(planted.flatMap(bannedWordsIn)).toEqual(expect.arrayContaining(["results", "improve*"]));
  });

  it("the purpose comes from lib/consent.ts and passes the word check", () => {
    expect(ROUTINE_COPY.purpose).toBe(ROUTINE_PURPOSE_COPY);
    expect(bannedWordsIn(ROUTINE_PURPOSE_COPY)).toEqual([]);
    expect(readFileSync("lib/routine/copy.ts", "utf8")).not.toContain("So you can keep a record");
  });

  it("no string in lib/routine/copy.ts has a banned word", () => {
    const all = strings(ROUTINE_COPY);
    expect(all.length).toBeGreaterThan(10);
    for (const s of all) if (!stepLabelIsExcepted(s)) expect(bannedWordsIn(s), s).toEqual([]);
  });

  it("TD-26 (1): 'Treat' is allowed as the exact step label only", () => {
    expect(ROUTINE_COPY.steps.serum).toBe("Treat");
    expect(stepLabelIsExcepted("Treat")).toBe(true);
    for (const s of ["treat", "Treat your skin", "Treatment", "Treat "]) expect(stepLabelIsExcepted(s), s).toBe(false);
    // The exception is used for the step label and nothing else in the copy.
    expect(strings(ROUTINE_COPY).filter(stepLabelIsExcepted)).toEqual(["Treat"]);
  });

  it("TD-26 (1): strings built with the step label have no other banned word", () => {
    const label = ROUTINE_COPY.steps.serum;
    const built = [
      ROUTINE_COPY.addToStepLabel(label, "morning"),
      ROUTINE_COPY.addFor(label),
      ROUTINE_COPY.stepOf(label),
      `${label} · ${ROUTINE_COPY.slot.AM} · Mon, Tue · ${ROUTINE_COPY.since("6 Oct 2026")}`,
    ];
    for (const s of built) {
      expect(s, s).toContain(label);
      expect(bannedWordsIn(s.replaceAll(label, "")), s).toEqual([]);
    }
  });

  it("no string or JSX text in the routine UI has a banned word", () => {
    const files = filesUnder(...UI_DIRS);
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) {
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
    const files = filesUnder(...UI_DIRS);
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const f of files) expect(readFileSync(f, "utf8"), f).not.toMatch(/\bclaims\b/);
  });

  it("the page sets its own description, so the root one (which links routine to results) is not inherited", () => {
    const src = readFileSync("app/(marketing)/routine/page.tsx", "utf8");
    expect(src).toMatch(/\bdescription:\s*C\.purpose/);
    expect(src).toMatch(/openGraph:\s*\{[^}]*description:\s*C\.purpose/);
  });
});
