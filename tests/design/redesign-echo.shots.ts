import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { P_SEED } from "../browser/seed-products";
import { signIn } from "../browser/helpers";
import { ECHO_COPY as E } from "@/components/skin-check/echoCopy";
import { AI_SHARE_CONSENT_COPY } from "@/lib/consent";
import { COPY } from "@/lib/rules/settings";

// Redesign lane D (Echo, mockups 18 and 19) at 375px into docs/design/redesign/echo/.
//   PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-echo.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser
const DIR = "docs/design/redesign/echo";
mkdirSync(DIR, { recursive: true });
const OPENING = "Here is a simple routine from Project Skin's products.";

test.use({ viewport: { width: 375, height: 812 } });

/** The screen as a phone shows it (the chat scrolls inside a fixed column), and the whole scroller. */
const save = async (page: Page, name: string, scroll: "top" | "bottom" = "top") => {
  await page.waitForTimeout(700);
  await page.evaluate((s) => {
    const el = document.querySelector('[role="log"]')?.parentElement;
    el?.scrollTo({ top: s === "top" ? 0 : el.scrollHeight, behavior: "instant" as ScrollBehavior });
  }, scroll);
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${DIR}/${name}.png` });
};

test("18 Echo home: introduction, area chooser, opening, starters", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, P_SEED.plain["390"].phoneNumber);
  await page.goto("/echo");
  await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
  await save(page, "18-echo-home");
  await save(page, "18-echo-home-opening", "bottom");
});

test("19 Echo conversation: a typed question and a starter, with cards", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, P_SEED.ask.phoneNumber);
  await page.goto("/echo");
  await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("textbox").fill("What does my redness reading mean?");
  await page.getByRole("button", { name: E.send }).click();
  await expect(page.getByRole("log").getByRole("status")).toHaveCount(0, { timeout: 60_000 });
  await page.getByRole("textbox").fill("Which products should I use?");
  await page.getByRole("button", { name: E.send }).click();
  await expect(page.getByRole("region", { name: E.productsLabel })).toHaveCount(2, { timeout: 60_000 });
  // The second question at the top of the screen, its answer under it (as mockup 19 reads).
  await page.getByRole("log").getByText("Which products should I use?", { exact: true }).evaluate((el) => {
    const box = document.querySelector('[role="log"]')!.parentElement!;
    box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/19-echo-conversation.png` });
  await save(page, "19-echo-conversation-end", "bottom");
  // Another area is its own thread: back to the introduction.
  await page.getByRole("button", { name: "Cheeks" }).click();
  await save(page, "19-echo-other-area");
});

test("state: red flag note", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, P_SEED.redFlag.phoneNumber);
  await page.goto("/echo");
  await expect(page.getByRole("note").getByText(COPY.referral)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("note").getByText(COPY.referral).scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/echo-red-flag.png` });
});

test("states: consent, then desktop", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, P_SEED.consent.phoneNumber);
  await page.goto("/echo");
  await expect(page.getByText(AI_SHARE_CONSENT_COPY)).toBeVisible({ timeout: 60_000 });
  await save(page, "echo-consent", "bottom");

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/echo");
  await expect(page.getByText(AI_SHARE_CONSENT_COPY)).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${DIR}/echo-desktop-1280.png` });
});

test("state: no photo reading", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, U.noreading!.phoneNumber);
  await page.goto("/echo");
  await expect(page.getByText(E.newCheck)).toBeVisible({ timeout: 60_000 });
  await save(page, "echo-no-reading");
});
