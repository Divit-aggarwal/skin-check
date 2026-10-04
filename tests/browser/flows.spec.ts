import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { CAPTURE_QUALITY_SETTINGS } from "@/lib/capture-quality/settings";
import { RETAKE_COPY } from "@/lib/capture-quality/retake";
import { AI_SHARE_CONSENT_COPY, ERASE_CONFIRMATION } from "@/lib/consent";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { DASHBOARD_SEED as U } from "./seed-users";
import { shot, signIn } from "./helpers";

// Browser tests 2-10 of docs/lanes/dashboard-design.md §6, on a phone screen.
// Several change data (scan, withdraw, delete): restart the stack before a rerun.

const FACE = process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png";
const NAME_PROMPT = "Hi! What's your name?";

/** A flat, near-black PNG made in the page: fails the exposure check. */
async function darkPhoto(page: Page): Promise<Buffer> {
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 1000;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgb(4,4,4)";
    g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  });
  return Buffer.from(dataUrl.split(",")[1]!, "base64");
}

/** Name, age and gender; a signed-in user then passes verify and lands on the photo step. */
async function aboutYou(page: Page, age = "25–34") {
  await page.goto("/skin-check");
  const name = page.getByPlaceholder(/name/i).or(page.locator('input[type="text"]')).first();
  await name.fill("Tester");
  await name.press("Enter");
  await page.getByRole("button", { name: age, exact: true }).click();
  // The under-18 confirm comes at the end of the section, after gender.
  await page.getByRole("button", { name: "Female", exact: true }).click();
}

const photoInput = (page: Page) => page.locator('input[type="file"]');
const choosePhoto = (page: Page, file: { name: string; mimeType: string; buffer: Buffer }) => photoInput(page).setInputFiles(file);

test("a dark photo gives a named retake reason; 'Use this photo anyway' appears after the set number of retakes", async ({ page }) => {
  await signIn(page, U.capture!.phoneNumber);
  await aboutYou(page);
  const dark = { name: "dark.png", mimeType: "image/png", buffer: await darkPhoto(page) };
  const needed = CAPTURE_QUALITY_SETTINGS["gate.retakesBeforeOverride"].value;
  const anyway = page.getByRole("button", { name: "Use this photo anyway" });

  await choosePhoto(page, dark);
  await expect(page.getByText(RETAKE_COPY.too_dark)).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze my skin" })).toBeDisabled();
  for (let i = 0; i < needed; i++) {
    await expect(anyway).toHaveCount(0);
    await page.getByRole("button", { name: "Retake" }).click();
    await choosePhoto(page, dark);
    await expect(page.getByText(RETAKE_COPY.too_dark)).toBeVisible();
  }
  await expect(anyway).toBeVisible();
  await page.screenshot({ path: "docs/lanes/dashboard-flow-retake.png", fullPage: true });
});

test("a normal scan finishes and shows on the dashboard", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, U.scan!.phoneNumber);
  await aboutYou(page);
  await choosePhoto(page, { name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Analyze my skin" }).click();
  // The flow moves on to the next section; the analysis lands in the background.
  await expect(page.getByText("What are your main skin concerns?")).toBeVisible({ timeout: 60_000 });

  // The server writes the analysis record when the engine answers (about a
  // minute under emulation): reload the dashboard until it shows.
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  await expect(async () => {
    await page.goto("/dashboard");
    await expect(page.getByText(C.current.checkedOn(today))).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 240_000, intervals: [5_000] });
  await expect(page.getByText(C.photoCheck.pass)).toBeVisible();
  await expect(page.getByText(C.trend.notEnough)).toBeVisible();
  await expect(page.getByText(C.empty)).toHaveCount(0);
  await shot(page, "after-scan");
});

