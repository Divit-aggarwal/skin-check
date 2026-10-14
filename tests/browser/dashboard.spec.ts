import { expect, test, type Page } from "@playwright/test";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { TIMELINE_COPY as T } from "@/components/timeline/copy";
import { CHECKS_COPY as K } from "@/components/checks/copy";
import { SHELL_COPY as S } from "@/components/shell/copy";
import { ROUTINE_COPY as R } from "@/lib/routine/copy";
import { DASHBOARD_SEED as U } from "./seed-users";
import { shot, signIn } from "./helpers";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { HOME_COPY as H } from "@/components/dashboard/homeCopy";

// Every dashboard state in docs/lanes/dashboard-design.md §3, on a phone
// screen, each saved as .local-stack/browser-shots/dashboard-<state>.png.
// TD-47 (Home v2): Home shows the whole-face readings of the newest check;
// the table by face area, a hard-to-read area and the kinds of past checks
// are on an opened check and Checks; the privacy card is on Account.

// TD-48: these check the Home v2 content, which now shows from 1024px; phones get the compact Home (home-v3.spec.ts).
test.use({ viewport: { width: 1280, height: 900 } });

const FS = process.env.PW_FIRESTORE_HOST!;
const firestore = (page: Page) => (url: URL) => url.host === FS || url.href.includes("firestore.googleapis.com");

async function dashboardAs(page: Page, phone: string) {
  await signIn(page, phone);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: /^Good (morning|afternoon|evening)/ })).toBeVisible();
}

const accountAs = async (page: Page, phone: string) => {
  await signIn(page, phone);
  await page.goto("/account");
};

test("signed out: a sign-in link only", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByText(C.signedOut)).toBeVisible();
  // The shell top bar has its own Sign in; this is the page's own link.
  await expect(page.getByRole("main").getByRole("link", { name: C.signIn })).toHaveAttribute("href", "/account");
  // No dead end (map.md): signed out, a way into a check too.
  await expect(page.getByRole("main").getByRole("link", { name: S.startCheck })).toHaveAttribute("href", "/skin-check");
  await shot(page, "signed-out");
});

test("'/' opens the check flow when signed out and Home when signed in (TD-24 (3))", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/skin-check$/);
  // TD-44: a new visitor's first page is the questions choice.
  await expect(page.getByRole("heading", { name: Q.title, exact: true })).toBeVisible();
  await signIn(page, U.one!.phoneNumber);
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("an unknown address shows a designed page with ways on, inside the app shell", async ({ page }) => {
  await signIn(page, U.one!.phoneNumber);
  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: S.notFoundTitle })).toBeVisible();
  await expect(page.getByRole("main").getByRole("link", { name: S.goHome })).toHaveAttribute("href", "/dashboard");
  await expect(page.getByRole("navigation", { name: S.navLabel }).first()).toBeAttached();
});

test("sign in as a seeded user and see the dashboard", async ({ page }) => {
  await dashboardAs(page, U.building!.phoneNumber);
  // TD-47 Home: next check, latest check, today's routine, your record, Ask Echo, a new check.
  for (const title of [H.next.title, H.latest.title, R.todayTitle, H.record.title, H.echo.title]) {
    await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  }
  await expect(page.getByRole("region", { name: H.banner.start })).toBeVisible();
  await expect(page.getByText(C.trend.notEnough)).toBeVisible();
  await expect(page.getByText(C.trend.count(2, 3))).toBeVisible();
  await expect(page.getByText(C.photoCheck.pass)).toBeVisible();
  // No routine yet: the card invites a set-up on /routine.
  await expect(page.getByRole("link", { name: H.routine.setUp })).toHaveAttribute("href", "/routine");
  // No score, arrow or percentage anywhere on the page.
  await expect(page.locator("body")).not.toContainText(/\/100|%|↑|↓|▲|▼/);
  await shot(page, "building");
});

