import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NOISE_TABLE } from "@/lib/longitudinal/settings";

// Only tests may hand the engine a table (design §4, longitudinal-guard).
// Production code calls longitudinalResult with three arguments, so the empty
// NOISE_TABLE and COMPARABLE_QUANTITIES always apply. tests/comparability.test.ts
// already guards compareStates and compareKeys.
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
const SOURCES = ["app", "components", "hooks", "lib", "scripts", "types"].flatMap(walk);

/** Top-level argument count of each call to `name` in `src`. */
function argCounts(src: string, name: string): number[] {
  const out: number[] = [];
  const re = new RegExp(`\\b${name}\\s*\\(`, "g");
  for (let m = re.exec(src); m; m = re.exec(src)) {
    let depth = 1, args = 1, i = m.index + m[0].length, empty = true;
    for (; i < src.length && depth; i++) {
      const c = src[i]!;
      if ("([{".includes(c)) depth++;
      else if (")]}".includes(c)) depth--;
      else if (c === "," && depth === 1) args++;
      if (depth && !/\s/.test(c)) empty = false;
    }
    out.push(empty ? 0 : args);
  }
  return out;
}

describe("longitudinal tables are test-only", () => {
  it("the production noise table is empty and frozen", () => {
    expect(NOISE_TABLE).toEqual([]);
    expect(Object.isFrozen(NOISE_TABLE)).toBe(true);
  });

  it("no file outside tests/ calls longitudinalResult with a table argument", () => {
    const offenders = SOURCES.filter((f) => f !== join("lib", "longitudinal", "engine.ts"))
      .flatMap((f) => argCounts(readFileSync(f, "utf8"), "longitudinalResult").filter((n) => n > 3).map(() => f));
    expect(offenders).toEqual([]);
  });

  it("no file outside tests/ and the shared shape writes a noise-table row", () => {
    const rows = SOURCES.filter((f) => !f.startsWith(join("lib", "contracts")) && /mdc95ByToneBand\s*:/.test(readFileSync(f, "utf8")));
    expect(rows).toEqual([]);
  });

  // TD-54: the readings series (lib/readings/series.ts) is the second allowed caller, under the same checks.
  const CALLERS = [join("lib", "context", "chat.ts"), join("lib", "readings", "series.ts")];

  it("the only files outside lib/longitudinal that import the engine are the context chat path and the readings series (closes alias, spread and .call bypasses)", () => {
    const importers = SOURCES.filter((f) => !f.startsWith(join("lib", "longitudinal")) && /longitudinal\/engine/.test(readFileSync(f, "utf8")));
    expect(importers.sort()).toEqual([...CALLERS].sort());
  });

  for (const file of CALLERS) {
    it(`${file} calls the engine only with three arguments, and never re-exports or aliases it`, () => {
      const src = readFileSync(file, "utf8");
      expect(argCounts(src, "longitudinalResult")).toEqual([3]);
      expect(src).toContain('import { longitudinalResult } from "@/lib/longitudinal/engine";');
      // Any other mention (an alias, a spread, a .call, an export) would let a table slip past the count above.
      expect(src.match(/longitudinalResult/g)).toHaveLength(2);
    });
  }

  it("the argument counter sees a fourth argument (positive control)", () => {
    expect(argCounts("longitudinalResult(s, q, r, { noise: [a, b] })", "longitudinalResult")).toEqual([4]);
    expect(argCounts("longitudinalResult(s, f(q, x), r)", "longitudinalResult")).toEqual([3]);
  });
});
