import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Owner 2026-10-14 (redesign Phase 1 review): a normal browser-test run must
// never rewrite the committed design baselines in docs/. Every screenshot path
// under docs/ in tests/browser/ sits behind the AFTER_SHOTS opt-in, on the
// same line, e.g. `process.env.AFTER_SHOTS ? "docs/design/x" : ".local-stack/..."`.
describe("browser screenshots into docs/ are opt-in", () => {
  const files = readdirSync("tests/browser").filter((f) => f.endsWith(".ts"));
  it("finds the browser specs", () => expect(files.length).toBeGreaterThan(5));
  for (const f of files) {
    it(f, () => {
      const bad = readFileSync(`tests/browser/${f}`, "utf8")
        .split("\n")
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => !line.trim().startsWith("//") && !line.trim().startsWith("*") && /["'`]docs\//.test(line) && !line.includes("AFTER_SHOTS"));
      expect(bad.map(({ n, line }) => `${n}: ${line.trim()}`)).toEqual([]);
    });
  }
});
