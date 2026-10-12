import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { HOME_COPY as H } from "@/components/dashboard/homeCopy";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { SHELL_COPY as S } from "@/components/shell/copy";
import { slotNow } from "@/lib/home/today";
import { DASHBOARD_SEED as U } from "./seed-users";
import { signIn } from "./helpers";

// TD-48: the phone and tablet Home (below 1024px). Screenshots in docs/design/home-v3/.
const FS = process.env.PW_FIRESTORE_HOST!;
const SHOTS = "docs/design/home-v3";
mkdirSync(SHOTS, { recursive: true });
const DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36";
const slot = slotNow(new Date(), "Asia/Kolkata");
test.use({ timezoneId: "Asia/Kolkata", locale: "en-IN" });

async function at(browser: Browser, width: number, phone: string) {
  const ctx = await browser.newContext({ timezoneId: "Asia/Kolkata", locale: "en-IN", viewport: { width, height: width === 390 ? 844 : 1024 }, ...(width === 390 ? {} : { userAgent: DESKTOP_UA }) });
  const page = await ctx.newPage();
  await signIn(page, phone);
  await page.goto("/dashboard");
  await expect(page.getByRole("img", { name: /routine steps done today/ })).toBeVisible();
  return { page, close: () => ctx.close() };
}
const shot = (page: Page, name: string) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
const today = (page: Page) => page.locator("section", { has: page.getByRole("heading", { name: H.today.title }) });

test("fold: at 390 x 844 the greeting, Today, routine row, latest check row and Echo chips fit one screen; the page is under two screens", async ({ browser }) => {
  const { page, close } = await at(browser, 390, U.v3Normal!.phoneNumber);
  const chips = page.getByRole("region", { name: H.echo.title });
  await expect(chips.getByRole("button")).toHaveCount(2);
  const bar = (await page.getByRole("navigation", { name: S.navLabel }).last().boundingBox())!;
  for (const el of [page.getByRole("heading", { level: 1 }), today(page), page.getByRole("region", { name: R.slot[slot] }), page.getByRole("link", { name: /Open the check from/ }), chips]) {
    const box = (await el.boundingBox())!;
    expect(box.y + box.height, (await el.textContent()) ?? "").toBeLessThanOrEqual(bar.y);
  }
  const heights = await page.evaluate(() => ({ page: document.documentElement.scrollHeight, screen: window.innerHeight }));
  console.log(`page height at 390 x 844: ${(heights.page / heights.screen).toFixed(2)} screens`);
  expect(heights.page).toBeLessThan(2 * heights.screen);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `${SHOTS}/normal-390-first-screen.png` });
  await close();
});

for (const width of [390, 768]) {
  test(`${width}: normal, due, all done, no check yet, weather off for this user (no city)`, async ({ browser }) => {
    // Normal: a step to do now is the one main button; the ring has a text label.
    let s = await at(browser, width, U.v3Normal!.phoneNumber);
    await expect(today(s.page).getByRole("button", { name: /^Mark .+ done$/ })).toBeVisible();
    await expect(s.page.getByRole("img", { name: H.today.ringLabel(0, 2) })).toBeVisible();
    await expect(today(s.page).getByText(H.today.streak(1))).toBeVisible();
    await expect(s.page.getByRole("link", { name: /Open the check from/ })).toContainText(/\+3 more/);
    await shot(s.page, `normal-${width}`);
    await s.close();
    // Due: "Take your check" is the one main button.
    s = await at(browser, width, U.homeToday!.phoneNumber);
    await expect(today(s.page).getByRole("link", { name: H.today.takeCheck })).toBeVisible();
    await expect(s.page.getByTestId("next-check")).toHaveText(H.today.nextToday);
    await expect(s.page.getByText(H.routineRow.empty)).toBeVisible();
    await shot(s.page, `due-${width}`);
    await s.close();
    // All done: a quiet state, not a button.
    s = await at(browser, width, U.v3AllDone!.phoneNumber);
    await expect(today(s.page).getByRole("status")).toHaveText(H.today.allDone);
    await expect(today(s.page).getByRole("button", { name: /^Mark/ })).toHaveCount(0);
    await shot(s.page, `all-done-${width}`);
    await s.close();
    // No check yet: one inviting row.
    s = await at(browser, width, U.empty!.phoneNumber);
    await expect(s.page.getByRole("link", { name: H.latestRow.first })).toHaveAttribute("href", "/skin-check");
    await expect(today(s.page).getByRole("link", { name: H.today.takeCheck })).toBeVisible();
    await shot(s.page, `no-check-${width}`);
    await s.close();
    // Weather missing (no city): the third line is the starting checks, with a one-line way to add a city.
    s = await at(browser, width, U.v3Tap!.phoneNumber);
    await expect(today(s.page).getByText(H.today.starting(0, 3))).toBeVisible();
    await expect(today(s.page).getByRole("button", { name: H.today.addCity })).toBeVisible();
    await shot(s.page, `weather-off-${width}`);
    await s.close();
  });
}

