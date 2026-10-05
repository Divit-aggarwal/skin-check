import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The two preview directions (G03 step 2.6), into docs/design/options/.
//   npx playwright test -c tests/design/playwright.config.ts tests/design/options.shots.ts
const DIR = "docs/design/options";
mkdirSync(DIR, { recursive: true });
const ROUTES = [
  ["home", ""],
  ["home-building", "?state=building"],
  ["home-empty", "?state=empty"],
  ["home-loading", "?state=loading"],
  ["home-error", "?state=error"],
  ["checks", "/checks"],
  ["timeline", "/checks?view=timeline"],
  ["check-opened", "/checks/preview-5"],
  ["check-questions-only", "/checks/preview-4"],
  ["echo", "/echo"],
] as const;

for (const dir of ["a", "b"]) {
  for (const [name, path] of ROUTES) {
    test(`${dir} ${name}`, async ({ page }) => {
      await page.goto(`/preview/${dir}${path}`);
      await expect(page.locator("h1").first()).toBeVisible({ timeout: 90_000 });
      await page.waitForTimeout(800);
      const base = `${DIR}/${dir}-${name}-${test.info().project.name}`;
      await page.screenshot({ path: `${base}.png`, fullPage: true });
      await page.screenshot({ path: `${base}-screen.png` }); // first screen, as the user sees it
    });
  }
}
