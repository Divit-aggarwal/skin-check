import { mkdirSync, readFileSync } from "node:fs";
import { test, type Page } from "@playwright/test";
import { signIn } from "../browser/helpers";
import { MMA_SEED as U } from "../browser/seed-mm-a";
import { MMC_SINCE } from "../../scripts/seed-mm-c";

// Polish lane (docs/lanes/polish-report.md): the main signed-in screens, read only,
// at 390, 768 and 1280, into docs/design/<SHOTS>/ so a before and an after set compare.
//   SHOTS=polish-after npx playwright test -c tests/design/playwright.config.ts polish.shots.ts
const DIR = `docs/design/${process.env.SHOTS ?? "polish"}`;
mkdirSync(DIR, { recursive: true });

async function settle(page: Page) {
  await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
}

const ROUTES = [
  ["/dashboard", "today"],
  ["/checks", "checks"],
  ["/checks?view=timeline", "timeline"],
  [`/checks/${U.four.uid}-4`, "check"],
  ["/progress", "progress"],
  ["/progress?view=photos", "photos"],
  ["/routine", "routine"],
  ["/echo", "echo"],
  ["/account", "account"],
] as const;

test("signed-in screens, four checks", async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page, U.four.phoneNumber);
  for (const [path, name] of ROUTES) {
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${DIR}/${name}-${test.info().project.name}.png`, fullPage: true, animations: "disabled" });
  }
});

test("empty account: today and checks", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, U.empty.phoneNumber);
  for (const [path, name] of [["/dashboard", "today-empty"], ["/checks", "checks-empty"], ["/progress", "progress-empty"]] as const) {
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${DIR}/${name}-${test.info().project.name}.png`, fullPage: true, animations: "disabled" });
  }
});

test("products", async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page, MMC_SINCE.phoneNumber);
  for (const [path, name] of [["/products/protecting-sunscreen", "product"], ["/products/niacinamide-serum/since", "since"]] as const) {
    await page.goto(path);
    await settle(page);
    await page.screenshot({ path: `${DIR}/${name}-${test.info().project.name}.png`, fullPage: true, animations: "disabled" });
  }
});

test("check flow: a question step and the photo before consent (phone)", async ({ page }) => {
  test.skip(test.info().project.name !== "390", "phone only");
  test.setTimeout(180_000);
  const shot = (name: string) => page.screenshot({ path: `${DIR}/${name}-390.png`, fullPage: false, animations: "disabled" });
  await signIn(page, U.empty.phoneNumber);
  await page.goto("/skin-check");
  await page.getByRole("button", { name: "Answer the questions now" }).click({ timeout: 60_000 });
  const name = page.locator('input[type="text"]').first();
  await name.fill("Tester");
  await name.press("Enter");
  await page.getByRole("button", { name: "25–34", exact: true }).click();
  await page.waitForTimeout(800);
  await shot("flow-question");
  await page.getByRole("button", { name: "Female", exact: true }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: "face.png", mimeType: "image/png", buffer: readFileSync(process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png") });
  const analyze = page.getByRole("button", { name: "Analyze my skin" });
  await analyze.scrollIntoViewIfNeeded({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot("flow-photo-consent");
});
