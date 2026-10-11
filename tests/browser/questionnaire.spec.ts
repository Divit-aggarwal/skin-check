import { mkdirSync, readFileSync } from "node:fs";
import { devices, expect, test, type Page } from "@playwright/test";
import { questionMinutes, questionSteps, PRODUCT_NAME_MAX } from "@/lib/skin-check-validation";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { CAPTURE_COPY as K } from "@/components/skin-check/captureStates";
import { PRODUCT_NAME_PRIVACY_LINE } from "@/components/skin-check/inputs/ProductNameBox";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { Q_SEED, SEEDED_NAMES, WIDTHS, type Width } from "./seed-questionnaire";
import { completePhoneForm, signIn, skipQuestions } from "./helpers";

// TD-33 (docs/design/optional-questionnaire.md): the choice screen, skipping,
// answering later, the product-name boxes and the camera states, at a phone
// (390), a tablet (768) and a laptop (1280). AFTER_SHOTS=1 writes the
// screenshots to docs/design/after/; otherwise they stay under .local-stack/.

const FACE = process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png";
const DIR = process.env.AFTER_SHOTS ? "docs/design/after" : ".local-stack/browser-shots";
mkdirSync(DIR, { recursive: true });
const shot = async (page: Page, name: string, width: Width) => {
  await page.waitForTimeout(400); // entrance animations
  await page.screenshot({ path: `${DIR}/${name}-${width}.png`, fullPage: true });
};

// TD-44: before gender is known the first screen says "up to" the most any gender gets.
const MOST = Math.max(...["female", "male", "other"].map((gender) => questionSteps({ gender }).length));

// The device decides the capture path (file input on phones and tablets, the
// webcam on a laptop), so each width is its own device, not only a viewport.
const device = (name: string) => {
  // Per-describe use() may not change the browser type; the config's chromium stays.
  const { defaultBrowserType: _, ...rest } = devices[name]!;
  return rest;
};
const DEVICE: Record<Width, Parameters<typeof test.use>[0]> = {
  "390": { ...device("iPhone 13"), viewport: { width: 390, height: 844 } },
  "768": { ...device("iPad Mini"), viewport: { width: 768, height: 1024 } },
  // The fake camera flags are in playwright.config.ts (a launch option is per worker).
  "1280": { ...device("Desktop Chrome"), viewport: { width: 1280, height: 800 }, permissions: ["camera"] },
};

const choice = (page: Page) => page.getByRole("heading", { name: Q.title, exact: true });

/** TD-44: the choice first, then name, age and gender. */
async function aboutYou(page: Page, pick: "answer" | "skip") {
  await page.goto("/skin-check");
  await expect(choice(page)).toBeVisible({ timeout: 60_000 });
  if (pick === "skip") await skipQuestions(page);
  else await page.getByRole("button", { name: Q.answerNow }).click();
  await basics(page);
}

async function basics(page: Page) {
  const name = page.locator('input[type="text"]').first();
  await expect(name).toBeVisible({ timeout: 60_000 });
  await name.fill("Tester");
  await name.press("Enter");
  await page.getByRole("button", { name: "25–34", exact: true }).click();
  await page.getByRole("button", { name: "Female", exact: true }).click();
}

