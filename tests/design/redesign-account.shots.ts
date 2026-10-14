import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { signIn } from "../browser/helpers";
import { ACCOUNT_COPY as A } from "@/app/(marketing)/account/copy";

// Lane E (redesign 20, 21, 22) review screenshots at 375px into docs/design/redesign/account/:
//   PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-account.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser
// With the G31/H36/H37 flags on (the same command with NEXT_PUBLIC_UI_NOTIFICATION_TYPES=on
// NEXT_PUBLIC_UI_CONSENTS=on NEXT_PUBLIC_UI_DATA_EXPORT=on) the shots get a "-flags" suffix,
// and the run fails if the flagged rows are not on screen. Nothing is clicked that saves.
const DIR = "docs/design/redesign/account";
mkdirSync(DIR, { recursive: true });
const FLAGS = process.env.NEXT_PUBLIC_UI_CONSENTS === "on";
const sfx = FLAGS ? "-flags" : "";

test.use({ viewport: { width: 375, height: 812 } });

const save = async (page: Page, name: string) => {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}${sfx}.png`, fullPage: true });
};

test("account screens", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, U.homeDue!.phoneNumber);
  await page.goto("/account");
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  await save(page, "21-profile");
  await page.getByRole("link", { name: A.tabs.skin, exact: true }).click();
  await expect(page.getByRole("heading", { name: A.skinTitle })).toBeVisible();
  await save(page, "21-skin");
  await page.getByRole("link", { name: A.tabs.privacy, exact: true }).click();
  await expect(page.getByRole("heading", { name: A.deleteTitle })).toBeVisible();
  if (FLAGS) await expect(page.getByText(A.privacy.exportRow)).toBeVisible();
  await save(page, "22-privacy");
  await page.goto("/account?tab=notifications");
  await expect(page.getByRole("heading", { level: 1, name: A.notifications.title })).toBeVisible();
  if (FLAGS) await expect(page.getByText(A.notifications.later).first()).toBeVisible();
  await save(page, "20-notifications");
});
