import { mkdirSync, readFileSync } from "node:fs";
import { devices, expect, test, type Locator, type Page, type Route } from "@playwright/test";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { HOME_COPY as H } from "@/components/dashboard/homeCopy";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { WIDTHS, type Width } from "./seed-questionnaire";
import { FACE_DARK, FACE_LIGHT, MESH_SEED } from "./seed-mesh";
import { signIn, skipQuestions } from "./helpers";

// TD-37 (docs/design/face-mesh.md): the face mesh while the photo is read.
// TD-39: the results show the photo once with the mesh and both overlays, a
// legend and one readings table; Home and an opened check the photo with the
// mesh (or the face drawing) and the same table. No chips, nothing to choose,
// TD-40: the table has all five readings, the last three tagged "early
// estimate"; the photo still has only two overlays. At 390, 768 and 1280, on a
// darker and a lighter skin tone. AFTER_SHOTS=1 writes the screenshots to
// docs/design/after-one-photo/.

const FACES = { dark: FACE_DARK, light: FACE_LIGHT } as const;
type Tone = keyof typeof FACES;
const DIR = process.env.AFTER_SHOTS ? "docs/design/after-one-photo" : ".local-stack/browser-shots";
mkdirSync(DIR, { recursive: true });
const shot = async (page: Page, name: string, width: Width) => {
  await page.waitForTimeout(400); // entrance animations
  await page.screenshot({ path: `${DIR}/${name}-${width}.png`, fullPage: true });
};

// Phones and tablets give the photo through the file input. At 1280 a tablet
// in landscape does the same, so the engine's own test face is used; the
// laptop webcam path is unchanged (tests/browser/questionnaire.spec.ts).
const device = (name: string) => {
  const { defaultBrowserType: _, ...rest } = devices[name]!;
  return rest;
};
const DEVICE: Record<Width, Parameters<typeof test.use>[0]> = {
  "390": { ...device("iPhone 13"), viewport: { width: 390, height: 844 } },
  "768": { ...device("iPad Mini"), viewport: { width: 768, height: 1024 } },
  "1280": { ...device("iPad Mini"), viewport: { width: 1280, height: 800 } },
};

// No word boundary: a panel's text runs together ("RednessModerate").
const BAND = /(Low|Moderate|Elevated)/;

// Firebase Auth's phone sign-in loads its own helper from Google (before TD-37, unchanged).
const SIGN_IN_HOSTS = new Set(["apis.google.com"]);

/** Every other request stays on this machine: the mesh files are ours, and the photo never leaves. */
function watchHosts(page: Page): string[] {
  const outside: string[] = [];
  page.on("request", (r) => {
    const url = new URL(r.url());
    if (url.protocol === "data:" || url.protocol === "blob:" || ["localhost", "127.0.0.1"].includes(url.hostname)) return;
    if (!SIGN_IN_HOSTS.has(url.hostname)) outside.push(r.url());
  });
  return outside;
}

/** The engine's real answer for each photo, fetched once and replayed after, so only the first test per photo waits for the engine. */
const engineAnswers = new Map<Tone, { status: number; body: Buffer; headers: Record<string, string> }>();
async function holdScan(page: Page, tone: Tone = "dark") {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => url.pathname === "/api/skin-scan",
    async (route: Route) => {
      await gate;
      if (!engineAnswers.has(tone)) {
        const res = await route.fetch({ timeout: 300_000 });
        engineAnswers.set(tone, { status: res.status(), body: await res.body(), headers: res.headers() });
      }
      await route.fulfill(engineAnswers.get(tone)!);
    }
  );
  return release;
}

async function photoAndAnalyze(page: Page, tone: Tone = "dark") {
  const light = tone === "light";
  await page.locator('input[type="file"]').setInputFiles({ name: light ? "face.jpg" : "face.png", mimeType: light ? "image/jpeg" : "image/png", buffer: readFileSync(FACES[tone]) });
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "Analyze my skin" }).click();
}

/** The face mesh drew over the scanning photo. */
async function expectScanning(page: Page) {
  const scanning = page.getByTestId("scanning-photo");
  await expect(scanning).toBeVisible({ timeout: 60_000 });
  await expect(scanning).toHaveAttribute("data-mesh", "ready", { timeout: 90_000 });
  await expect(page.getByRole("status").filter({ hasText: "Reading your photo" })).toBeVisible();
}

async function toResults(page: Page) {
  const results = page.getByRole("button", { name: "Get my results" });
  await expect(results).toBeEnabled({ timeout: 300_000 });
  await results.click();
  await expect(page.getByRole("heading", { name: "Your photo reading" })).toBeVisible({ timeout: 60_000 });
}

const LEVEL = /^(Low|Moderate|Elevated|No reading)$/;
const EARLY = (label: string) => new RegExp(`^${label}${C.table.earlyEstimate}$`);
const COLUMNS = [C.table.area, "Redness", "Oiliness", EARLY("Breakouts"), EARLY("Texture"), EARLY("Dark marks")];
const HIDDEN = /From what you told us/i;

