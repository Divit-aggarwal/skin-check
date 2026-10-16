import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { P_SEED } from "../browser/seed-products";
import { signIn } from "../browser/helpers";
import { matchShot } from "./match";
import { HOME_COPY as H } from "@/components/dashboard/homeCopy";
import { ECHO_COPY as E } from "@/components/skin-check/echoCopy";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";

// Mockup match (G37), lane D: 01 Today, 02 Environment, 03 Today's routine,
// 18 Echo home, 19 Echo conversation, at 393 (overlaid) and 320, 375, 430.
//   PW_ARGS="-c tests/design/match.config.ts tests/design/d.match.ts" bash scripts/with-stack-slot.sh npm run test:browser
test.use({ timezoneId: "Asia/Kolkata", locale: "en-IN" });
const OPENING = "Here is a simple routine from Project Skin's products.";

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined); // Home and Echo keep polling
  await page.waitForTimeout(600); // entrance animations
};

test("01 Today, 02 Environment, 03 routine", async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page, U.homeDue!.phoneNumber);
  await page.goto("/dashboard");
  await expect(page.getByRole("img", { name: /routine steps done today/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^UV \d+, / })).toBeVisible();
  await settle(page);
  await matchShot(page, info, "01-today");

  await page.getByRole("button", { name: /^UV \d+, / }).click();
  const sheet = page.getByRole("dialog", { name: H.today.weatherSheet });
  await expect(sheet.getByText("68%")).toBeVisible();
  await settle(page);
  await matchShot(page, info, "02-environment");

  await page.goto("/routine");
  await page.getByRole("radio", { name: R.slot.AM }).click();
  await settle(page);
  await matchShot(page, info, "03-todays-routine");
});

test("18 Echo home", async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page, P_SEED.plain["390"].phoneNumber);
  await page.goto("/echo");
  await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
  await page.evaluate(() => document.querySelector('[role="log"]')?.parentElement?.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior }));
  await settle(page);
  await matchShot(page, info, "18-echo-home");
});

test("19 Echo conversation", async ({ page }, info) => {
  test.setTimeout(240_000);
  await signIn(page, P_SEED.ask.phoneNumber);
  await page.goto("/echo");
  await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
  const q = "Which products should I use?";
  await page.getByRole("textbox").fill(q);
  await page.getByRole("button", { name: E.send }).click();
  await expect(page.getByRole("log").getByRole("status")).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("region", { name: E.productsLabel }).last()).toBeVisible({ timeout: 60_000 });
  // The question at the top of the chat, its answer under it (as mockup 19 reads).
  await page.getByRole("log").getByText(q, { exact: true }).last().evaluate((el) => {
    const box = document.querySelector('[role="log"]')!.parentElement!;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  });
  await settle(page);
  await matchShot(page, info, "19-echo-conversation");
});