// TD-39: one table for the whole face and each area. TD-46: a face area on the drawing opens Echo on it.
test("readings by face area: one table, every level in the same style, no score; a face area opens Echo on it", async ({ page }) => {
  await dashboardAs(page, U.set!.phoneNumber);
  // TD-47: Home shows the whole face only, five readings, levels only, one style.
  const latest = page.locator("section", { has: page.getByRole("heading", { name: H.latest.title }) });
  await expect(latest.getByRole("table").getByRole("row")).toHaveCount(5);
  for (const c of await latest.getByRole("cell").allTextContents()) expect(c).toMatch(/^(Low|Moderate|Elevated)$/);
  expect(await latest.getByRole("cell").evaluateAll((els) => Array.from(new Set(els.map((e) => e.className))))).toHaveLength(1);
  await expect(latest.getByText("Dryness")).toHaveCount(0);
  await expect(latest).not.toContainText(/\/100|%/);
  await shot(page, "home-areas");
  // TD-46: the drawing's areas are buttons (keyboard too) that open Echo on that area.
  await latest.getByRole("button", { name: C.chat.askAbout("Nose") }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/echo\?region=nose$/);
  // TD-39: the table by face area is on the opened check.
  await page.goto("/checks/seed-dash-set-5");
  const opened = page.locator("section", { has: page.getByRole("heading", { name: /Check from/ }) });
  const table = opened.getByRole("table", { name: C.table.caption });
  // TD-40: five readings, the last three tagged.
  await expect(table.getByRole("columnheader")).toHaveText([C.table.area, "Redness", "Oiliness", /^Breakouts\s*early estimate$/, /^Texture\s*early estimate$/, /^Dark marks\s*early estimate$/]);
  await expect(table.getByRole("rowheader").first()).toHaveText(C.current.wholeFace);
  await expect(table.getByRole("rowheader", { name: "Forehead" })).toBeVisible();
  for (const c of await table.getByRole("cell").allTextContents()) expect(c).toMatch(/^(Low|Moderate|Elevated|No reading)$/);
  const classes = await table.getByRole("cell").evaluateAll((els) => Array.from(new Set(els.map((e) => e.className))));
  expect(classes).toHaveLength(1);
  await expect(opened.getByText(C.current.areaNote)).toBeVisible();
  await expect(opened.getByText("Dryness")).toHaveCount(0);
  await expect(opened).not.toContainText(/\/100|%/);
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
  await expect(page.getByText(H.latest.none)).toBeVisible();
  await expect(page.getByText(C.trend.empty)).toBeVisible();
  await expect(page.getByText(C.chat.needsFirst)).toBeVisible();
  await shot(page, "empty");
  // The privacy card is on Account (TD-47).
  await page.goto("/account");
  await expect(page.getByText(C.privacy.aiNotAsked)).toBeVisible();
});

test("one reading: bands, a hard-to-read area, 0 of 3", async ({ page }) => {
  await dashboardAs(page, U.one!.phoneNumber);
  await expect(page.getByText("Redness", { exact: true })).toBeVisible();
  await expect(page.getByText(C.trend.count(0, 3))).toBeVisible();
  // "What this means": the fixed text, one tap away.
  await page.getByText(H.latest.meaningTitle).click();
  await expect(page.getByText(C.current.notKnown[0]!)).toBeVisible();
  await shot(page, "one-reading");
  // The hard-to-read area is named on the opened check, where the areas are.
  await page.goto("/checks/seed-dash-one-1");
  await expect(page.getByText(C.current.hardToRead("Forehead"))).toBeVisible();
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
  await expect(page.getByText(C.chat.needsReading)).toBeVisible();
  await shot(page, "legacy");
  await page.goto("/checks");
  await expect(page.getByRole("link", { name: /Open the check from/ }).getByText(C.history.kind.legacy)).toBeVisible();
});

test("no reading: questions-only and failed checks", async ({ page }) => {
  await dashboardAs(page, U.noreading!.phoneNumber);
  await expect(page.getByText(H.latest.noReading)).toBeVisible();
  await shot(page, "no-reading");
  await page.goto("/checks");
  await expect(page.getByRole("link", { name: /Open the check from/ }).getByText(C.history.kind.questions)).toBeVisible();
  await expect(page.getByRole("link", { name: /Open the check from/ }).getByText(C.history.kind.failed)).toBeVisible();
});

