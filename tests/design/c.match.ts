import { expect, test, type Page } from "@playwright/test";
import { matchShot } from "./match";
import { signIn } from "../browser/helpers";
import { P_SEED } from "../browser/seed-products";
import { MMC_SINCE, seedMmC } from "../../scripts/seed-mm-c";
import { ECHO_COPY as E } from "@/components/skin-check/echoCopy";
import { PRODUCTS_COPY as C } from "@/components/products/copy";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";

// G37 lane C mockup-match shots (06, 14, 15, 16), each at 393, 320, 375 and 430.
//   PW_ARGS="-c tests/design/match.config.ts tests/design/c.match.ts" bash scripts/with-stack-slot.sh npm run test:browser
test.beforeAll(async () => seedMmC());

const settle = async (page: Page) => {
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
  await page.waitForTimeout(500);
};
const top = (page: Page, name: string, level: 1 | 2 = 2) =>
  page.getByRole("heading", { level, name }).first().evaluate((el) => el.scrollIntoView({ block: "start" }));

test("06 routine products", async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page, MMC_SINCE.phoneNumber);
  await page.goto("/routine");
  await expect(page.locator("[data-routine-card]")).toHaveCount(3);
  await settle(page);
  await top(page, R.yourProducts);
  await matchShot(page, info, "06-products");
});

test("14 Echo cards", async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page, P_SEED.plain["390"].phoneNumber);
  await page.goto("/echo");
  const cards = page.getByRole("region", { name: E.productsLabel });
  await expect(cards.getByRole("listitem")).toHaveCount(4, { timeout: 60_000 });
  await settle(page);
  await cards.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await matchShot(page, info, "14-cards");
});

test("15 product detail", async ({ page }, info) => {
  test.setTimeout(120_000);
  await signIn(page, MMC_SINCE.phoneNumber); // the mockup is the signed-in app (no marketing header)
  await page.goto("/products/protecting-sunscreen");
  await settle(page);
  await matchShot(page, info, "15-detail");
  await page.goto("/products/active-boba-cream");
  await settle(page);
  await matchShot(page, info, "15-out-of-stock");
});

test("16 since you started", async ({ page }, info) => {
  test.setTimeout(180_000);
  await signIn(page, MMC_SINCE.phoneNumber);
  await page.goto("/products/niacinamide-serum/since");
  await expect(page.getByText("Needs more checks").first()).toBeVisible({ timeout: 30_000 });
  await settle(page);
  await matchShot(page, info, "16-since");
  await top(page, C.timelines);
  await matchShot(page, info, "16-timelines");
});