/** One readings table: Area and the five readings, three tagged; whole face first; level words only; the page never scrolls sideways. */
async function expectTable(scope: Page | Locator) {
  const table = scope.getByRole("table", { name: C.table.caption });
  await expect(table).toHaveCount(1);
  await expect(table.getByRole("columnheader")).toHaveText(COLUMNS);
  const page = "page" in scope ? scope.page() : scope;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  // On a phone the table's own box scrolls (never the page), with the hint; wider screens need no hint.
  const box = await table.evaluate((t) => ({ overflows: t.parentElement!.scrollWidth > t.parentElement!.clientWidth + 1, wide: window.innerWidth >= 640 }));
  if (box.overflows) expect(box.wide).toBe(false);
  await expect(page.getByText(C.table.swipe)).toBeVisible({ visible: !box.wide });
  await expect(table.getByRole("rowheader").first()).toHaveText(C.current.wholeFace);
  expect(await table.getByRole("rowheader").count()).toBeGreaterThan(1);
  const cells = await table.getByRole("cell").allTextContents();
  expect(cells.length).toBeGreaterThan(0);
  for (const c of cells) expect(c).toMatch(LEVEL);
}

/** Nothing to choose and no "told us" panels anywhere on the page. */
// TD-46: the face drawing is a picture, or (newest check, Echo on) a group of area buttons.
const DRAWING = 'svg[aria-label^="A drawing of a face"]';

async function expectNothingElse(page: Page) {
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  for (const area of ["Forehead", "Nose", "Cheeks", "Chin", C.current.wholeFace]) await expect(page.getByRole("button", { name: area, exact: true })).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(HIDDEN);
}

/** The one photo with the mesh drawn and both overlays, and the legend naming each. */
async function expectPhotoWithOverlays(page: Page) {
  const photo = page.getByTestId("face-photo");
  await expect(photo).toHaveCount(1);
  await expect(photo.getByRole("img", { name: C.photo.overlayAlt.redness })).toBeAttached();
  await expect(photo.getByRole("img", { name: C.photo.overlayAlt.oiliness })).toBeAttached();
  await expect(photo.locator("svg path")).toHaveCount(1, { timeout: 90_000 }); // the mesh
  const legend = page.getByRole("list", { name: C.photo.legend });
  await expect(legend.getByRole("listitem")).toHaveText(["Redness", "Oiliness"]);
  // The two overlays look different: one striped, one solid.
  const styles = await photo.locator('[role="img"][aria-label^="Where"]').evaluateAll((els) => els.map((e) => getComputedStyle(e).backgroundImage !== "none"));
  expect(styles).toEqual([true, false]);
}

for (const width of WIDTHS) {
  test.describe(`TD-39 at ${width}px`, () => {
    test.use(DEVICE[width]);

    for (const tone of ["dark", "light"] as const) {
      test(`${tone} skin: the mesh sweeps while the photo is read, then one photo with the mesh and both overlays and one table`, async ({ page }) => {
        test.setTimeout(480_000);
        const outside = watchHosts(page);
        const release = await holdScan(page, tone);
        await signIn(page, (tone === "dark" ? MESH_SEED.answered : MESH_SEED.answeredLight)[width].phoneNumber);
        await page.goto("/skin-check");
        await photoAndAnalyze(page, tone);
        // TD-43: nothing is asked again; straight to the last step, where the user waits.
        await expectScanning(page);
        await expect(page.getByText("What are you currently using on your skin?")).toHaveCount(0);
        await expect(page.getByRole("button", { name: "Analyzing your photo…" })).toBeDisabled();
        if (tone === "dark") await shot(page, "scanning", width);
        release();

        await toResults(page);
        await expectPhotoWithOverlays(page);
        await expectTable(page);
        await expectNothingElse(page);
        await shot(page, `results-${tone}`, width);
        expect(outside).toEqual([]);
      });
    }

    test("skipped the questions: the same one photo and table, no invitation about the three", async ({ page }) => {
      test.setTimeout(480_000);
      const release = await holdScan(page);
      await signIn(page, MESH_SEED.skipped[width].phoneNumber);
      await page.goto("/skin-check");
      await expect(page.getByRole("heading", { name: Q.title, exact: true })).toBeVisible({ timeout: 60_000 });
      await skipQuestions(page); // TD-44: through the "are you sure?" pop-up
      await photoAndAnalyze(page);
      await expectScanning(page);
      release();
      await toResults(page);
      await expectPhotoWithOverlays(page);
      await expectTable(page);
      await expectNothingElse(page);
    });

    test("an opened check with no kept photo: the face drawing and the table", async ({ page }) => {
      await signIn(page, MESH_SEED.noPhoto.phoneNumber);
      await page.goto(`/checks/${MESH_SEED.noPhoto.uid}-1`);
      await expect(page.getByText(C.history.pastLine)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("face-photo")).toHaveCount(0);
      await expect(page.locator(DRAWING)).toBeVisible();
      // No photo, so no line about colours on it (design review).
      await expect(page.getByText(C.photo.mapsOnResults)).toHaveCount(0);
      await expectTable(page);
      await expectNothingElse(page);
      await shot(page, "check-no-photo", width);
    });

    for (const tone of ["dark", "light"] as const) {
      test(`${tone} skin, a kept photo: Home shows it as a thumbnail; the opened check shows the photo with the mesh and the table`, async ({ page }) => {
        const outside = watchHosts(page);
        const user = tone === "dark" ? MESH_SEED.kept : MESH_SEED.keptLight;
        await signIn(page, user.phoneNumber);
        // TD-47: Home's latest check has the kept photo as a thumbnail (no mesh, no overlays) and the whole-face levels.
        const latest = page.locator("section", { has: page.getByRole("heading", { name: H.latest.title }) });
        const thumb = latest.getByRole("img", { name: /Your kept photo from/ });
        await expect(thumb).toBeVisible({ timeout: 90_000 });
        await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
        await expect(page.getByTestId("face-photo")).toHaveCount(0);
        await expect(latest.getByRole("img", { name: /^Where/ })).toHaveCount(0);
        await expect(latest.getByRole("table").getByRole("row")).toHaveCount(5);
        await expectNothingElse(page);
        await shot(page, `home-kept-${tone}`, width);
        await page.goto(`/checks/${user.uid}-1`);
        await expect(page.getByTestId("face-photo")).toBeVisible({ timeout: 90_000 });
        // One photo: the header thumbnail gives way to the large photo (design review).
        const opened = page.locator("section", { has: page.getByRole("heading", { name: /Check from/ }) });
        await expect(opened.getByRole("img", { name: /Your kept photo/ })).toHaveCount(0);
        await expectTable(page);
        await expectNothingElse(page);
        await shot(page, `check-kept-${tone}`, width);
        expect(outside).toEqual([]);
      });
    }
  });
}