test("a returning user is asked the two questions again, with the 'Last time you said' hint", async ({ page }) => {
  await signIn(page, U.returning!.phoneNumber);
  await page.goto("/skin-check");
  // The saved questionnaire is reused: the flow starts at verify, not at the name.
  await expect(page.getByText(NAME_PROMPT)).toHaveCount(0);
  await choosePhoto(page, { name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Analyze my skin" }).click();
  await expect(page.getByText("What are you currently using on your skin?")).toBeVisible({ timeout: 240_000 });
  await expect(page.getByText("Last time you said: Nothing right now")).toBeVisible();
  // Blank, not pre-filled (decision 10a): the confirm button needs a new tap first.
  await page.getByRole("button", { name: /Nothing right now/ }).click();
  await page.getByRole("button", { name: "Confirm selection" }).last().click();
  // The next section replaces this one on screen, with its own hint.
  await expect(page.getByText(/hormonal or reproductive factors/)).toBeVisible();
  await expect(page.getByText("Last time you said: My breakouts change around my period")).toBeVisible();
  await page.screenshot({ path: "docs/lanes/dashboard-flow-returning.png", fullPage: true });
});

test("under 18 shows the confirm step; No goes back, Yes blocks", async ({ page }) => {
  await aboutYou(page, "<18");
  await expect(page.getByText("You chose under 18. Is that right?")).toBeVisible();
  await page.getByRole("button", { name: "No, change my answer" }).click();
  await expect(page.getByText("How old are you?")).toBeVisible();
  await expect(page.getByText("You chose under 18. Is that right?")).toHaveCount(0);
  await page.getByRole("button", { name: "<18", exact: true }).click();
  await expect(page.getByText("You chose under 18. Is that right?")).toBeVisible();
  await page.getByRole("button", { name: /Yes, I.m under 18/ }).click();
  await expect(page.getByText(/isn't available yet for users under 18/)).toBeVisible();
  await page.screenshot({ path: "docs/lanes/dashboard-flow-under18.png", fullPage: true });
});

async function askEcho(page: Page) {
  await page.getByRole("button", { name: C.chat.button }).click();
  await expect(page).toHaveURL(/\/echo/);
  await page.getByRole("textbox").fill("What does this photo reading show?");
  await page.getByRole("button", { name: "Send" }).click();
}

test("Echo asks for AI-share consent first", async ({ page }) => {
  await signIn(page, U.echo!.phoneNumber);
  await page.goto("/dashboard");
  await expect(page.getByText(C.privacy.aiNotAsked)).toBeVisible();
  await askEcho(page);
  await expect(page.getByText(AI_SHARE_CONSENT_COPY)).toBeVisible();
  await page.screenshot({ path: "docs/lanes/dashboard-flow-echo-consent.png", fullPage: true });
});

test("withdraw AI-share consent on the dashboard, then Echo asks again", async ({ page }) => {
  await signIn(page, U.withdraw!.phoneNumber);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: C.privacy.stop }).click();
  await expect(page.getByText(C.privacy.aiOff)).toBeVisible();
  await page.getByRole("heading", { name: C.privacy.title }).scrollIntoViewIfNeeded();
  await shot(page, "privacy-off");
  await askEcho(page);
  await expect(page.getByText(AI_SHARE_CONSENT_COPY)).toBeVisible();
});

test("routine: add a product, mark used, mark skipped, add other product, reload, all still there", async ({ page }) => {
  await signIn(page, U.routine!.phoneNumber);
  await page.goto("/routine");
  await expect(page.getByText(R.empty)).toBeVisible();

  const addSection = page.locator("section", { has: page.getByRole("heading", { name: R.add }) });
  const product = addSection.getByLabel(R.product);
  const first = await product.locator("option").nth(1).textContent();
  await product.selectOption({ index: 1 });
  await addSection.getByRole("button", { name: R.addButton, exact: true }).click();
  // By the product name line only: every card's "Swap for" list also names the other products.
  const card = (name: string) => page.locator("div.rounded-lg").filter({ has: page.locator("div.font-medium").getByText(name, { exact: true }) });
  await expect(card(first!)).toBeVisible();
  await card(first!).getByRole("button", { name: R.used, exact: true }).click();
  await expect(card(first!).getByText(`${R.today}, ${R.slot.AM}: ${R.status.used}`)).toBeVisible();

  await addSection.getByLabel(R.product).selectOption({ label: R.otherProduct });
  await addSection.getByRole("button", { name: R.addButton, exact: true }).click();
  await expect(card(R.otherProduct)).toBeVisible();
  await card(R.otherProduct).getByRole("button", { name: R.skipped, exact: true }).click();
  await expect(card(R.otherProduct).getByText(`${R.today}, ${R.slot.AM}: ${R.status.skipped}`)).toBeVisible();

  await page.reload();
  await expect(card(first!).getByText(`${R.today}, ${R.slot.AM}: ${R.status.used}`)).toBeVisible();
  await expect(card(R.otherProduct).getByText(`${R.today}, ${R.slot.AM}: ${R.status.skipped}`)).toBeVisible();
  // R-6: the page fits a 390 px phone screen, with long product names in every list.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const el of await page.locator("select, div.rounded-lg").all()) {
    const box = await el.boundingBox();
    expect(box!.x + box!.width, await el.evaluate((n) => n.outerHTML.slice(0, 80))).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: "docs/lanes/dashboard-flow-routine.png", fullPage: true });
});

