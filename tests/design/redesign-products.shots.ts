import { mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { P_SEED } from "../browser/seed-products";
import { signIn } from "../browser/helpers";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { ECHO_COPY as E } from "@/components/skin-check/echoCopy";
import { PRODUCTS_COPY as P } from "@/components/products/copy";

// Redesign lane C review screenshots at 375px (screens 06, 14, 15) into
// docs/design/redesign/products/: "<nn>-<name>.png" is the full page,
// "<nn>-<name>-view.png" the first screen of the part the mockup shows
// (used for compare-<nn>-<name>.png next to the mockup).
//   PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-products.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser
const DIR = "docs/design/redesign/products";
mkdirSync(DIR, { recursive: true });

test.use({ viewport: { width: 375, height: 812 } });

const save = async (page: Page, name: string) => {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
};
const view = async (page: Page, name: string) => page.screenshot({ path: `${DIR}/${name}-view.png` });

test("06 routine set-up", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, U.homeDue!.phoneNumber);
  await page.goto("/routine");
  await page.getByRole("radio", { name: R.slot.AM }).click();
  await save(page, "06-routine-setup");
  await page.getByRole("heading", { name: R.yourProducts }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await view(page, "06-routine-setup");
  await page.getByRole("heading", { name: R.add }).evaluate((el) => el.scrollIntoView({ block: "start" }));
  await view(page, "06-routine-add");
});

test("14 Echo product cards", async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page, P_SEED.plain["390"].phoneNumber);
  await page.goto("/echo");
  const cards = page.getByRole("region", { name: E.productsLabel });
  await expect(cards.getByRole("listitem")).toHaveCount(4, { timeout: 60_000 });
  await save(page, "14-product-cards");
  await cards.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await view(page, "14-product-cards");
});

test("15 product page", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, U.homeDue!.phoneNumber);
  await page.goto("/products/niacinamide-serum");
  await expect(page.getByRole("link", { name: new RegExp(P.onStore) })).toBeVisible();
  await save(page, "15-product-detail");
  await view(page, "15-product-detail");
  await page.goto("/products/active-boba-cream");
  await expect(page.getByText(P.outOfStock)).toBeVisible();
  await save(page, "15-product-out-of-stock");
});
