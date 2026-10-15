import { expect, test, type Page } from "@playwright/test";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { CAPTURE_COPY as K, GUIDED_COPY as G } from "@/components/skin-check/captureStates";
import { CHECKIN_COPY as C, START_COPY as S } from "@/components/skin-check/flowCopy";
import { LIVE_COPY } from "@/lib/capture-quality/live";
import { signIn } from "../browser/helpers";
import { MESH_SEED } from "../browser/seed-mesh";
import { matchShot } from "./match";

// Mockup match, lane B: 05 start, 07 guided capture, 08 check-in. Both flags on:
//   NEXT_PUBLIC_UI_THREE_ANGLE=on NEXT_PUBLIC_UI_WEEKLY_CHECKIN=on \
//   PW_ARGS="-c tests/design/match.config.ts tests/design/b.match.ts" bash scripts/with-stack-slot.sh npm run test:browser
// The fake camera shows the fixture face (make .local-stack/fake-face.y4m as in tests/design/playwright.config.ts).
// The check-in goes to the real route (one per week for the seeded user); no photo is analysed or saved.
test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--use-file-for-fake-video-capture=.local-stack/fake-face.y4m"] },
});

const choice = (page: Page) => page.getByRole("heading", { name: Q.title, exact: true });
const settle = (page: Page) => page.waitForTimeout(700); // entrance animations

test("05 start with the three angles and the user's own photos", async ({ page }, info) => {
  await signIn(page, MESH_SEED.kept.phoneNumber);
  await page.goto("/skin-check");
  await expect(choice(page)).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText(S.introThree)).toBeVisible();
  await expect(page.getByText(S.lastTitle)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("heading", { name: S.progressTitle })).toBeVisible();
  await settle(page);
  await matchShot(page, info, "05-start");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await settle(page);
  await matchShot(page, info, "05-start-lower");
});

test("08 check-in: answers, saved, already this week (BE3's real route)", async ({ page }, info) => {
  const posts: unknown[] = [];
  page.on("request", (r) => r.method() === "POST" && new URL(r.url()).pathname === "/api/checkins" && posts.push(r.postDataJSON()));
  await signIn(page, MESH_SEED.kept.phoneNumber);
  await page.goto("/skin-check");
  await expect(choice(page)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: S.checkinOpen }).click();
  await expect(page.getByRole("heading", { level: 1, name: C.title })).toBeVisible();
  // Nothing answered: the button says why and sends nothing.
  await expect(page.getByText(C.pickOne)).toBeVisible();
  await page.getByRole("button", { name: C.save }).click();
  expect(posts).toHaveLength(0);
  for (const name of ["A bit better", "None", "Fading", "No", "Balanced"]) await page.getByRole("radio", { name, exact: true }).first().click();
  await settle(page);
  await matchShot(page, info, "08-checkin");
  await page.getByRole("button", { name: C.save }).click();
  // One check-in per week for this user: the first width to run saves it, the others see "already".
  const saved = page.getByRole("heading", { name: C.savedTitle });
  const already = page.getByRole("heading", { name: C.alreadyTitle });
  await expect(saved.or(already)).toBeVisible({ timeout: 30_000 });
  expect(posts[0]).toMatchObject({ answers: { overall: "bit_better", new_breakouts: "none", existing_spots: "fading", routine_changed: "no", skin_feel: "balanced" } });
  if (await saved.isVisible()) await matchShot(page, info, "08-saved");

  await page.getByRole("button", { name: C.done }).click();
  await page.getByRole("button", { name: S.checkinOpen }).click();
  await page.getByRole("radio", { name: "Dry", exact: true }).click();
  await page.getByRole("button", { name: C.save }).click();
  await expect(already).toBeVisible({ timeout: 30_000 });
  await matchShot(page, info, "08-already");
});

test("07 guided capture: the stepper, live checks, three photos, then the usual consents", async ({ page }, info) => {
  test.setTimeout(240_000);
  // Held: nothing is analysed or saved.
  await page.route((url) => url.pathname === "/api/skin-scan" || url.pathname === "/api/skin-scan/upload", () => new Promise(() => undefined));
  await signIn(page, MESH_SEED.skipped["390"].phoneNumber);
  await page.goto("/skin-check");
  await expect(choice(page)).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: Q.skipAsk, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: Q.skipNow, exact: true }).click();

  // The stepper renders with Front current.
  const steps = page.getByRole("listitem").filter({ hasText: G.steps[0] });
  await expect(page.getByRole("heading", { name: G.title.front })).toBeVisible({ timeout: 60_000 });
  await expect(steps.first()).toHaveAttribute("aria-current", "step");
  await page.getByRole("button", { name: K.open }).click();
  const checks = page.getByRole("list", { name: G.checksLabel });
  await expect(checks).toBeVisible({ timeout: 30_000 });
  // The model has run on the fake camera's face: the face is found.
  await expect(checks.getByText(`${LIVE_COPY.labels.face_clear}: ${LIVE_COPY.states.ok}`)).toBeVisible({ timeout: 60_000 });
  await settle(page);
  await matchShot(page, info, "07-capture-front");

  await page.getByRole("button", { name: G.takeAngle.front }).click();
  await expect(page.getByRole("heading", { name: G.title.left })).toBeVisible();
  await expect(page.getByRole("button", { name: G.takeAngle.left })).toBeVisible();
  await settle(page);
  await matchShot(page, info, "07-capture-left");

  await page.getByRole("button", { name: G.takeAngle.left }).click();
  await page.getByRole("button", { name: G.takeAngle.right }).click();
  await expect(page.getByRole("heading", { name: G.review })).toBeVisible();
  await expect(page.getByRole("img", { name: G.steps[2] })).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await expect(page.getByRole("button", { name: "Analyze my skin" })).toBeVisible();
  await page.getByRole("heading", { name: G.review }).scrollIntoViewIfNeeded();
  await settle(page);
  await matchShot(page, info, "07-review");
});
