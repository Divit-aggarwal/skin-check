import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// D-09: image readings are not an input. R-1 A: the routine record is not an
// input. No lane imports another lane's code. Rules are deterministic.
const DIR = join(__dirname, "..", "lib", "rules");
const FILES = readdirSync(DIR).filter((f) => f.endsWith(".ts"));
const source = (f: string) => readFileSync(join(DIR, f), "utf8");
const imports = (f: string) => Array.from(source(f).matchAll(/from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']/g), (m) => m[1] ?? m[2]!);

const ALLOWED = new Set([
  "node:crypto",
  "@/lib/skin-check-steps",
  "@/lib/skin-check-validation",
  "@/lib/catalog/schema",
  "@/lib/contracts/recommendation-result",
  "@/lib/contracts/safety-state",
]);

describe("lib/rules import boundary", () => {
  it("has the four files of the design", () => {
    expect(FILES.sort()).toEqual(["input.ts", "recommend.ts", "safety.ts", "settings.ts"]);
  });

  it.each(FILES)("%s imports only allowed modules (no image bands, scans, routine, Gemini or other lanes)", (f) => {
    for (const spec of imports(f)) {
      expect(spec.startsWith("./") || ALLOWED.has(spec), `${f} imports ${spec}`).toBe(true);
    }
  });

  it("the allow list itself carries no image, scan or routine module", () => {
    for (const spec of Array.from(ALLOWED)) expect(spec).not.toMatch(/skin-check-rules|skin-check-skus|skin-state|comparability|scan|routine|gemini|echo/);
  });

  it.each(FILES)("%s has no clock or randomness", (f) => {
    expect(source(f)).not.toMatch(/\bDate\b|Math\.random|crypto\.random|performance\.now/);
  });

  it.each(FILES.filter((f) => f !== "settings.ts"))("%s does not read the environment", (f) => {
    expect(source(f)).not.toMatch(/process\.env/);
  });
});