test("Ask Echo, back to the dashboard, a new check starts at the questions", async ({ page }) => {
  await signIn(page, U.echo!.phoneNumber);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: C.chat.button }).click();
  await expect(page).toHaveURL(/\/echo/);
  await page.goBack();
  await page.getByRole("link", { name: C.newCheck }).first().click();
  await expect(page.getByText(NAME_PROMPT)).toBeVisible();
  await expect(page.getByText("Your skin, understood.")).toHaveCount(0);
});

test("K-1 fixed: Echo's back link after a dashboard hand-off returns to the dashboard", async ({ page }) => {
  await signIn(page, U.echo!.phoneNumber);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: C.chat.button }).click();
  await expect(page).toHaveURL(/\/echo/);
  await page.getByRole("link", { name: "Back to your skin checks" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(C.title)).toBeVisible();
});

test("delete the account, sign in again, no history", async ({ page }) => {
  await signIn(page, U.erase!.phoneNumber);
  await page.goto("/dashboard");
  await expect(page.getByText(C.history.kind.reading).first()).toBeVisible();
  await page.getByRole("link", { name: C.privacy.delete }).click();
  await expect(page).toHaveURL(/\/account#delete-account/);
  await page.getByRole("button", { name: "Delete my account and data" }).click();
  await page.getByLabel(/to confirm/).fill(ERASE_CONFIRMATION);
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("Your account and your data have been deleted.")).toBeVisible({ timeout: 60_000 });

  await signIn(page, U.erase!.phoneNumber);
  await page.goto("/dashboard");
  await expect(page.getByText(C.empty)).toBeVisible();
  await expect(page.getByText(C.history.title)).toHaveCount(0);
  await shot(page, "after-delete");
});

// TD-18 O-D3: the dashboard is reached from the signed-in start page and /account (the results screen is pinned in tests/dashboard-copy.test.ts).
test("O-D3: the signed-in start page and the account page link to the dashboard; signed out, no link", async ({ page }) => {
  await page.goto("/skin-check");
  await expect(page.getByText(NAME_PROMPT)).toBeVisible();
  await expect(page.getByRole("link", { name: C.entryLink })).toHaveCount(0);

  await signIn(page, U.one!.phoneNumber);
  await page.goto("/skin-check");
  await page.getByRole("link", { name: C.entryLink }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByText(C.title)).toBeVisible();

  await page.goto("/account");
  await page.getByRole("link", { name: C.entryLink }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});
