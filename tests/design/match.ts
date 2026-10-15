import type { Page, TestInfo } from "@playwright/test";

/** Saves one mockup-match shot: docs/design/mockup-match/shots/<NN>-<state>@<width>.png (viewport, not full page). */
export async function matchShot(page: Page, info: TestInfo, state: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: `docs/design/mockup-match/shots/${state}@${info.project.name}.png`, animations: "disabled" });
}
