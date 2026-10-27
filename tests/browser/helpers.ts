import { expect, type Page } from "@playwright/test";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";

// Shared by the browser tests. Sign-in goes through the real phone form; the
// code comes from the auth emulator's verification-code endpoint, as in
// tests/capture.e2e.test.ts. Emulators only (demo- project).
const AUTH = process.env.PW_AUTH_HOST!;
const PROJECT = process.env.FIREBASE_PROJECT_ID ?? "demo-skin-check";

async function latestCode(phoneNumber: string, after: Set<string>): Promise<string> {
  for (let i = 0; i < 40; i++) {
    const res = await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/verificationCodes`);
    const { verificationCodes = [] } = (await res.json()) as { verificationCodes?: { phoneNumber: string; code: string; sessionInfo: string }[] };
    const fresh = verificationCodes.filter((c) => c.phoneNumber === phoneNumber && !after.has(c.sessionInfo));
    if (fresh.length) return fresh.at(-1)!.code;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no verification code for ${phoneNumber}`);
}

async function sessionsFor(phoneNumber: string): Promise<Set<string>> {
  const res = await fetch(`http://${AUTH}/emulator/v1/projects/${PROJECT}/verificationCodes`);
  const { verificationCodes = [] } = (await res.json()) as { verificationCodes?: { phoneNumber: string; sessionInfo: string }[] };
  return new Set(verificationCodes.filter((c) => c.phoneNumber === phoneNumber).map((c) => c.sessionInfo));
}

/** Fills the phone form already on screen (on /account or inside the flow) and verifies the code. */
export async function completePhoneForm(page: Page, phoneNumber: string) {
  const before = await sessionsFor(phoneNumber);
  await page.locator('input[type="tel"]').fill(phoneNumber.slice(-10));
  await page.getByRole("button", { name: /code/i }).first().click();
  const code = await latestCode(phoneNumber, before);
  await page.getByLabel(/verification code/i).fill(code);
  await page.getByRole("button", { name: "Verify" }).click();
}

export async function signIn(page: Page, phoneNumber: string) {
  await page.goto("/account");
  await completePhoneForm(page, phoneNumber);
  // TD-24 (3): a sign-in on /account goes to Home.
  await expect(page).toHaveURL(/\/dashboard$/);
}

/** Saves a full-page screenshot under .local-stack/ (gitignored); the lane report keeps its own copies in docs/lanes/. */
export const shot = (page: Page, name: string) => page.screenshot({ path: `.local-stack/browser-shots/dashboard-${name}.png`, fullPage: true });

/** TD-44: the choice page's skip, then "Skip for now" in the "are you sure?" pop-up. */
export async function skipQuestions(page: Page) {
  await page.getByRole("button", { name: Q.skipAsk, exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: Q.skipNow, exact: true }).click();
}

/** TD-48: Home v2 (cards, weather card, "Chat with Echo") is the desktop Home now; phones get the compact Home. */
