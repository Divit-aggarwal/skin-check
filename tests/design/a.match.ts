import { test, type Page } from "@playwright/test";
import { signIn } from "../browser/helpers";
import { MMA_SEED as U } from "../browser/seed-mm-a";
import { matchShot } from "./match";

// Lane mm/a mockup match (G37): screens 09, 10, 11, 12 at the four widths.
//   PW_ARGS="-c tests/design/match.config.ts tests/design/a.match.ts" bash scripts/with-stack-slot.sh npm run test:browser

const settle = async (page: Page) => {
  await page.getByRole("heading", { level: 1 }).waitFor({ state: "attached", timeout: 60_000 });
  await page.waitForLoadState("networkidle", { timeout: 15_000 }).catch(() => undefined);
  await page.waitForTimeout(800);
};

test("four checks: 10, 11, 12, 09", async ({ page }, info) => {
  test.setTimeout(240_000);
  await signIn(page, U.four.phoneNumber);
  for (const [path, state] of [
    ["/checks", "10-overview"],
    ["/checks?reading=blemishes", "11-reading"],
    ["/progress", "12-overview"],
    ["/progress?view=photos", "12-photos"],
    [`/checks/${U.four.uid}-4`, "09-check"],
  ] as const) {
    await page.goto(path);
    await settle(page);
    await matchShot(page, info, state);
  }
});

for (const [key, suffix] of [["one", "one"], ["empty", "empty"]] as const) {
  test(`${suffix}: 10, 12`, async ({ page }, info) => {
    test.setTimeout(180_000);
    await signIn(page, U[key].phoneNumber);
    for (const [path, state] of [
      ["/checks", `10-${suffix}`],
      ["/progress", `12-${suffix}`],
    ] as const) {
      await page.goto(path);
      await settle(page);
      await matchShot(page, info, state);
    }
  });
}
