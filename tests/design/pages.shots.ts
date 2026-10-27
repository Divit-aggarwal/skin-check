import { readFileSync, mkdirSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { DASHBOARD_SEED as U } from "../browser/seed-users";
import { signIn } from "../browser/helpers";
import { SECTIONS } from "@/lib/skin-check-steps";

// One screenshot per page and state at each width, into docs/design/<SHOTS>/.
const DIR = `docs/design/${process.env.SHOTS ?? "before"}`;
mkdirSync(DIR, { recursive: true });
const FACE = process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png";
const FS = process.env.PW_FIRESTORE_HOST!;

async function shots(page: Page, name: string) {
  await page.waitForTimeout(600); // entrance animations
  await page.screenshot({ path: `${DIR}/${name}-${test.info().project.name}.png`, fullPage: true });
}

const NAME_PROMPT = "Hi! What's your name?";

// One screenshot per check question (G03 quiz brief), named by the step id.
const STEPS = SECTIONS.flatMap((s) => s.steps);
const shotQuestions = new Set<string>();
async function question(page: Page) {
  const text = ((await page.locator("p.font-display").last().textContent({ timeout: 5_000 }).catch(() => "")) ?? "").trim();
  const step = STEPS.find((s) => s.prompt.replace(/\{name\}/g, "Tester") === text);
  const key = `${test.info().project.name}-${step?.id}`;
  if (!step || shotQuestions.has(key)) return;
  shotQuestions.add(key);
  await shots(page, `question-${step.id}`);
}

const signedOut = ["/skin-check", "/dashboard", "/routine", "/echo", "/account"];
for (const path of signedOut) {
  test(`signed out ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    if (path === "/skin-check") await expect(page.getByText(NAME_PROMPT)).toBeVisible({ timeout: 60_000 });
    await shots(page, `signed-out${path.replace("/", "-")}`);
  });
}

const dashStates = ["empty", "one", "building", "set", "boundary", "legacy", "noreading", "unreadable", "newer"] as const;
for (const s of dashStates) {
  test(`dashboard ${s}`, async ({ page }) => {
    await signIn(page, U[s]!.phoneNumber);
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
    await page.waitForTimeout(1500);
    await shots(page, `dashboard-${s}`);
  });
}

test("dashboard loading and error", async ({ page }) => {
  await signIn(page, U.one!.phoneNumber);
  const fs = (url: URL) => url.host === FS;
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(fs, async (route) => { await held; await route.continue().catch(() => undefined); });
  await page.goto("/dashboard");
  await expect(page.getByText(C.loading)).toBeVisible();
  await shots(page, "dashboard-loading");
  release();
  await page.unroute(fs);
  await page.route(fs, (route) => route.abort());
  await page.goto("/dashboard");
  await expect(page.getByText(C.error)).toBeVisible({ timeout: 30_000 });
  await shots(page, "dashboard-error");
});

test("checks: list with a kept photo, opened check, not found", async ({ page }) => {
  await signIn(page, U.kept!.phoneNumber);
  await page.goto("/checks");
  await expect(page.getByRole("link", { name: /Open the check from/ }).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shots(page, "checks-list");
  await page.goto("/checks/seed-dash-kept-1");
  await expect(page.getByText(/Photos differ in light and angle/).first()).toBeVisible();
  await page.waitForTimeout(1500);
  await shots(page, "check-opened");
  await page.goto("/checks/not-a-check");
  await expect(page.getByText("This check could not be found.").first()).toBeVisible();
  await shots(page, "check-not-found");
});

test("checks: empty", async ({ page }) => {
  await signIn(page, U.empty!.phoneNumber);
  await page.goto("/checks");
  await page.waitForTimeout(1500);
  await shots(page, "checks-empty");
});

test("checks: timeline with routine entries", async ({ page }) => {
  await signIn(page, "+919999900001"); // seed user Asha: checks and routine events
  await page.goto("/checks?view=timeline");
  await page.waitForTimeout(2000);
  await shots(page, "checks-timeline");
});

test("routine empty and with products", async ({ page }) => {
  await signIn(page, U.routine!.phoneNumber);
  await page.goto("/routine");
  await page.waitForTimeout(1500);
  await shots(page, "routine-current");
  const add = page.locator("section", { has: page.getByRole("heading", { name: "Add a product" }) });
  if (await add.count()) {
    await add.getByLabel("Product").selectOption({ index: 1 });
    await add.getByRole("button", { name: "Add", exact: true }).click();
    const used = page.getByRole("button", { name: /^Used: / }).first();
    await used.click();
    await expect(used).toHaveAttribute("aria-pressed", "true");
    await page.waitForTimeout(1000);
    await shots(page, "routine-with-product");
  }
});

test("echo: direct visit and before consent", async ({ page }) => {
  await signIn(page, U.echo!.phoneNumber);
  await page.goto("/echo");
  await page.waitForTimeout(1500);
  await shots(page, "echo-direct-visit");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: C.chat.button }).click();
  await expect(page).toHaveURL(/\/echo/);
  await page.waitForTimeout(1500);
  await shots(page, "echo-not-asked");
  await page.getByRole("textbox").fill("What does this photo reading show?");
  await page.getByRole("button", { name: "Send" }).click();
  await page.waitForTimeout(1500);
  await shots(page, "echo-consent-prompt");
});

test("echo with sharing on", async ({ page }) => {
  await signIn(page, U.withdraw!.phoneNumber);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: C.chat.button }).click();
  await expect(page).toHaveURL(/\/echo/);
  await page.waitForTimeout(1500);
  await shots(page, "echo-shared");
});

test("account signed in", async ({ page }) => {
  await signIn(page, U.one!.phoneNumber);
  await page.goto("/account");
  await page.waitForTimeout(1500);
  await shots(page, "account-signed-in");
});

test("check flow: questions, under 18, photo step, retake", async ({ page }) => {
  await page.goto("/skin-check");
  await expect(page.getByText(NAME_PROMPT)).toBeVisible({ timeout: 60_000 });
  await shots(page, "flow-start");
  const name = page.locator('input[type="text"]').first();
  await name.fill("Tester");
  await name.press("Enter");
  await page.getByRole("button", { name: "<18", exact: true }).click();
  await page.getByRole("button", { name: "Female", exact: true }).click();
  await expect(page.getByText("You chose under 18. Is that right?")).toBeVisible();
  await shots(page, "flow-under18-confirm");
  await page.getByRole("button", { name: /Yes, I.m under 18/ }).click();
  await expect(page.getByText(/isn't available yet for users under 18/)).toBeVisible();
  await shots(page, "flow-under18-blocked");
});

test("check flow: a dark photo asks for a retake", async ({ page }) => {
  test.skip(test.info().project.name === "1280", "the desktop takes photos from the camera, not a file");
  await signIn(page, U.returning!.phoneNumber);
  await page.goto("/skin-check");
  const file = page.locator('input[type="file"]');
  await expect(file).toBeAttached({ timeout: 30_000 });
  const dataUrl = await page.evaluate(() => {
    const c = document.createElement("canvas");
    c.width = 800;
    c.height = 1000;
    const g = c.getContext("2d")!;
    g.fillStyle = "rgb(4,4,4)";
    g.fillRect(0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  });
  const dark = { name: "dark.png", mimeType: "image/png", buffer: Buffer.from(dataUrl.split(",")[1]!, "base64") };
  await file.setInputFiles(dark);
  await expect(page.getByRole("button", { name: "Retake" })).toBeVisible();
  await shots(page, "flow-retake");
  for (let i = 0; i < 5 && !(await page.getByRole("button", { name: "Use this photo anyway" }).isVisible()); i++) {
    await page.getByRole("button", { name: "Retake" }).click();
    await file.setInputFiles(dark);
    await page.waitForTimeout(800);
  }
  await shots(page, "flow-retake-use-anyway");
});

test("account: delete confirmation open (not submitted)", async ({ page }) => {
  await signIn(page, U.withdraw!.phoneNumber);
  await page.goto("/account#delete-account");
  await page.getByRole("button", { name: "Delete my account and data" }).click();
  await expect(page.getByLabel(/to confirm/)).toBeVisible();
  await shots(page, "account-delete-confirm");
});

// Phone and tablet choose a photo file; the desktop takes a frame from the fake
// webcam (playwright.config.ts) and, when the photo checks ask for a retake,
// uses "Use this photo anyway" after the set number of retakes.
const FLOW_USER = { "390": U.capture!, "768": U.scan!, "1280": U.empty! };
test("check flow to results", async ({ page }) => {
  test.setTimeout(600_000);
  // FLOW_USER=<seed key> picks another user with no checks for a rerun on the same stack.
  const user = process.env.FLOW_USER ? U[process.env.FLOW_USER]! : FLOW_USER[test.info().project.name as keyof typeof FLOW_USER];
  await signIn(page, user.phoneNumber);
  await page.goto("/skin-check");
  // TD-44: the choice is the first screen.
  await expect(page.getByRole("button", { name: "Answer the questions now" })).toBeVisible({ timeout: 60_000 });
  await shots(page, "flow-questions-choice");
  await page.getByRole("button", { name: "Answer the questions now" }).click();
  const name = page.locator('input[type="text"]').first();
  await expect(name).toBeVisible({ timeout: 60_000 });
  await question(page);
  await name.fill("Tester");
  await name.press("Enter");
  await page.waitForTimeout(700);
  await question(page);
  await page.getByRole("button", { name: "25–34", exact: true }).click();
  await shots(page, "flow-questions");
  await question(page);
  await page.getByRole("button", { name: "Female", exact: true }).click();
  const file = page.locator('input[type="file"]');
  // G16: the laptop asks for the camera from "Open camera"; then "Take photo".
  const open = page.getByRole("button", { name: "Open camera", exact: true });
  const capture = page.getByRole("button", { name: "Take photo", exact: true });
  await expect(open).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await shots(page, "flow-photo-step");
  await question(page);
  if (!(await file.count())) await open.click();
  if (await file.count()) {
    await file.setInputFiles({ name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
  } else {
    await expect(capture).toBeEnabled({ timeout: 30_000 });
    await capture.click();
    const anyway = page.getByRole("button", { name: "Use this photo anyway" });
    for (let i = 0; i < 6 && !(await anyway.isVisible()); i++) {
      await page.waitForTimeout(1000);
      if (await anyway.isVisible()) break;
      const retake = page.getByRole("button", { name: "Retake photo", exact: true });
      if (!(await retake.isVisible())) break;
      await retake.click();
      await capture.click();
    }
    if (await anyway.isVisible()) await anyway.click();
  }
  await page.waitForTimeout(1500);
  await shots(page, "flow-photo-chosen");
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Analyze my skin" }).click();
  await expect(page.getByText("What are your main skin concerns?")).toBeVisible({ timeout: 60_000 });
  await shots(page, "flow-after-photo");
  // Answer every remaining question with its first option until the results show.
  const results = page.getByRole("heading", { name: "Your photo reading" });
  for (let i = 0; i < 80 && !(await results.isVisible()); i++) {
    await question(page);
    const step = page.locator("div.flex.flex-col.gap-5").last();
    const confirm = step.getByRole("button", { name: "Confirm selection" });
    const options = step.locator("button:not([aria-label])");
    if (await confirm.count()) {
      if (await confirm.isDisabled()) await options.first().click();
      await confirm.click();
    } else if (await options.count()) {
      await options.first().click();
    }
    await page.waitForTimeout(700);
  }
  await expect(results).toBeVisible({ timeout: 240_000 });
  await page.waitForTimeout(3000);
  await shots(page, "flow-results");
});

// The two questions the flow above never reaches: the phone check (signed out
// only) and the male-only question. The scan request is blocked, so nothing
// is saved: the check is written only at the end of the flow.
test("check flow: the phone question, signed out", async ({ page }) => {
  await page.goto("/skin-check");
  await page.getByRole("button", { name: "Answer the questions now" }).click(); // TD-44: the choice comes first
  const name = page.locator('input[type="text"]').first();
  await expect(name).toBeVisible({ timeout: 60_000 });
  await name.fill("Tester");
  await name.press("Enter");
  await page.getByRole("button", { name: "25–34", exact: true }).click();
  await page.getByRole("button", { name: "Male", exact: true }).click();
  await expect(page.getByText(/let's confirm it's you/)).toBeVisible();
  await question(page);
});

test("check flow: the male-only question (nothing saved)", async ({ page }) => {
  test.setTimeout(300_000);
  await page.route((url) => url.pathname === "/api/skin-scan", (route) => route.abort());
  await signIn(page, U.routine!.phoneNumber); // no checks, so the full flow; nothing is saved
  await page.goto("/skin-check");
  await page.getByRole("button", { name: "Answer the questions now" }).click(); // TD-44: the choice comes first
  const name = page.locator('input[type="text"]').first();
  await expect(name).toBeVisible({ timeout: 60_000 });
  await name.fill("Tester");
  await name.press("Enter");
  await page.getByRole("button", { name: "25–34", exact: true }).click();
  await page.getByRole("button", { name: "Male", exact: true }).click();
  const file = page.locator('input[type="file"]');
  // G16: the laptop asks for the camera from "Open camera"; then "Take photo".
  const open = page.getByRole("button", { name: "Open camera", exact: true });
  const capture = page.getByRole("button", { name: "Take photo", exact: true });
  await expect(open).toBeVisible({ timeout: 30_000 });
  await page.waitForTimeout(2000); // the file input replaces the camera button once the page knows the device
  if (!(await file.count())) await open.click();
  if (await file.count()) await file.setInputFiles({ name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
  else {
    await expect(capture).toBeEnabled({ timeout: 30_000 });
    await capture.click();
    const anyway = page.getByRole("button", { name: "Use this photo anyway" });
    for (let i = 0; i < 6 && !(await anyway.isVisible()); i++) {
      await page.waitForTimeout(1000);
      const retake = page.getByRole("button", { name: "Retake photo", exact: true });
      if ((await anyway.isVisible()) || !(await retake.isVisible())) break;
      await retake.click();
      await capture.click();
    }
    if (await anyway.isVisible()) await anyway.click();
  }
  await page.waitForTimeout(1500);
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Analyze my skin" }).click();
  await expect(page.getByText("What are your main skin concerns?")).toBeVisible({ timeout: 60_000 });
  const male = page.getByText((STEPS.find((s) => s.id === "male_skin_context")!).prompt);
  for (let i = 0; i < 40 && !(await male.isVisible()); i++) {
    // Never reach the last step: an error-state check could be saved there (safety review G11).
    await expect(page.getByRole("button", { name: /Get my results/ })).toHaveCount(0);
    const step = page.locator("div.flex.flex-col.gap-5").last();
    const confirm = step.getByRole("button", { name: "Confirm selection" });
    const options = step.locator("button:not([aria-label])");
    if (await confirm.count()) {
      if (await confirm.isDisabled()) await options.first().click();
      await confirm.click();
    } else if (await options.count()) await options.first().click();
    await page.waitForTimeout(700);
  }
  await expect(male).toBeVisible();
  await question(page);
});

// G03 part 4: the local-only recommendation preview (not in production builds).
test("dev: recommendation preview", async ({ page }) => {
  await page.goto("/dev/recommendations");
  await expect(page.getByRole("heading", { name: "Recommendation preview" })).toBeVisible();
  await shots(page, "dev-recommendations");
});