test("tapping a routine step marks it done and undoes it; the ring follows", async ({ browser }) => {
  const { page, close } = await at(browser, 390, U.v3Tap!.phoneNumber);
  const tile = page.getByRole("region", { name: R.slot[slot] }).getByRole("button").first();
  // Start from "not done" whatever an earlier run on this stack left.
  if ((await tile.getAttribute("aria-pressed")) === "true") {
    await tile.click();
    await expect(tile).toHaveAttribute("aria-pressed", "false");
  }
  const ring = async () => Number(/^(\d+) of/.exec((await page.getByRole("img", { name: /routine steps done today/ }).getAttribute("aria-label"))!)![1]);
  const before = await ring();
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "true");
  await expect.poll(ring).toBe(before + 1);
  await tile.click();
  await expect(tile).toHaveAttribute("aria-pressed", "false");
  await expect.poll(ring).toBe(before);
  // The main button marks the next step of this time of day.
  await today(page).getByRole("button", { name: /^Mark .+ done$/ }).click();
  await expect.poll(ring).toBe(before + 1);
  await close();
});

test("the weather sheet: the UV line opens the full weather and air with the source credit", async ({ browser }) => {
  const { page, close } = await at(browser, 390, U.homeDue!.phoneNumber);
  await today(page).getByRole("button", { name: /^UV \d+, / }).click();
  const sheet = page.getByRole("dialog", { name: H.today.weatherSheet });
  await expect(sheet.getByText("68%")).toBeVisible();
  await expect(sheet.getByRole("link", { name: H.weather.source })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/weather-sheet-390.png` });
  await sheet.getByRole("button", { name: H.today.close }).click();
  await expect(sheet).toBeHidden();
  await close();
});

test("compact states: analysing, no permission, source down, iPhone hint; New check in the bottom bar", async ({ browser }) => {
  await fetch(`http://${FS}/v1/projects/demo-skin-check/databases/(default)/documents/users/${U.homeAnalysing!.uid}/skinChecks?documentId=v3-${Date.now()}`, {
    method: "POST",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields: { status: { stringValue: "questionnaire_only" }, createdAt: { timestampValue: new Date().toISOString() } } }),
  });
  let s = await at(browser, 390, U.homeAnalysing!.phoneNumber);
  await expect(s.page.getByRole("link", { name: /Open the check from/ })).toContainText(H.latestRow.analysing);
  // The iPhone hint (the default phone here is an iPhone in the browser): one line.
  await expect(today(s.page).getByText(H.next.iosHint)).toBeVisible();
  // New check: a labelled centre item in the bottom bar.
  await expect(s.page.getByRole("navigation", { name: S.navLabel }).last().getByRole("link", { name: S.nav.newCheck })).toBeVisible();
  await s.close();
  // No permission yet: no "Use my location" anywhere before the permissions screen.
  s = await at(browser, 390, U.neverAsked!.phoneNumber);
  await today(s.page).getByRole("button", { name: H.today.addCity }).click();
  await expect(s.page.getByRole("dialog").getByRole("button", { name: H.weather.typeCity })).toBeVisible();
  await expect(s.page.getByRole("button", { name: H.weather.useLocation })).toHaveCount(0);
  await s.close();
  // Source down: one line.
  writeFileSync(".local-stack/fake-weather/down", "");
  try {
    s = await at(browser, 390, U.homeDown!.phoneNumber);
    await expect(today(s.page).getByRole("button", { name: H.today.uvDown })).toBeVisible();
    await s.close();
  } finally {
    rmSync(".local-stack/fake-weather/down", { force: true });
  }
});
