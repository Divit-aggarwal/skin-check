import type { Page, TestInfo } from "@playwright/test";

/** Saves one mockup-match shot: docs/design/mockup-match/shots/<NN>-<state>@<width>.png (full page; overlay.py crops the first screenful). */
export async function matchShot(page: Page, info: TestInfo, state: string): Promise<void> {
  await page.evaluate(() => document.fonts.ready);
  // No page may scroll sideways, at any of the four widths.
  const wide = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  if (wide > 0) throw new Error(`${state}@${info.project.name}: the page scrolls sideways by ${wide}px`);
  await page.screenshot({ path: `docs/design/mockup-match/shots/${state}@${info.project.name}.png`, animations: "disabled", fullPage: true });
}
