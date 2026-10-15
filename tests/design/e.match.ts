import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { signIn } from "../browser/helpers";
import { matchShot } from "./match";
import { ACCOUNT_COPY as A } from "@/app/(marketing)/account/copy";
import { consentsFixture, notificationPrefsFixture } from "@/lib/feature-contracts/fixtures";
import { CONSENT_TEXTS } from "@/lib/feature-contracts/consents";

// G37 lane E: mockup-match shots of 20, 21, 22 (tests/design/match.ts), and with the
// flags on, that the flagged controls render. The G31/H36 routes are built by BE1 in
// parallel, so they are answered here from lib/feature-contracts/fixtures.ts. Nothing
// is clicked that saves. Flags on:
//   NEXT_PUBLIC_UI_NOTIFICATION_TYPES=on NEXT_PUBLIC_UI_CONSENTS=on NEXT_PUBLIC_UI_DATA_EXPORT=on \
//   PW_ARGS="-c tests/design/match.config.ts tests/design/e.match.ts" bash scripts/with-stack-slot.sh npm run test:browser
const FLAGS = process.env.NEXT_PUBLIC_UI_CONSENTS === "on";

async function routes(page: Page) {
  await page.route("**/api/account/notifications", (r) => r.fulfill({ json: notificationPrefsFixture }));
  await page.route("**/api/account/consents", (r) => r.fulfill({ json: { consents: consentsFixture } }));
}

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(400);
};

test("account screens 20, 21, 22", async ({ page }, info) => {
  test.setTimeout(180_000);
  await routes(page);
  await signIn(page, U.homeDue!.phoneNumber);

  await page.goto("/account");
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  await expect(page.getByRole("heading", { name: A.skinTitle })).toBeVisible();
  await expect(page.getByText(A.profile.phoneEnding(U.homeDue!.phoneNumber.slice(-4)), { exact: true })).toBeVisible();
  await expect(page.getByRole("status", { name: A.profile.loading })).toHaveCount(0, { timeout: 20_000 });
  await settle(page);
  await matchShot(page, info, "21-profile");

  await page.goto("/account?tab=notifications");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (FLAGS) {
    await expect(page.getByRole("switch", { name: A.notify.types.weekly_checkin.label })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: A.notify.types.routine_evening.label })).toHaveAttribute("aria-disabled", "true");
    await expect(page.getByText(A.notify.everyDay("Sunday"))).toBeVisible();
  }
  await settle(page);
  await matchShot(page, info, "20-notifications");

  await page.goto("/account?tab=privacy");
  await expect(page.getByRole("heading", { name: A.deleteTitle })).toBeVisible();
  if (FLAGS) {
    await expect(page.getByRole("switch", { name: CONSENT_TEXTS.personalisation.title })).toHaveAttribute("aria-checked", "true");
    await expect(page.getByRole("switch", { name: CONSENT_TEXTS.research.title })).toHaveAttribute("aria-checked", "false");
    await expect(page.getByText(A.privacy.exportRow)).toBeVisible();
  }
  await settle(page);
  await matchShot(page, info, "22-privacy");
});
