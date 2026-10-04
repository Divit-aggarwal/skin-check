import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { DASHBOARD_SEED as U } from "./seed-users";
import { shot, signIn } from "./helpers";

// Every dashboard state in docs/lanes/dashboard-design.md §3, on a phone
// screen, each saved as docs/lanes/dashboard-<state>.png.

const FS = process.env.PW_FIRESTORE_HOST!;
const firestore = (page: Page) => (url: URL) => url.host === FS || url.href.includes("firestore.googleapis.com");

async function dashboardAs(page: Page, phone: string) {
  await signIn(page, phone);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: C.title })).toBeVisible();
}

test("signed out: a sign-in link only", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(C.signedOut)).toBeVisible();
  await expect(page.getByRole("link", { name: C.signIn })).toHaveAttribute("href", "/account");
  await shot(page, "signed-out");
});

test("sign in as a seeded user and see the dashboard", async ({ page }) => {
  await dashboardAs(page, U.building!.phoneNumber);
  for (const title of [C.current.title, C.trend.title, C.history.title, C.chat.title, C.routine.title, C.privacy.title]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.getByText(C.trend.notEnough)).toBeVisible();
  await expect(page.getByText(C.trend.count(2, 3))).toBeVisible();
  await expect(page.getByText(C.photoCheck.pass)).toBeVisible();
  await expect(page.getByRole("link", { name: C.routine.link })).toHaveAttribute("href", "/routine");
  await expect(page.getByRole("link", { name: C.privacy.delete })).toHaveAttribute("href", "/account#delete-account");
  // No score, arrow or percentage anywhere on the page.
  await expect(page.locator("body")).not.toContainText(/\/100|%|↑|↓|▲|▼/);
  await shot(page, "building");
});

test("loading", async ({ page }) => {
  await signIn(page, U.one!.phoneNumber);
  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route(firestore(page), async (route) => {
    await held;
    await route.continue().catch(() => undefined);
  });
  await page.goto("/dashboard");
  await expect(page.getByText(C.loading)).toBeVisible();
  await shot(page, "loading");
  release();
});

test("error: a failed read shows a plain message, no code", async ({ page }) => {
  await signIn(page, U.one!.phoneNumber);
  await page.route(firestore(page), (route) => route.abort());
  await page.goto("/dashboard");
  await expect(page.getByText(C.error)).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("body")).not.toContainText(/permission|unavailable|firestore/i);
  await shot(page, "error");
});

test("empty", async ({ page }) => {
  await dashboardAs(page, U.empty!.phoneNumber);
  await expect(page.getByText(C.empty)).toBeVisible();
  await expect(page.getByText(C.trend.empty)).toBeVisible();
  await expect(page.getByText(C.chat.needsReading)).toBeVisible();
  await expect(page.getByText(C.privacy.aiNotAsked)).toBeVisible();
  await shot(page, "empty");
});

test("one reading: bands, a hard-to-read area, 0 of 3", async ({ page }) => {
  await dashboardAs(page, U.one!.phoneNumber);
  await expect(page.getByText("Redness")).toBeVisible();
  await expect(page.getByText(C.current.hardToRead("Forehead"))).toBeVisible();
  await expect(page.getByText(C.trend.count(0, 3))).toBeVisible();
  await expect(page.getByText(C.current.notKnown[0]!)).toBeVisible();
  await shot(page, "one-reading");
});

test("starting point set: still not enough evidence", async ({ page }) => {
  await dashboardAs(page, U.set!.phoneNumber);
  await expect(page.getByText(C.trend.count(3, 3))).toBeVisible();
  await expect(page.getByText(C.trend.set)).toBeVisible();
  await expect(page.getByText(C.photoCheck.unchecked)).toBeVisible();
  await shot(page, "set");
});

test("software boundary", async ({ page }) => {
  await dashboardAs(page, U.boundary!.phoneNumber);
  await expect(page.getByText(C.trend.boundary)).toBeVisible();
  await shot(page, "boundary");
});

test("legacy record: shown as saved, not counted", async ({ page }) => {
  await dashboardAs(page, U.legacy!.phoneNumber);
  await expect(page.getByText(C.legacyNote)).toBeVisible();
  await expect(page.getByText(C.trend.legacy)).toBeVisible();
  await expect(page.getByText(C.history.kind.legacy)).toBeVisible();
  await expect(page.getByText(C.chat.needsReading)).toBeVisible();
  await shot(page, "legacy");
});

test("no reading: questions-only and failed checks", async ({ page }) => {
  await dashboardAs(page, U.noreading!.phoneNumber);
  await expect(page.getByText(C.current.none)).toBeVisible();
  await expect(page.getByText(C.history.kind.questions)).toBeVisible();
  await expect(page.getByText(C.history.kind.failed)).toBeVisible();
  await shot(page, "no-reading");
});

test("one past check at a time, with no readings; unknown id is not found", async ({ page }) => {
  await dashboardAs(page, U.building!.phoneNumber);
  await page.getByRole("link", { name: /Open the check from/ }).nth(1).click(); // newest first: the middle check is the override one
  await expect(page.getByText(C.history.onlyNewest)).toBeVisible();
  await expect(page.getByText(C.photoCheck.override)).toBeVisible();
  await expect(page.getByText("Redness")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: C.current.title })).toHaveCount(0);
  await shot(page, "past-check");
  await page.goto("/dashboard?check=not-a-check");
  await expect(page.getByText(C.history.notFound)).toBeVisible();
  await shot(page, "check-not-found");
  await page.getByRole("link", { name: C.history.back }).click();
  await expect(page.getByRole("heading", { name: C.current.title })).toBeVisible();
});

test("privacy: sharing on, with the stop button", async ({ page }) => {
  await dashboardAs(page, U.withdraw!.phoneNumber);
  await expect(page.getByText(C.privacy.aiOn)).toBeVisible();
  await expect(page.getByRole("button", { name: C.privacy.stop })).toBeVisible();
  await expect(page.getByText(C.privacy.photoNotKept)).toBeVisible();
  await page.getByRole("heading", { name: C.privacy.title }).scrollIntoViewIfNeeded();
  await shot(page, "privacy-on");
});
