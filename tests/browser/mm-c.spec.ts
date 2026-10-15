import { expect, test } from "@playwright/test";
import { PRODUCTS_COPY as C } from "@/components/products/copy";
import { getProduct } from "@/lib/catalog/catalogue";
import { MMC_EMPTY, MMC_SINCE, seedMmC } from "../../scripts/seed-mm-c";
import { signIn } from "./helpers";

// G37 lane C: screen 15 signed out (store data when the store can be read,
// otherwise the store link), and screen 16 for a seeded user with a routine
// and checks (scripts/seed-mm-c.ts; seeded here, kit request C-mm-3).

test.use({ viewport: { width: 393, height: 793 } });
test.beforeAll(async () => seedMmC());

const serum = getProduct("niacinamide-serum")!.name;

test("15 signed out: the product, how to use, and the store's part; no link to 16", async ({ page }) => {
  await page.goto("/products/niacinamide-serum");
  await expect(page.getByRole("heading", { level: 1, name: serum })).toBeVisible();
  await expect(page.getByRole("heading", { name: C.howToUse })).toBeVisible();
  await expect(page.getByRole("heading", { name: C.fromStore }).or(page.getByRole("link", { name: new RegExp(C.onStore) }))).toBeVisible();
  await expect(page.getByText(C.sinceTitle(serum))).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("16: readings from the start day on, closed change slots, own photos; 15 links to it", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, MMC_SINCE.phoneNumber);
  await page.goto("/products/niacinamide-serum");
  await page.getByRole("link", { name: C.sinceTitle(serum) }).click();
  await expect(page).toHaveURL(/\/products\/niacinamide-serum\/since$/);
  await expect(page.getByRole("heading", { level: 1, name: C.sinceTitle(serum) })).toBeVisible();
  await expect(page.getByText(/^Started on /)).toBeVisible();
  const chips = page.getByRole("navigation", { name: C.yourProducts }).getByRole("link");
  await expect(chips).toHaveCount(3);
  await expect(chips.filter({ hasText: serum })).toHaveAttribute("aria-current", "page");
  // Three checks after the start day (the one 35 days ago is before it): every slot is closed (C12).
  await expect(page.getByText("Needs more checks")).toHaveCount(5);
  await expect(page.getByRole("table").first().getByRole("row")).toHaveCount(3);
  await expect(page.getByRole("region", { name: C.photos }).or(page.locator("section", { has: page.getByRole("heading", { name: C.photos }) })).getByRole("img")).toHaveCount(3, { timeout: 20_000 });
  await expect(page.getByText(/working|improving|response|insight/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("16 with nothing in the routine: the empty state links to /routine", async ({ page }) => {
  await signIn(page, MMC_EMPTY.phoneNumber);
  await page.goto("/products/niacinamide-serum/since");
  await expect(page.getByRole("heading", { name: C.emptyTitle })).toBeVisible();
  await page.getByRole("link", { name: C.toRoutine }).click();
  await expect(page).toHaveURL(/\/routine$/);
});