for (const width of WIDTHS) {
  test.describe(`TD-33 at ${width}px`, () => {
    test.use(DEVICE[width]);

    test("the choice screen: count and time from the real list, honest about skipping, keyboard reachable", async ({ page }) => {
      await signIn(page, Q_SEED.flow[width].phoneNumber);
      // TD-44: the choice is the first screen, before About you, so the count is "up to".
      await page.goto("/skin-check");
      await expect(choice(page)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByText(Q.howMany(MOST, questionMinutes(MOST), true))).toBeVisible();
      for (const line of Q.skip) await expect(page.getByText(line)).toBeVisible();
      const answer = page.getByRole("button", { name: Q.answerNow });
      const skip = page.getByRole("button", { name: Q.skipAsk, exact: true });
      await expect(answer).toBeVisible();
      await expect(skip).toBeVisible();
      // Big enough to tap: 48px or more.
      for (const b of [answer, skip]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      await shot(page, "questions-choice", width);
      // Keyboard: the two choices are reachable and work with Enter.
      await answer.focus();
      await expect(answer).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(skip).toBeFocused();
      // TD-44: nothing comes before the choice; back from About you comes back to it.
      // Disabled and invisible on the first screen, so hidden from the accessibility tree.
      await expect(page.getByRole("button", { name: "Go back", includeHidden: true })).toBeDisabled();
      await answer.click();
      await expect(page.getByText("Hi! What's your name?")).toBeVisible();
      await page.getByRole("button", { name: "Go back" }).click();
      await expect(choice(page)).toBeVisible();
      // Skip asks first; Escape closes the pop-up and is not a skip.
      await skip.focus();
      await page.keyboard.press("Enter");
      const sure = page.getByRole("dialog", { name: Q.confirmTitle });
      await expect(sure).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(sure).toBeHidden();
      await expect(choice(page)).toBeVisible();
      await skipQuestions(page);
      await basics(page);
      // Skip: on to the photo step (verify passes for a signed-in user), no question screen.
      await expect(page.getByText("What are your main skin concerns?")).toHaveCount(0);
      await expect(page.getByText(/a quick photo of your face, so we can read your skin/)).toBeVisible();
      await expect(page.getByRole("button", { name: K.open })).toBeVisible();
    });

    test("camera states: before permission, then the device's own path", async ({ page }) => {
      await signIn(page, Q_SEED.flow[width].phoneNumber);
      await aboutYou(page, "skip");
      const open = page.getByRole("button", { name: K.open });
      await expect(open).toBeVisible();
      expect((await open.boundingBox())!.height).toBeGreaterThanOrEqual(48);
      await expect(page.getByText(width === "1280" ? K.nextLaptop : K.nextPhone)).toBeVisible();
      // The button names what happens next for a screen reader too.
      await expect(open).toHaveAttribute("aria-describedby", "camera-next");
      await shot(page, "capture-before", width);
      if (width === "1280") {
        // Asked only now, from the button: the fake camera answers and the preview starts.
        await open.click();
        const take = page.getByRole("button", { name: K.take });
        // Chrome's fake webcam sometimes fails to start the first time (seen
        // 2026-10-10). The page then shows "Your camera didn't start" with Try
        // again, and that recovery path is what a user would take.
        const retry = page.getByRole("button", { name: K.tryAgain });
        await expect(take.or(retry)).toBeVisible({ timeout: 30_000 });
        if (await retry.isVisible()) await retry.click();
        await expect(take).toBeFocused({ timeout: 30_000 });
        await expect(page.getByText(K.ready)).toBeVisible();
        await shot(page, "capture-ready", width);
        await page.keyboard.press("Enter");
      } else {
        await page.getByText(K.phoneHelp).click();
        for (const h of K.how) await expect(page.getByText(h.steps)).toBeVisible();
        await shot(page, "capture-before-help", width);
        await page.locator('input[type="file"]').setInputFiles({ name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
      }
      // After the photo: a clear retake choice next to the consents and Analyze.
      await expect(page.getByRole("button", { name: K.retake })).toBeVisible();
      await expect(page.getByRole("button", { name: "Analyze my skin" })).toBeVisible();
      await shot(page, "capture-after", width);
    });

    if (width === "1280") {
      test("camera refused: how to allow it, and Try again", async ({ page }) => {
        await page.addInitScript(() => {
          navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException("Permission denied", "NotAllowedError"));
        });
        await signIn(page, Q_SEED.flow[width].phoneNumber);
        await aboutYou(page, "skip");
        await page.getByRole("button", { name: K.open }).click();
        // Only the title is the alert (announced once); the how-to and Try again sit in its box.
        const alert = page.getByRole("alert").filter({ hasText: K.refusedTitle });
        await expect(alert).toBeVisible();
        const box = alert.locator("..");
        for (const h of K.how) await expect(box.getByText(h.steps)).toBeVisible();
        await expect(box.getByRole("button", { name: K.tryAgain })).toBeVisible();
        await shot(page, "capture-refused", width);
      });

      test("camera loading: a status line while the browser asks", async ({ page }) => {
        await page.addInitScript(() => {
          navigator.mediaDevices.getUserMedia = () => new Promise(() => undefined);
        });
        await signIn(page, Q_SEED.flow[width].phoneNumber);
        await aboutYou(page, "skip");
        await page.getByRole("button", { name: K.open }).click();
        await expect(page.getByRole("status").filter({ hasText: K.loading })).toBeVisible();
        await shot(page, "capture-loading", width);
      });
    }

    test("skipped check: Home and Account cards, Echo's notice, then answering later with the name boxes", async ({ page }) => {
      test.setTimeout(240_000);
      await signIn(page, Q_SEED.skipped[width].phoneNumber);
      // Home: the readings are there, and the card under them.
      await expect(page.getByRole("heading", { name: Q.cardTitle })).toBeVisible();
      await expect(page.getByRole("heading", { name: C.current.title })).toBeVisible();
      await shot(page, "home-questions-card", width);
      await page.goto("/account");
      await expect(page.getByRole("heading", { name: Q.cardTitle })).toBeVisible();
      await shot(page, "account-questions-card", width);
      await page.goto("/echo");
      await expect(page.getByText(Q.echoNotice)).toBeVisible({ timeout: 30_000 });
      await shot(page, "echo-questions-notice", width);
      await page.getByRole("link", { name: Q.answerLink }).click();
      await expect(page).toHaveURL(/\/questions$/);

      // Part 1 (Your skin): the first option of each, and both name boxes.
      await expect(page.getByText("Part 1 of 4")).toBeVisible();
      await shot(page, "questions-page", width);
      const box = (label: RegExp) => page.getByRole("textbox", { name: label });
      const rx = page.getByRole("button", { name: /A prescription product/ });
      const other = page.getByRole("button", { name: /^Other products$/ });
      await rx.click();
      await expect(box(/Which prescription product/)).toBeVisible();
      await expect(page.getByText(PRODUCT_NAME_PRIVACY_LINE).first()).toBeVisible();
      // Plain text, 200 at most, with a visible counter.
      await box(/Which prescription product/).fill("x".repeat(PRODUCT_NAME_MAX + 10));
      await expect(box(/Which prescription product/)).toHaveValue("x".repeat(PRODUCT_NAME_MAX));
      await expect(page.getByText(`${PRODUCT_NAME_MAX} / ${PRODUCT_NAME_MAX}`)).toBeVisible();
      // Unpick hides it and clears it; pick again starts empty.
      await rx.click();
      await expect(box(/Which prescription product/)).toHaveCount(0);
      await rx.click();
      await expect(box(/Which prescription product/)).toHaveValue("");
      await box(/Which prescription product/).fill("Adapalene gel");
      await other.click();
      await box(/Which other products/).fill("A sunscreen from the chemist");
      await expect(page.getByText("13 / 200")).toBeVisible();
      await shot(page, "questions-name-boxes", width);

      // Every other question in each part: its first option.
      for (let part = 1; part <= 4; part++) {
        const groups = page.locator("[data-step]:not([data-step='current_products'])");
        const count = await groups.count();
        for (let i = 0; i < count; i++) await groups.nth(i).locator("button:not([aria-label])").first().click();
        const next = page.getByRole("button", { name: part < 4 ? Q.continue : Q.save });
        await expect(next).not.toHaveAttribute("aria-disabled", "true");
        await next.click();
      }
      await expect(page.getByRole("heading", { name: Q.saved })).toBeVisible({ timeout: 30_000 });
      await shot(page, "questions-saved", width);

      // Home no longer asks; Echo no longer shows the notice.
      await page.goto("/dashboard");
      await expect(page.getByRole("heading", { name: C.current.title })).toBeVisible();
      await expect(page.getByRole("heading", { name: Q.cardTitle })).toHaveCount(0);
      await page.goto("/echo");
      await expect(page.getByRole("log")).toBeVisible({ timeout: 30_000 });
      await expect(page.getByText(Q.echoNotice)).toHaveCount(0);
      // The opened check shows the names back to their owner.
      await page.goto(`/checks/${Q_SEED.skipped[width].uid}-1`);
      await expect(page.getByText("Adapalene gel")).toBeVisible();
      await expect(page.getByText("A sunscreen from the chemist")).toBeVisible();
    });
  });
}

test("an opened check shows its own product names; Home and Echo never do", async ({ page }) => {
  await signIn(page, Q_SEED.named.phoneNumber);
  await expect(page.getByRole("heading", { name: C.current.title })).toBeVisible();
  for (const n of Object.values(SEEDED_NAMES)) await expect(page.getByText(n)).toHaveCount(0);
  await page.goto(`/checks/${Q_SEED.named.uid}-1`);
  await expect(page.getByRole("heading", { name: Q.namedTitle })).toBeVisible();
  for (const n of Object.values(SEEDED_NAMES)) await expect(page.getByText(n)).toBeVisible();
  await shot(page, "check-named-products", "390");
  await page.goto("/echo");
  await expect(page.getByRole("log")).toBeVisible({ timeout: 30_000 });
  for (const n of Object.values(SEEDED_NAMES)) await expect(page.getByText(n)).toHaveCount(0);
});

// TD-44: the three screenshots at 390 go to docs/design/after-choice-first/ with AFTER_SHOTS=1.
const CF_DIR = process.env.AFTER_SHOTS ? "docs/design/after-choice-first" : ".local-stack/browser-shots";
mkdirSync(CF_DIR, { recursive: true });

test.describe("TD-44: the choice is the first page", () => {
  test.use(DEVICE["390"]);

  test("a new visitor lands on it; skip asks 'are you sure?' first; 'Skip for now' reaches the photo with no question screen", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/skin-check$/);
    await expect(choice(page)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(Q.howMany(MOST, questionMinutes(MOST), true))).toBeVisible();
    await expect(page.getByText("Hi! What's your name?")).toHaveCount(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CF_DIR}/choice-first-390.png`, fullPage: true });

    await page.getByRole("button", { name: Q.skipAsk, exact: true }).click();
    const sure = page.getByRole("dialog", { name: Q.confirmTitle });
    await expect(sure).toBeVisible();
    // Focus moves in, onto the safer choice; both buttons are easy to tap.
    const answer = sure.getByRole("button", { name: Q.answerLink, exact: true });
    const skip = sure.getByRole("button", { name: Q.skipNow, exact: true });
    await expect(answer).toBeFocused();
    for (const b of [answer, skip]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(48);
    for (const line of [Q.confirmWhy, Q.confirmStored, Q.confirmEcho, Q.confirmHidden, Q.confirmLater]) await expect(sure.getByText(line)).toBeVisible();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CF_DIR}/skip-confirm-390.png` });

    // Escape closes it and is not a skip.
    await page.keyboard.press("Escape");
    await expect(sure).toBeHidden();
    await expect(choice(page)).toBeVisible();

    await skipQuestions(page);
    await basics(page);
    // Verify: the phone sign-in inside the check, then the photo step with its consents.
    await completePhoneForm(page, Q_SEED.flow["390"].phoneNumber);
    await expect(page.getByRole("button", { name: K.open })).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText("What are your main skin concerns?")).toHaveCount(0);
    await expect(choice(page)).toHaveCount(0);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${CF_DIR}/skip-photo-step-390.png`, fullPage: true });
  });

  test("'Answer the questions' in the pop-up: About you, the photo, then the questions", async ({ page }) => {
    // The scan is refused, so nothing is analysed or saved; the flow still moves on to the questions.
    await page.route((url) => url.pathname === "/api/skin-scan", (route) => route.abort());
    await signIn(page, Q_SEED.flow["390"].phoneNumber);
    await page.goto("/skin-check");
    await expect(choice(page)).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: Q.skipAsk, exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: Q.answerLink, exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await basics(page);
    await page.locator('input[type="file"]').setInputFiles({ name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
    await page.getByRole("checkbox").first().check();
    await page.getByRole("button", { name: "Analyze my skin" }).click();
    await expect(page.getByText("What are your main skin concerns?")).toBeVisible({ timeout: 60_000 });
    // Shown once: never again after About you.
    await expect(choice(page)).toHaveCount(0);
  });
});

test("a returning user who skipped gets the choice again, and no re-confirm hints", async ({ page }) => {
  // The scan is refused, so nothing is analysed; the flow still moves on to the questions.
  await page.route((url) => url.pathname === "/api/skin-scan", (route) => route.abort());
  await signIn(page, Q_SEED.returning.phoneNumber);
  await page.goto("/skin-check");
  await expect(choice(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Hi! What's your name?")).toHaveCount(0);
  await page.getByRole("button", { name: Q.answerNow }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Analyze my skin" }).click();
  await expect(page.getByText("What are your main skin concerns?")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(/Last time you said/)).toHaveCount(0);
});

test("skip end to end: the check is saved with its readings, and Home offers the questions", async ({ page }) => {
  test.setTimeout(420_000);
  await signIn(page, Q_SEED.skipFlow.phoneNumber);
  await aboutYou(page, "skip");
  await page.locator('input[type="file"]').setInputFiles({ name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Analyze my skin" }).click();
  // No question sections: straight to the last step.
  await expect(page.getByText("What are your main skin concerns?")).toHaveCount(0);
  // The button reads "Analyzing your photo…" until the reading lands (about a minute under emulation).
  const results = page.getByRole("button", { name: "Get my results" });
  await expect(results).toBeEnabled({ timeout: 300_000 });
  await results.click();
  await expect(page.getByRole("heading", { name: "Your photo reading" })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(Q.skippedNote)).toBeVisible();
  await shot(page, "results-skipped", "390");
  const today = new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
  await expect(async () => {
    await page.goto("/dashboard");
    await expect(page.getByText(C.current.checkedOn(today))).toBeVisible({ timeout: 5_000 });
  }).toPass({ timeout: 120_000, intervals: [5_000] });
  await expect(page.getByRole("heading", { name: Q.cardTitle })).toBeVisible();
});