test("skipped questions on an opened check: the existing invitation, nothing about the three", async ({ page }) => {
  await signIn(page, MESH_SEED.noPhotoSkipped.phoneNumber);
  await page.goto(`/checks/${MESH_SEED.noPhotoSkipped.uid}-1`);
  await expect(page.getByText(Q.checkSkipped)).toBeVisible({ timeout: 60_000 });
  await expectTable(page);
  await expectNothingElse(page);
  await shot(page, "check-skipped", "390");
});

test("the bucket refuses a read from our site (today's production CORS): the face drawing, no error", async ({ page }) => {
  await page.route((url) => url.hostname === "127.0.0.1" && url.pathname.includes("/original.jpg"), (route) => route.abort("accessdenied"));
  await signIn(page, MESH_SEED.kept.phoneNumber);
  // TD-47: Home falls back to the face drawing; the opened check too.
  await expect(page.getByRole("heading", { name: H.latest.title })).toBeVisible();
  await expect(page.getByRole("img", { name: /A drawing of a face/ }).or(page.getByRole("group", { name: /A drawing of a face/ }))).toBeVisible();
  await page.goto(`/checks/${MESH_SEED.kept.uid}-1`);
  await expectTable(page);
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("face-photo")).toHaveCount(0);
  await expect(page.locator(DRAWING)).toBeVisible();
});

test("reduced motion: the mesh stays still, no sweeping band", async ({ page }) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const release = await holdScan(page);
  await signIn(page, MESH_SEED.skipped["390"].phoneNumber);
  await page.goto("/skin-check");
  await skipQuestions(page); // TD-44: through the "are you sure?" pop-up
  await photoAndAnalyze(page);
  await expectScanning(page);
  await expect(page.locator(".mesh-scan")).toBeHidden();
  await shot(page, "scanning-reduced-motion", "390");
  release();
});

test("the mesh files cannot load: the photo and the plain progress state, and the analysis still finishes", async ({ page }) => {
  test.setTimeout(300_000);
  await page.route((url) => url.pathname.startsWith("/mediapipe/"), (route) => route.abort());
  const release = await holdScan(page);
  await signIn(page, MESH_SEED.skipped["768"].phoneNumber);
  await page.goto("/skin-check");
  await skipQuestions(page); // TD-44: through the "are you sure?" pop-up
  await photoAndAnalyze(page);
  const scanning = page.getByTestId("scanning-photo");
  await expect(scanning).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3_000);
  await expect(scanning).toHaveAttribute("data-mesh", "none");
  await expect(page.getByRole("status").filter({ hasText: "Reading your photo" })).toBeVisible();
  await shot(page, "scanning-no-mesh", "390");
  release();
  await toResults(page);
  // The photo and both overlays still show; only the mesh is missing.
  const photo = page.getByTestId("face-photo");
  await expect(photo.getByRole("img", { name: C.photo.overlayAlt.redness })).toBeAttached();
  await page.waitForTimeout(2_000);
  await expect(photo.locator("svg")).toHaveCount(0);
  await expectTable(page);
});
