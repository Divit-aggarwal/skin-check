import { mkdirSync, readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { CAPTURE_COPY as K } from "@/components/skin-check/captureStates";
import { CHECKIN_COPY, START_COPY } from "@/components/skin-check/flowCopy";
import { signIn } from "../browser/helpers";
import { FACE_DARK, MESH_SEED } from "../browser/seed-mesh";

// Redesign lane B (05, 07, 08) review screenshots at 375px into
// docs/design/redesign/capture/. The check-in (08) needs its flag, so run with
//   NEXT_PUBLIC_UI_WEEKLY_CHECKIN=on PW_ARGS="-c tests/design/playwright.config.ts tests/design/redesign-capture.shots.ts --project=390" bash scripts/with-stack-slot.sh npm run test:browser
// Nothing is saved: the photo is never sent (the scan request is held).
const DIR = "docs/design/redesign/capture";
mkdirSync(DIR, { recursive: true });

test.use({ viewport: { width: 375, height: 812 } });

const save = async (page: Page, name: string, fullPage = true) => {
  await page.waitForTimeout(600); // entrance animations
  await page.screenshot({ path: `${DIR}/${name}.png`, fullPage });
};
const choice = (page: Page) => page.getByRole("heading", { name: Q.title, exact: true });
const photo = (page: Page, buffer: Buffer, name = "face.png") => page.locator('input[type="file"]').setInputFiles({ name, mimeType: "image/png", buffer });

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

test("05 start, signed out", async ({ page }) => {
  await page.goto("/skin-check");
  await expect(choice(page)).toBeVisible({ timeout: 60_000 });
  await save(page, "05-start-signed-out");
});

test("05 start with the last check, 08 check-in, 07 capture and the photo wait", async ({ page }) => {
  test.setTimeout(300_000);
  // Held for ever: the photo never reaches the engine and nothing is saved.
  await page.route((url) => url.pathname === "/api/skin-scan", () => new Promise(() => undefined));
  await signIn(page, MESH_SEED.skipped["390"].phoneNumber);
  await page.goto("/skin-check");
  await expect(choice(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(START_COPY.lastTitle)).toBeVisible({ timeout: 30_000 });
  await save(page, "05-start");

  await page.getByRole("button", { name: START_COPY.checkinOpen }).click();
  await expect(page.getByRole("heading", { level: 1, name: CHECKIN_COPY.title })).toBeVisible();
  await page.getByRole("radio", { name: "None" }).click();
  await page.getByRole("radio", { name: "Balanced" }).click();
  await save(page, "08-checkin");
  await page.getByRole("button", { name: CHECKIN_COPY.skip }).click();

  await page.getByRole("button", { name: Q.skipAsk, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: Q.skipNow, exact: true }).click();
  await expect(page.getByRole("button", { name: K.open })).toBeVisible({ timeout: 60_000 });
  await save(page, "07-capture-before");

  await photo(page, await darkPhoto(page), "dark.png");
  await expect(page.getByRole("button", { name: "Analyze my skin" })).toBeVisible();
  await expect(page.getByText("Photo check")).toBeVisible();
  await save(page, "07-capture-retake");

  await page.getByRole("button", { name: K.retake }).click();
  await photo(page, readFileSync(FACE_DARK));
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("button", { name: "Analyze my skin" })).toBeEnabled({ timeout: 30_000 });
  await save(page, "07-capture-after");

  await page.getByRole("button", { name: "Analyze my skin" }).click();
  const scanning = page.getByTestId("scanning-photo");
  await expect(scanning).toBeVisible({ timeout: 60_000 });
  await expect(scanning).toHaveAttribute("data-mesh", "ready", { timeout: 90_000 });
  await save(page, "07-scanning");
});

test("05 for a returning user: the photo step is the start", async ({ page }) => {
  await signIn(page, MESH_SEED.answered["390"].phoneNumber);
  await page.goto("/skin-check");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/skin photo/i, { timeout: 60_000 });
  await expect(page.getByText(START_COPY.lastTitle)).toBeVisible({ timeout: 30_000 });
  await save(page, "05-start-returning");
});
