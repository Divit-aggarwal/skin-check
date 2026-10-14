import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { HOME_COPY as H } from "@/components/dashboard/homeCopy";
import { CAPTURE_QUALITY_SETTINGS } from "@/lib/capture-quality/settings";
import { RETAKE_COPY } from "@/lib/capture-quality/retake";
import { AI_SHARE_CONSENT_COPY, ERASE_CONFIRMATION } from "@/lib/consent";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { PRODUCTS_COPY } from "@/components/products/copy";
import { CATALOGUE } from "@/lib/catalog/catalogue";
import { TIMELINE_COPY as T } from "@/components/timeline/copy";
import { ECHO_COPY as E } from "@/components/skin-check/echoCopy";
import { DASHBOARD_SEED as U } from "./seed-users";
import { desktop, shot, signIn } from "./helpers";
import { SHELL_COPY as S } from "@/components/shell/copy";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { DRAFT_VERSION } from "@/lib/skin-check-draft";

const SERUM = CATALOGUE.products.find((p) => p.category === "serum")!.name;

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

/** The choice (TD-44: first), then name, age and gender; a signed-in user then passes verify and lands on the photo step. */
async function aboutYou(page: Page, age = "25–34") {
  await page.goto("/skin-check");
  await page.getByRole("button", { name: Q.answerNow }).click();
  // The check flow's one h1 is the part of the check the user is in.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/about you/i);
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
  await page.screenshot({ path: ".local-stack/browser-shots/dashboard-flow-retake.png", fullPage: true });
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
    await desktop(page); // TD-48: the Home v2 content is the desktop Home
    await page.goto("/dashboard");
    await expect(page.getByText(H.latest.checkedOn(today, H.latest.ago(0)))).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 240_000, intervals: [5_000] });
  await expect(page.getByText(C.photoCheck.pass)).toBeVisible();
  await expect(page.getByText(C.trend.notEnough)).toBeVisible();
  await expect(page.getByText(H.latest.none)).toHaveCount(0);
  await shot(page, "after-scan");
});

// Owner decision 2026-10-11: a returning user who answered the questions goes
// from "New check" to the photo step; nothing is asked again. These run before
// the full walk below, which saves a check for the same seeded user.
const photoStep = (page: Page) => expect(page.getByRole("heading", { level: 1 })).toHaveText(/skin photo/i, { timeout: 30_000 });

test("returning user: a slow read of the saved answers never strands them on a filled-in About you", async ({ page }) => {
  await signIn(page, U.returning!.phoneNumber);
  // The bug: the saved answers landed after the user had started typing, filled About you in and left it with nothing to tap.
  let slow = true;
  await page.route(new RegExp(`${process.env.PW_FIRESTORE_HOST}/`), async (route) => {
    if (slow) await new Promise((r) => setTimeout(r, 2500));
    await route.continue().catch(() => undefined);
  });
  await page.getByRole("link", { name: S.nav.newCheck }).first().click();
  await expect(page.getByText(NAME_PROMPT)).toHaveCount(0);
  slow = false;
  await photoStep(page);
  await expect(page.getByText(NAME_PROMPT)).toHaveCount(0);
});

test("returning user: a draft left on About you from an earlier visit still goes to the photo step", async ({ page }) => {
  await signIn(page, U.returning!.phoneNumber);
  await page.evaluate((version) => {
    localStorage.setItem("skin-check-draft", JSON.stringify({ version, scanId: "scan-left-behind", answers: { name: "Tester" }, sectionIndex: 0, questionsChoice: "pending", updatedAt: Date.now() }));
  }, DRAFT_VERSION);
  await page.getByRole("link", { name: S.nav.newCheck }).first().click();
  await photoStep(page);
});

