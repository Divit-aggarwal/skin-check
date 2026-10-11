import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import { ECHO_COPY as E } from "@/components/skin-check/echoCopy";
import { OWN_PRODUCTS, OWN_PRODUCTS_LINE, PRODUCT_DOCTOR_LINE, STEP_LABEL } from "@/lib/context/products";
import { COPY } from "@/lib/rules/settings";
import { AI_SHARE_CONSENT_COPY } from "@/lib/consent";
import { P_SEED } from "./seed-products";
import { STARTER_POOL } from "@/components/skin-check/echoStarters";
import { signIn } from "./helpers";

// TD-34 (docs/design/echo-own-products.md): Echo's opening suggestion and the
// product cards, at a phone (390), a tablet (768) and a laptop (1280). The
// local Gemini stand-in answers a product request with a checked suggestion
// built from the request's own package (scripts/fake-gemini.mjs).
// AFTER_SHOTS=1 writes the screenshots to docs/design/after/.

const DIR = process.env.AFTER_SHOTS ? "docs/design/after" : ".local-stack/browser-shots";
mkdirSync(DIR, { recursive: true });
const shot = async (page: Page, name: string) => {
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage: true });
};
const geminiRequests = () => {
  const file = ".local-stack/fake-gemini/requests.jsonl";
  return existsSync(file) ? readFileSync(file, "utf8").trim().split("\n").filter(Boolean).length : 0;
};

const device = (name: string) => {
  const { defaultBrowserType: _, ...rest } = devices[name]!;
  return rest;
};
const DEVICE = {
  "390": { ...device("iPhone 13"), viewport: { width: 390, height: 844 } },
  "768": { ...device("iPad Mini"), viewport: { width: 768, height: 1024 } },
  "1280": { ...device("Desktop Chrome"), viewport: { width: 1280, height: 800 } },
} as const;

const OPENING = "Here is a simple routine from Project Skin's products.";
const cards = (page: Page) => page.getByRole("region", { name: E.productsLabel }).getByRole("listitem");
const SHOWN = OWN_PRODUCTS.slice(0, 4); // the stand-in suggests one per step, the first four in step order

for (const width of ["390", "768", "1280"] as const) {
  test.describe(`TD-34 at ${width}px`, () => {
    test.use(DEVICE[width]);

    test("the opening offers a routine in the store's four steps, as cards drawn by the app; a reload costs no Gemini call", async ({ page }) => {
      await signIn(page, P_SEED.plain[width].phoneNumber);
      await page.goto("/echo");
      await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(OWN_PRODUCTS_LINE)).toBeVisible();
      await expect(cards(page)).toHaveCount(4);
      for (let i = 0; i < SHOWN.length; i++) {
        const p = SHOWN[i]!;
        const card = cards(page).nth(i);
        await expect(card.getByText(STEP_LABEL[p.step], { exact: true })).toBeVisible();
        await expect(card.getByRole("heading", { name: p.name })).toBeVisible();
        await expect(card).toContainText(p.keyIngredient);
        await expect(card).toContainText(p.usage);
        await expect(card).toContainText(`${E.echoNote}:`);
        await expect(card.getByRole("link", { name: new RegExp(E.onStore) })).toHaveAttribute("href", p.url);
      }
      expect(SHOWN.map((p) => STEP_LABEL[p.step])).toEqual(["Cleanse", "Treat", "Moisturise", "Protect"]);
      // No price, no buy button.
      await expect(page.locator("main")).not.toContainText(/₹|Rs\.? ?\d|price|buy|add to cart/i);
      // Nothing wider than the screen.
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await shot(page, `echo-opening-${width}`);

      const before = geminiRequests();
      await page.reload();
      await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
      await expect(cards(page)).toHaveCount(4);
      expect(geminiRequests()).toBe(before);
    });
  });
}

test.describe("TD-34 guards and flows (390px)", () => {
  test.use(DEVICE["390"]);

  test("questionnaire red flag (TD-45): the dermatologist note once as its own panel, then the routine with cards", async ({ page }) => {
    await signIn(page, P_SEED.redFlag.phoneNumber);
    await page.goto("/echo");
    await expect(page.getByRole("note").getByText(COPY.referral)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(COPY.referral)).toHaveCount(1);
    await expect(page.getByText(OPENING)).toBeVisible();
    await expect(cards(page)).toHaveCount(4);
    await shot(page, "echo-opening-red-flag-390");
  });

  test("a prescription answer: the cards, with the fixed doctor line", async ({ page }) => {
    await signIn(page, P_SEED.prescription.phoneNumber);
    await page.goto("/echo");
    await expect(page.getByText(PRODUCT_DOCTOR_LINE)).toBeVisible({ timeout: 60_000 });
    await expect(cards(page)).toHaveCount(4);
    await shot(page, "echo-opening-doctor-line-390");
  });

  test("no AI-share consent yet: Echo asks first, then shows the suggestion", async ({ page }) => {
    await signIn(page, P_SEED.consent.phoneNumber);
    await page.goto("/echo");
    await expect(page.getByText(AI_SHARE_CONSENT_COPY)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(OPENING)).toHaveCount(0);
    await page.getByRole("button", { name: "I agree" }).click();
    await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
    await expect(cards(page)).toHaveCount(4);
  });

  test("a product question gets an answer with cards under it", async ({ page }) => {
    await signIn(page, P_SEED.ask.phoneNumber);
    await page.goto("/echo");
    await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("textbox").fill("Which products should I use?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText(OPENING)).toHaveCount(2, { timeout: 60_000 });
    await expect(page.getByRole("region", { name: E.productsLabel })).toHaveCount(2);
    await shot(page, "echo-product-question-390");
  });

  // Owner decisions 2026-10-11: starter questions above the message box; products on.
  test("starter questions: three or four above the box; tapping one sends it, its cards follow, and it is not offered again", async ({ page }) => {
    await signIn(page, P_SEED.ask.phoneNumber);
    await page.goto("/echo");
    await expect(page.getByText(OPENING)).toBeVisible({ timeout: 60_000 });
    const starters = page.getByRole("list", { name: E.startersLabel }).getByRole("button");
    expect(await starters.count()).toBeGreaterThanOrEqual(3);
    expect(await starters.count()).toBeLessThanOrEqual(4);
    await page.getByRole("log").evaluate((el) => el.scrollTo({ top: 0 }));
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/echo-starters-390.png` });
    const texts = await starters.allInnerTexts();
    const q = texts.find((t) => STARTER_POOL.products.includes(t))!;
    expect(q).toBeTruthy();
    // Keyboard: the starter is a real button.
    await starters.filter({ hasText: q }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("log").getByText(q, { exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: E.productsLabel })).toHaveCount(2, { timeout: 60_000 });
    await expect(starters.filter({ hasText: q })).toHaveCount(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${DIR}/echo-product-cards-390.png` });
  });
});
