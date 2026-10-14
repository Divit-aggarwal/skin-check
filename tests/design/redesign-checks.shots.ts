import { mkdirSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { signIn } from "../browser/helpers";
import { MESH_SEED } from "../browser/seed-mesh";

// Lane redesign-checks (TD-50 screens 09–13) at 375px, into
// docs/design/redesign/checks/. Run through the slot wrapper:
//   PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-checks.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser
const DIR = "docs/design/redesign/checks";
mkdirSync(DIR, { recursive: true });

test.use({ viewport: { width: 375, height: 812 } });

const save = async (page: Page, name: string) => {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(600); // entrance animations
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
};

test("checks views (10, 11, 12, 09 newest)", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, U.homeDue!.phoneNumber);
  for (const [path, name] of [
    ["/checks", "10-checks-overview"],
    ["/checks?view=readings", "12-readings"],
    ["/checks?reading=redness", "11-reading"],
    ["/checks/seed-home-due-2", "09-opened-check"],
  ] as const) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).waitFor({ state: "attached" });
    await save(page, name);
  }
});

test("photos and an opened check with its kept photo (12, 09)", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, MESH_SEED.kept.phoneNumber); // a real face, so the mesh draws
  await page.goto("/checks?view=photos");
  await page.getByRole("img", { name: /Your kept photo from/ }).waitFor({ timeout: 60_000 });
  await save(page, "12-photos");
  await page.goto(`/checks/${MESH_SEED.kept.uid}-1`);
  await page.getByTestId("face-photo").waitFor({ timeout: 90_000 });
  await save(page, "09-opened-check-photo");
});

test("timeline (13)", async ({ page }) => {
  await signIn(page, "+919999900001"); // base seed user: checks and routine events
  await page.goto("/checks?view=timeline");
  await page.getByRole("region", { name: "Timeline" }).waitFor();
  await save(page, "13-timeline");
});