test("returning user: 'New check' to the results without meeting a question", async ({ page }) => {
  test.setTimeout(420_000);
  await signIn(page, U.returning!.phoneNumber);
  await page.getByRole("link", { name: S.nav.newCheck }).first().click();
  await photoStep(page);
  await expect(page.getByRole("button", { name: "Anything changed? Update your answers" })).toBeVisible();
  await page.waitForTimeout(400); // entrance animation
  await page.screenshot({ path: ".local-stack/browser-shots/new-check-returning-390.png", fullPage: true });
  await choosePhoto(page, { name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Analyze my skin" }).click();
  // Straight to the last step: no question section in between.
  const results = page.getByRole("button", { name: "Get my results" });
  await expect(results).toBeEnabled({ timeout: 300_000 });
  await results.click();
  await expect(page.getByRole("heading", { name: "Your photo reading" })).toBeVisible({ timeout: 60_000 });
  // The saved answers went with the new check: no "answer the questions" note.
  await expect(page.getByRole("link", { name: Q.answerLink })).toHaveCount(0);
  // TD-47 (3): a returning user never asked before sees the permissions screen once, now, between the results and Home.
  await page.getByRole("link", { name: C.entryLink }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: H.permissions.title })).toBeVisible();
  await page.screenshot({ path: `${process.env.AFTER_SHOTS ? "docs/design/home-v2" : ".local-stack/browser-shots"}/permissions-after-check-390.png`, fullPage: true });
  await page.getByRole("button", { name: H.permissions.continue }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
  await expect(page.getByRole("heading", { name: H.permissions.title })).toHaveCount(0);
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
  await expect(page.getByRole("button", { name: "Change my answer" })).toBeVisible();
  await expect(page.getByText(/isn't available yet for users under 18/)).toBeVisible();
  await page.screenshot({ path: ".local-stack/browser-shots/dashboard-flow-under18.png", fullPage: true });
});

async function askEcho(page: Page) {
  await desktop(page); // TD-48: the Home v2 content is the desktop Home
  await page.getByRole("button", { name: C.chat.button }).click();
  await expect(page).toHaveURL(/\/echo/);
  await page.getByRole("textbox").fill("What does this photo reading show?");
  await page.getByRole("button", { name: "Send" }).click();
}

test("Echo asks for AI-share consent first", async ({ page }) => {
  await signIn(page, U.echo!.phoneNumber);
  // TD-47: the privacy card is on Account.
  await page.goto("/account");
  await expect(page.getByText(C.privacy.aiNotAsked)).toBeVisible();
  await desktop(page); // TD-48: the Home v2 content is the desktop Home
  await page.goto("/dashboard");
  await askEcho(page);
  await expect(page.getByText(AI_SHARE_CONSENT_COPY)).toBeVisible();
  await page.screenshot({ path: ".local-stack/browser-shots/dashboard-flow-echo-consent.png", fullPage: true });
});

test("withdraw AI-share consent on Account, then Echo asks again", async ({ page }) => {
  await signIn(page, U.withdraw!.phoneNumber);
  await page.goto("/account");
  await page.getByRole("button", { name: C.privacy.stop }).click();
  await expect(page.getByText(C.privacy.aiOff)).toBeVisible();
  await page.getByRole("heading", { name: C.privacy.title }).scrollIntoViewIfNeeded();
  await shot(page, "privacy-off");
  await desktop(page); // TD-48: the Home v2 content is the desktop Home
  await page.goto("/dashboard");
  await askEcho(page);
  await expect(page.getByText(AI_SHARE_CONSENT_COPY)).toBeVisible();
});

test("routine: the four steps, an empty step invites an add, used and skipped in one tap, reload, all still there", async ({ page }) => {
  await signIn(page, U.routine!.phoneNumber);
  await page.goto("/routine");
  await expect(page.getByText(R.empty)).toBeVisible();
  const morning = page.getByRole("region", { name: R.slot.AM, exact: true });
  const evening = page.getByRole("region", { name: R.slot.PM, exact: true });
  // Redesign Phase 2: one time of day at a time; it opens on the current one.
  await page.getByRole("radio", { name: R.slot.PM }).click();
  await expect(evening.getByText(R.eveningProtect)).toBeVisible();
  await page.getByRole("radio", { name: R.slot.AM }).click();
  for (const step of Object.values(R.steps)) await expect(morning.getByText(step, { exact: true })).toBeVisible();

  // An empty step opens the add form for that step and slot. The real
  // catalogue (TD-29 (1)) has a serum, so the form offers it.
  await morning.getByRole("link", { name: R.addToStepLabel(R.steps.serum, R.slot.AM.toLowerCase()) }).click();
  const addSection = page.locator("section", { has: page.getByRole("heading", { name: R.add }) });
  await expect(addSection.getByLabel(R.stepLabel)).toHaveValue("serum");
  await expect(addSection.getByLabel(R.product).locator("option", { hasText: SERUM })).toHaveCount(1);
  await expect(addSection.getByText(R.noProductForStep)).toHaveCount(0);
  await addSection.getByLabel(R.stepLabel).selectOption("");

  const product = addSection.getByLabel(R.product);
  const first = await product.locator("option").nth(1).textContent();
  await product.selectOption({ index: 1 });
  await addSection.getByRole("button", { name: R.addButton, exact: true }).click();
  const entry = (name: string) => morning.locator("[data-routine-entry]").filter({ has: page.getByText(name, { exact: true }) });
  await expect(entry(first!)).toBeVisible();
  // Redesign lane C (screen 06 to 15): an own product's card links to its product page.
  await expect(page.locator("article[data-routine-card]").filter({ hasText: first! }).getByRole("link", { name: PRODUCTS_COPY.detailsLabel(first!) })).toHaveAttribute("href", /^\/products\/[a-z0-9-]+$/);
  await entry(first!).getByRole("button", { name: R.logAs(R.status.used, first!, R.slot.AM.toLowerCase()) }).click();
  await expect(entry(first!).getByText(R.todayStatus(R.status.used))).toBeVisible();

  await addSection.getByLabel(R.product).selectOption({ label: R.otherProduct });
  await addSection.getByRole("button", { name: R.addButton, exact: true }).click();
  await expect(morning.getByText(R.otherGroup)).toBeVisible();
  await entry(R.otherProduct).getByRole("button", { name: R.logAs(R.status.skipped, R.otherProduct, R.slot.AM.toLowerCase()) }).click();
  await expect(entry(R.otherProduct).getByText(R.todayStatus(R.status.skipped))).toBeVisible();

  // Keyboard focus stays on the pressed button while it saves (flow review G03).
  const skipped = entry(first!).getByRole("button", { name: R.logAs(R.status.skipped, first!, R.slot.AM.toLowerCase()) });
  await skipped.focus();
  await page.keyboard.press("Enter");
  await expect(entry(first!).getByText(R.todayStatus(R.status.skipped))).toBeVisible();
  await expect(skipped).toBeFocused();
  await skipped.focus();
  await entry(first!).getByRole("button", { name: R.logAs(R.status.used, first!, R.slot.AM.toLowerCase()) }).click();
  await page.reload();
  // The page reopens on the current time of day (after 15:00, Evening).
  await page.getByRole("radio", { name: R.slot.AM }).click();
  await expect(entry(first!).getByText(R.todayStatus(R.status.used))).toBeVisible();
  await expect(entry(R.otherProduct).getByText(R.todayStatus(R.status.skipped))).toBeVisible();
  // No reading or photo next to a routine entry.
  await expect(page.locator("main")).not.toContainText(/\b(Low|Moderate|Elevated)\b/);
  await expect(page.locator("main img")).toHaveCount(0);
  // R-6: the page fits a 390 px phone screen, with long product names in every list.
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  for (const el of await page.locator("select, article[data-routine-card], [data-routine-entry]").all()) {
    const box = await el.boundingBox();
    expect(box!.x + box!.width, await el.evaluate((n) => n.outerHTML.slice(0, 80))).toBeLessThanOrEqual(390);
  }
  await page.screenshot({ path: ".local-stack/browser-shots/dashboard-flow-routine.png", fullPage: true });
});

test("Home: today's routine marks a step done in one tap, and it is still done after a reload", async ({ page }) => {
  await signIn(page, U.routine!.phoneNumber);
  await page.goto("/routine");
  const addSection = page.locator("section", { has: page.getByRole("heading", { name: R.add }) });
  await addSection.getByLabel(R.product).selectOption({ index: 1 });
  const name = (await addSection.getByLabel(R.product).locator("option:checked").textContent())!;
  const saved = page.waitForResponse((r) => r.url().includes("/api/routine/events") && r.request().method() === "POST" && r.ok());
  await addSection.getByRole("button", { name: R.addButton, exact: true }).click();
  await saved;

  await desktop(page); // TD-48: the Home v2 content is the desktop Home
  await page.goto("/dashboard");
  const today = page.locator("section", { has: page.getByRole("heading", { name: R.todayTitle }) });
  // TD-47: one-tap "Mark done" (a used event); the timeline on Checks shows the entry.
  const used = today.getByRole("button", { name: H.routine.markDoneLabel(name, R.slot.AM.toLowerCase()) });
  await used.click();
  await expect(used).toHaveAttribute("aria-pressed", "true");
  // Saved as a routine event: still done after a reload.
  await page.reload();
  await expect(today.getByRole("button", { name: H.routine.markDoneLabel(name, R.slot.AM.toLowerCase()) })).toHaveAttribute("aria-pressed", "true");
  await shot(page, "home-routine");
});

test("Ask Echo, back to the dashboard, a new check starts at the questions", async ({ page }) => {
  await signIn(page, U.echo!.phoneNumber);
  await desktop(page); // TD-48: the Home v2 content is the desktop Home
  await page.goto("/dashboard");
  await page.getByRole("button", { name: C.chat.button }).click();
  await expect(page).toHaveURL(/\/echo/);
  await page.goBack();
  await page.getByRole("link", { name: H.banner.start }).click();
  // TD-44: the questions choice is the first screen of a check that starts afresh.
  await expect(page.getByRole("heading", { name: Q.title, exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your photo reading" })).toHaveCount(0);
});

test("Echo opened from the nav or after a refresh talks about the newest check; no reading leads to a new check", async ({ page }) => {
  await signIn(page, U.echo!.phoneNumber);
  await page.goto("/echo");
  await expect(page.getByRole("textbox")).toBeEnabled();
  // The readings of the check being discussed, with the fixed line, in the fold-away panel on a phone.
  await page.getByText(E.readingsSummary).click();
  await expect(page.getByText(C.history.pastLine).first()).toBeVisible();
  // TD-40: the same five-reading table as the results, Home and an opened check.
  await expect(page.getByRole("table", { name: C.table.caption }).first().getByRole("columnheader")).toHaveCount(6);
  await expect(page.locator("main")).not.toContainText(/\/100|Dryness|Pores/);
  await page.reload();
  await expect(page.getByRole("textbox")).toBeEnabled();
  await expect(page.getByText(/We lost your check-in/)).toHaveCount(0);
  await shot(page, "echo-direct");
});

test("Echo with no photo reading: a designed empty state with a way to a new check", async ({ page }) => {
  await signIn(page, U.noreading!.phoneNumber);
  await page.goto("/echo");
  await expect(page.getByText(C.chat.needsReading)).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: E.newCheck })).toHaveAttribute("href", "/skin-check");
});

test("K-1 fixed: Echo's back link after a dashboard hand-off returns to the dashboard", async ({ page }) => {
  await signIn(page, U.echo!.phoneNumber);
  await desktop(page); // TD-48: the Home v2 content is the desktop Home
  await page.goto("/dashboard");
  await page.getByRole("button", { name: C.chat.button }).click();
  await expect(page).toHaveURL(/\/echo/);
  await page.getByRole("link", { name: "Back to your skin checks" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
});

test("account: sign-in lands on Home; the account page has the sign-in, privacy and delete, and no second history list", async ({ page }) => {
  await signIn(page, U.withdraw!.phoneNumber); // the helper asserts the sign-in went to /dashboard (TD-24 (3))
  await page.goto("/account");
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  await expect(page.getByRole("heading", { name: C.privacy.title })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delete your account" })).toBeVisible();
  await expect(page.getByText(C.history.kind.reading)).toHaveCount(0);
  await expect(page.getByRole("main")).not.toContainText(/\bscans?\b/i);
  await shot(page, "account");
});

test("delete the account, sign in again, no history", async ({ page }) => {
  await signIn(page, U.erase!.phoneNumber);
  await page.goto("/checks");
  await expect(page.getByText(C.history.kind.reading).first()).toBeVisible();
  await page.goto("/account#delete-account");
  await page.getByRole("button", { name: "Delete my account and data" }).click();
  await page.getByLabel(/to confirm/).fill(ERASE_CONFIRMATION);
  await page.getByRole("button", { name: "Delete permanently" }).click();
  await expect(page.getByText("Your account and your data have been deleted.")).toBeVisible({ timeout: 60_000 });

  await signIn(page, U.erase!.phoneNumber);
  await desktop(page); // TD-48: the Home v2 content is the desktop Home
  await page.goto("/dashboard");
  await expect(page.getByText(H.latest.none)).toBeVisible();
  await expect(page.getByText(C.history.title)).toHaveCount(0);
  await shot(page, "after-delete");
});

// TD-18 O-D3: the dashboard is reached from the signed-in start page and /account (the results screen is pinned in tests/dashboard-copy.test.ts).
test("O-D3: the signed-in start page and the account page link to the dashboard; signed out, no link", async ({ page }) => {
  await page.goto("/skin-check");
  // TD-44: the choice is the start page now, not the name question.
  await expect(page.getByRole("heading", { name: Q.title, exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: C.entryLink })).toHaveCount(0);

  await signIn(page, U.one!.phoneNumber);
  await page.goto("/skin-check");
  await page.getByRole("link", { name: C.entryLink }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();

  await page.goto("/account");
  await page.getByRole("link", { name: C.entryLink }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

// TD-25 (6) replaces R-5: one history list. Every check is on /checks with
// the dashboard's own labels; /account lists none.
for (const key of ["noreading", "legacy", "building"] as const) {
  test(`one history list: /checks labels every check the dashboard way, /account lists none (${key})`, async ({ page }) => {
    const user = U[key]!;
    const kinds = Object.values(C.history.kind);
    const label = new RegExp(`^(${kinds.join("|")})$`);
    await signIn(page, user.phoneNumber);
    await page.goto("/checks");
    const list = page.locator("section", { has: page.getByRole("heading", { name: C.history.title }) });
    await expect(list.getByText(label).first()).toBeVisible();
    expect(await list.getByText(label).allTextContents()).toHaveLength(user.checks.length);
    await page.goto("/account");
    await expect(page.getByRole("heading", { name: C.privacy.title })).toBeVisible();
    await expect(page.getByRole("main").getByText(label)).toHaveCount(0);
  });
}
