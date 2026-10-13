import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { signIn } from "../browser/helpers";

// Redesign review screenshots (TD-50) at 375px, one per page, into
// docs/design/redesign/<SHOTS>/. Against a running stack (`npm run dev:local`):
//   SHOTS=phase1 npx playwright test -c tests/design/playwright.config.ts tests/design/redesign.shots.ts --project=390
const DIR = `docs/design/redesign/${process.env.SHOTS ?? "latest"}`;
mkdirSync(DIR, { recursive: true });

test.use({ viewport: { width: 375, height: 812 } });

const save = async (page: import("@playwright/test").Page, name: string) => {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined); // Home and Echo keep polling
  await page.waitForTimeout(600); // entrance animations
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
};

test("kit (dev only)", async ({ page }) => {
  await page.goto("/dev/design");
  await save(page, "00-kit");
});

test("signed-in pages", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, U.homeDue!.phoneNumber);
  for (const [path, name] of [["/dashboard", "01-today"], ["/routine", "03-routine"], ["/checks", "13-checks"], ["/echo", "18-echo"], ["/account", "21-account"]] as const) {
    await page.goto(path);
    await save(page, name);
  }
});