// TD-24 (1) replaces O-D4: an opened check shows its own readings, always with the fixed line.
test("one opened check: its own readings with the fixed line; unknown id is not found; the old address redirects", async ({ page }) => {
  await dashboardAs(page, U.building!.phoneNumber);
  await page.goto("/checks");
  await page.getByRole("link", { name: /Open the check from/ }).nth(1).click(); // newest first: the middle check is the override one
  await expect(page).toHaveURL(/\/checks\/seed-dash-building-2$/);
  const opened = page.locator("section", { has: page.getByRole("heading", { name: /Check from/ }) });
  await expect(opened.getByText(C.history.pastLine)).toBeVisible();
  await expect(opened.getByText(C.photoCheck.override)).toBeVisible();
  await expect(opened.getByText("Redness", { exact: true })).toBeVisible();
  await expect(opened).not.toContainText(/\/100|%|Dryness/);
  // TD-46: an older check's areas open nothing (Echo talks about the newest check only).
  await expect(opened.getByRole("button", { name: C.chat.askAbout("Forehead") })).toHaveCount(0);
  // One check only: the newest reading's card is not on this page.
  await expect(page.getByRole("heading", { name: C.current.title })).toHaveCount(0);
  await shot(page, "past-check");
  // One h1 on every page, on a phone too (flow review G03).
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await page.goto("/checks/not-a-check");
  await expect(page.getByText(C.history.notFound)).toBeVisible();
  await shot(page, "check-not-found");
  await page.goto("/dashboard?check=seed-dash-building-1");
  await expect(page).toHaveURL(/\/checks\/seed-dash-building-1$/);
  await expect(page.getByText(C.history.pastLine)).toBeVisible();
});

test("checks list: date, kind and photo check, never a reading; a kept photo shows as a small image, a check without one shows none", async ({ page }) => {
  await dashboardAs(page, U.kept!.phoneNumber);
  await page.goto("/checks");
  const list = page.locator("section", { has: page.getByRole("heading", { name: C.history.title }) });
  await expect(list.getByRole("link", { name: /Open the check from/ })).toHaveCount(2);
  await expect(list).not.toContainText(/\b(Low|Moderate|Elevated)\b/);
  const photo = list.getByRole("img", { name: /Your kept photo from/ });
  await expect(photo).toHaveCount(1);
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
  // The photo is only in the older check's row.
  await expect(list.getByRole("link").nth(1).getByRole("img", { name: /Your kept photo/ })).toHaveCount(1);
  await shot(page, "checks-kept-photo");
});

// TD-24 (2): checks and routine entries on one timeline, newest first, never a reading.
test("timeline: checks and routine entries together in date order, with no reading", async ({ page }) => {
  await signIn(page, "+919999900001"); // base seed user Asha: checks and routine events
  await page.goto("/checks?view=timeline");
  const timeline = page.getByRole("region", { name: K.timeline });
  await expect(timeline.getByText(T.routineKind).first()).toBeVisible();
  await expect(timeline.getByText(C.history.kind.reading).first()).toBeVisible();
  await expect(timeline).not.toContainText(/\b(Low|Moderate|Elevated)\b|\/100|%/);
  const days = await timeline.locator("li span.font-semibold").allTextContents();
  const times = days.map((d) => Date.parse(d.replace("Sept", "Sep")));
  expect(times.every((t) => !Number.isNaN(t))).toBe(true);
  expect(times).toEqual([...times].sort((a, b) => b - a));
  await expect(page.getByRole("link", { name: K.timeline })).toHaveAttribute("aria-current", "page");
  await shot(page, "timeline");
});

test("privacy: sharing on, with the stop button", async ({ page }) => {
  await accountAs(page, U.withdraw!.phoneNumber);
  await expect(page.getByText(C.privacy.aiOn)).toBeVisible();
  await expect(page.getByRole("button", { name: C.privacy.stop })).toBeVisible();
  await expect(page.getByText(C.privacy.photoNotKept)).toBeVisible();
  await page.getByRole("heading", { name: C.privacy.title }).scrollIntoViewIfNeeded();
  await shot(page, "privacy-on");
});

test("unreadable: stored scores that do not parse", async ({ page }) => {
  await dashboardAs(page, U.unreadable!.phoneNumber);
  await expect(page.getByText(C.current.unreadable)).toBeVisible();
  // Nothing that speaks of readings that are not on screen.
  await expect(page.getByText(C.legacyNote)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: C.current.knownTitle })).toHaveCount(0);
  await shot(page, "unreadable");
});

test("a newer check without a server reading is named, not passed off as the newest", async ({ page }) => {
  await dashboardAs(page, U.newer!.phoneNumber);
  await expect(page.getByText(C.current.newerNotShown)).toBeVisible();
  await shot(page, "newer-not-shown");
});

