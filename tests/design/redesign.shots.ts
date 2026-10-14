import { mkdirSync } from "node:fs";
import { test } from "@playwright/test";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { signIn } from "../browser/helpers";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";

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

// Phase 2: Today, Environment (the conditions sheet), Routine, guided step, Routine Complete.
test("phase 2 screens", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, U.homeDue!.phoneNumber);
  await save(page, "p2-01-today");
  await page.getByRole("button", { name: /UV/ }).first().click();
  await page.getByRole("dialog").waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/p2-02-environment.png` });
  await page.goto("/routine");
  await page.getByRole("radio", { name: R.slot.AM }).click();
  await save(page, "p2-03-routine");
  await page.getByRole("button", { name: R.start }).click();
  await save(page, "p2-03-routine-guided");
});

test("phase 2 routine complete", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, U.homeRoutine!.phoneNumber);
  await page.goto("/routine");
  await page.getByRole("radio", { name: R.slot.AM }).click();
  await page.getByRole("button", { name: R.start }).click();
  for (let i = 0; i < 6 && !(await page.getByText(R.logged.AM).isVisible()); i++) {
    await page.getByRole("button", { name: new RegExp(`^${R.status.used}`) }).first().click();
    await page.waitForTimeout(800);
  }
  await save(page, "p2-04-routine-complete");
});

