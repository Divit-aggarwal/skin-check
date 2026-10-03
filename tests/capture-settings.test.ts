import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CAPTURE_QUALITY_SETTINGS, CAPTURE_QUALITY_SETTINGS_VERSION } from "@/lib/capture-quality/settings";

// Every threshold is named, provisional and sourced (design §2.2).
describe("capture quality settings", () => {
  it("are all provisional with a source, and keyed by their own id", () => {
    for (const [key, setting] of Object.entries(CAPTURE_QUALITY_SETTINGS)) {
      expect(setting.id).toBe(key);
      expect(setting.status).toBe("provisional");
      expect(setting.source.trim().length).toBeGreaterThan(0);
      expect(setting.unit.trim().length).toBeGreaterThan(0);
      expect(Number.isFinite(setting.value)).toBe(true);
    }
    expect(CAPTURE_QUALITY_SETTINGS_VERSION).toMatch(/provisional/);
  });

  // The checks read thresholds from settings only; luma.ts holds the named BT.601 weights.
  const CHECK_FILES: string[] = ["lib/capture-quality/exposure.ts", "lib/capture-quality/blur.ts", "lib/capture-quality/resolution.ts"];
  it.skipIf(CHECK_FILES.length === 0).each(CHECK_FILES)("%s has no numeric literal beyond 0-4 and 255", (file) => {
    const code = readFileSync(file, "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "")
      .replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
    const literals = code.match(/(?<![\w.])\d+(?:\.\d+)?(?:e-?\d+)?(?![\w.])/g) ?? [];
    expect(literals.filter((n) => !["0", "1", "2", "3", "4", "255"].includes(n))).toEqual([]);
  });
});