test("privacy: saving, failed and out-of-date withdrawal states", async ({ page }) => {
  await accountAs(page, U.newer!.phoneNumber);
  const stop = page.getByRole("button", { name: C.privacy.stop });
  const privacy = page.getByRole("heading", { name: C.privacy.title });

  let release!: () => void;
  const held = new Promise<void>((r) => (release = r));
  await page.route("**/api/account/consent", async (route) => {
    await held;
    await route.fulfill({ status: 500, json: { code: "LEDGER_UNAVAILABLE" } });
  });
  await stop.click();
  await expect(page.getByRole("button", { name: C.privacy.saving })).toBeDisabled();
  await privacy.scrollIntoViewIfNeeded();
  await shot(page, "privacy-saving");
  release();
  await expect(page.getByText(C.privacy.failed)).toBeVisible();
  await shot(page, "privacy-failed");

  await page.unroute("**/api/account/consent");
  await page.route("**/api/account/consent", (route) => route.fulfill({ status: 409, json: { code: "VERSION_STALE" } }));
  await stop.click();
  await expect(page.getByText(C.privacy.stale)).toBeVisible();
  // Nothing was withdrawn: sharing still reads as on.
  await expect(page.getByText(C.privacy.aiOn)).toBeVisible();
  await shot(page, "privacy-stale");
});

// TD-50 screens 10, 11, 12 on a phone (lane redesign-checks, add-only): the
// Overview, Readings, one reading at each check and Photos. Level words only,
// always with the fixed line; nothing that shows a change between checks.
test.describe("checks views on a phone (TD-50)", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("overview, readings, one reading at each check and photos: level words with the fixed line, no change shown", async ({ page }) => {
    await signIn(page, U.set!.phoneNumber);
    await page.goto("/checks");
    const latest = page.locator("section", { has: page.getByRole("heading", { name: /^Checked on/ }) });
    await expect(latest.getByText(C.history.pastLine)).toBeVisible();
    await expect(latest.getByRole("link", { name: /^Redness/ })).toHaveAttribute("href", "/checks?reading=redness");
    const list = page.locator("section", { has: page.getByRole("heading", { name: C.history.title }) });
    await expect(list.getByRole("link", { name: /Open the check from/ })).toHaveCount(5);
    await expect(list).not.toContainText(/\b(Low|Moderate|Elevated)\b/);
    await expect(page.getByRole("heading", { name: C.routine.title })).toBeVisible();
    await expect(page.getByRole("main")).not.toContainText(/\/100|%|↑|↓|▲|▼|Dryness/);
    await expect(page.getByRole("link", { name: K.overview })).toHaveAttribute("aria-current", "page");

    await page.getByRole("link", { name: K.readings }).click();
    await expect(page).toHaveURL(/\/checks\?view=readings$/);
    await expect(page.getByRole("link", { name: K.readings })).toHaveAttribute("aria-current", "page");
    await expect(page.getByText(C.history.pastLine)).toBeVisible();
    await page.getByRole("link", { name: /^Breakouts/ }).click();

    await expect(page).toHaveURL(/\/checks\?reading=blemishes$/);
    const one = page.locator("section", { has: page.getByRole("heading", { name: "Breakouts", exact: true }) });
    await expect(one.getByText(C.history.pastLine)).toBeVisible();
    const rows = one.locator("ol > li");
    await expect(rows).toHaveCount(5);
    for (const r of await rows.allTextContents()) expect(r).toMatch(/(Low|Moderate|Elevated|No reading)$/);
    await expect(one).not.toContainText(/\/100|%|↑|↓|▲|▼/);

    await page.goto("/checks?view=photos");
    await expect(page.getByText(K.photosNone)).toBeVisible();
  });

  test("photos: a kept photo opens its check; a check without one is not shown", async ({ page }) => {
    await signIn(page, U.kept!.phoneNumber);
    await page.goto("/checks?view=photos");
    await expect(page.getByText(C.history.pastLine)).toBeVisible();
    const tiles = page.getByRole("main").getByRole("link", { name: /Open the check from/ });
    await expect(tiles).toHaveCount(1);
    const photo = tiles.getByRole("img", { name: /Your kept photo from/ });
    await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await tiles.click();
    await expect(page).toHaveURL(/\/checks\/seed-dash-kept-1$/);
  });
});
