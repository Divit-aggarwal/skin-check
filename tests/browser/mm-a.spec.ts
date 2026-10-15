import { expect, test } from "@playwright/test";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { CHECKS_COPY as K } from "@/components/checks/copy";
import { PROGRESS_COPY as P } from "@/components/progress/copy";
import { signIn } from "./helpers";
import { MMA_SEED as U } from "./seed-mm-a";

// Lane mm/a (G37): screens 10 Skin Twin, 11 one reading, 12 Progress and 09 an
// opened check, with 0, 1 and 4 checks (scripts/seed-lane-mm-a.ts). Level
// words, timelines of levels and the change slot ("Needs more checks") only;
// the user's own kept photos only; never a percentage, arrow or score.
//   PW_ARGS="tests/browser/mm-a.spec.ts" bash scripts/with-stack-slot.sh npm run test:browser

test.use({ viewport: { width: 393, height: 852 } });
const NO_CHANGE = /\/100|%|↑|↓|▲|▼|Dryness/;

test("four checks: Skin Twin, one reading, Progress and an opened check", async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page, U.four.phoneNumber);

  // 10
  await page.goto("/checks");
  await expect(page.getByRole("heading", { level: 1, name: K.twinTitle })).toBeVisible();
  const state = page.locator("section", { has: page.getByRole("heading", { name: K.stateTitle }) });
  await expect(state.getByRole("link", { name: /^(Breakouts|Redness|Dark marks|Texture|Oiliness) (Low|Moderate|Elevated)$/ })).toHaveCount(5);
  await expect(state.getByText(C.history.pastLine)).toBeVisible();
  await expect(page.getByRole("link", { name: K.readings })).toHaveAttribute("href", "/checks?view=readings");
  await expect(page.getByRole("heading", { name: C.routine.title })).toBeVisible();
  await expect(page.getByText(K.consistency)).toBeVisible();
  await expect(page.getByRole("main")).not.toContainText(NO_CHANGE);

  // 11
  await state.getByRole("link", { name: /^Breakouts/ }).click();
  await expect(page).toHaveURL(/\/checks\?reading=blemishes$/);
  await expect(page.getByRole("heading", { level: 1, name: "Breakouts" })).toBeVisible();
  await expect(page.getByText("Needs more checks")).toBeVisible();
  const timeline = page.getByRole("table", { name: "Breakouts" });
  await expect(timeline.getByRole("row")).toHaveCount(4);
  await page.getByRole("radio", { name: "4W" }).click();
  await expect(page.getByRole("radio", { name: "4W" })).toHaveAttribute("aria-checked", "true");
  await expect(timeline.getByRole("row")).toHaveCount(4); // all four are within 4 weeks
  const photos = page.getByRole("region", { name: K.yourPhotos }).getByRole("img", { name: /Your kept photo from/ });
  await expect(photos).toHaveCount(4, { timeout: 30_000 });
  await expect(page.getByRole("link", { name: new RegExp(K.keepRoutine) })).toHaveAttribute("href", "/routine");
  await expect(page.getByRole("main")).not.toContainText(NO_CHANGE);
  await expect(page.getByRole("main")).not.toContainText(/before and after|AI insights/i);

  // 12
  await page.goto("/progress");
  await expect(page.getByRole("heading", { level: 1, name: P.title })).toBeVisible();
  await expect(page.getByRole("region", { name: P.latestIn }).getByRole("link")).toHaveCount(5);
  await expect(page.getByText("Needs more checks")).toHaveCount(5);
  await expect(page.getByRole("table")).toHaveCount(5);
  await page.getByLabel(P.windowLabel).selectOption("4w");
  await expect(page).toHaveURL(/\/progress\?window=4w$/);
  await page.getByRole("link", { name: P.concerns }).click();
  await expect(page).toHaveURL(/\/progress\?view=concerns&window=4w$/);
  await expect(page.getByRole("heading", { level: 2, name: "Dark marks" })).toBeVisible();
  await page.getByRole("link", { name: P.photos, exact: true }).click();
  await expect(page.getByRole("main").getByRole("link", { name: /Open the check from/ })).toHaveCount(4, { timeout: 30_000 });
  await expect(page.getByRole("main")).not.toContainText(NO_CHANGE);
  await expect(page.getByRole("main")).not.toContainText(/Routine Impact|Key insights|Improving/i);

  // 09
  await page.goto(`/checks/${U.four.uid}-4`);
  const opened = page.locator("section", { has: page.getByRole("heading", { name: /Check from/ }) });
  await expect(opened.getByText(C.history.pastLine)).toBeVisible();
  await expect(opened.getByText(K.checkNumber(4, 4))).toBeVisible();
  await expect(opened.getByRole("list", { name: K.wholeFace }).getByText("Needs more checks")).toHaveCount(5);
  await expect(opened).not.toContainText(NO_CHANGE);
});

test("one check: Progress and the reading show one point and need more checks", async ({ page }) => {
  await signIn(page, U.one.phoneNumber);
  await page.goto("/progress");
  await expect(page.getByRole("heading", { level: 1, name: P.title })).toBeVisible();
  await expect(page.getByText("Needs more checks")).toHaveCount(5);
  await expect(page.getByRole("table", { name: "Redness" }).getByRole("row")).toHaveCount(1);
  await page.goto("/checks?reading=redness");
  await expect(page.getByRole("table", { name: "Redness" }).getByRole("row")).toHaveCount(1);
});

test("no checks: the empty states on Skin Twin and Progress", async ({ page }) => {
  await signIn(page, U.empty.phoneNumber);
  await page.goto("/checks");
  await expect(page.getByText(C.empty)).toBeVisible();
  await page.goto("/progress");
  await expect(page.getByText(C.empty)).toBeVisible();
  await expect(page.getByRole("link", { name: C.firstCheck })).toHaveAttribute("href", "/skin-check");
});
