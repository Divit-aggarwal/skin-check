import { mkdirSync, readFileSync } from "node:fs";
import { devices, expect, test, type Page, type Route } from "@playwright/test";
import { DASHBOARD_COPY as C } from "@/components/dashboard/copy";
import { QUESTIONS_COPY as Q } from "@/components/skin-check/questionsCopy";
import { WIDTHS, type Width } from "./seed-questionnaire";
import { MESH_SEED } from "./seed-mesh";
import { signIn } from "./helpers";

// TD-37 (docs/design/face-mesh.md): the face mesh while the photo is read and
// on the results, Home and an opened check; Redness and Oiliness as the only
// readings; Breakouts, Texture and Dark marks from the user's answers. At 390,
// 768 and 1280. AFTER_SHOTS=1 writes the screenshots to docs/design/after-mesh/.

const FACE = process.env.LOCAL_STACK_FACE ?? "../skin-scan/fixtures/input_face.png";
const DIR = process.env.AFTER_SHOTS ? "docs/design/after-mesh" : ".local-stack/browser-shots";
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

const BAND = /\b(Low|Moderate|Elevated)\b/;
const HIDDEN_ROW = /^(Breakouts|Texture|Dark marks)$/;

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

/** The engine's real answer, fetched once and replayed after, so only the first test waits for the engine. */
let engineAnswer: { status: number; body: Buffer; headers: Record<string, string> } | null = null;
async function holdScan(page: Page) {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  await page.route(
    (url) => url.pathname === "/api/skin-scan",
    async (route: Route) => {
      await gate;
      if (!engineAnswer) {
        const res = await route.fetch({ timeout: 300_000 });
        engineAnswer = { status: res.status(), body: await res.body(), headers: res.headers() };
      }
      await route.fulfill(engineAnswer);
    }
  );
  return release;
}

async function photoAndAnalyze(page: Page) {
  await page.locator('input[type="file"]').setInputFiles({ name: "face.png", mimeType: "image/png", buffer: readFileSync(FACE) });
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

const chip = (page: Page, name: string) => page.getByRole("tablist", { name: "Analysis categories" }).getByRole("tab", { name, exact: true });

async function toResults(page: Page) {
  const results = page.getByRole("button", { name: "Get my results" });
  await expect(results).toBeEnabled({ timeout: 300_000 });
  await results.click();
  await expect(page.getByRole("heading", { name: "Your photo reading" })).toBeVisible({ timeout: 60_000 });
}

/** The readings rows on screen: Redness and Oiliness only, never one of the three. */
async function expectTwoRows(page: Page) {
  const rows = page.locator("dl dt");
  await expect(rows.first()).toBeVisible();
  const labels = await rows.allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  for (const l of labels) expect(l).not.toMatch(HIDDEN_ROW);
  expect(labels).toContain("Redness");
  expect(labels).toContain("Oiliness");
}

for (const width of WIDTHS) {
  test.describe(`TD-37 at ${width}px`, () => {
    test.use(DEVICE[width]);

    test("answered: the mesh sweeps while the photo is read, then each chip on the results", async ({ page }) => {
      test.setTimeout(480_000);
      const outside = watchHosts(page);
      const release = await holdScan(page);
      await signIn(page, MESH_SEED.answered[width].phoneNumber);
      await page.goto("/skin-check");
      await photoAndAnalyze(page);
      // The one question asked again on every check, then the last step, where the user waits.
      await expect(page.getByText("What are you currently using on your skin?")).toBeVisible({ timeout: 60_000 });
      await page.getByRole("button", { name: /Nothing right now/ }).click();
      await page.getByRole("button", { name: "Confirm selection" }).last().click();
      await expectScanning(page);
      await expect(page.getByRole("button", { name: "Analyzing your photo…" })).toBeDisabled();
      await shot(page, "scanning", width);
      release();

      await toResults(page);
      await expect(page.getByText(C.told.sources)).toBeVisible();
      await expectTwoRows(page);
      // The chips: the photo readings first, in a fixed order; no band on the three.
      const names = await page.getByRole("tablist", { name: "Analysis categories" }).getByRole("tab").allTextContents();
      expect(names).toEqual(["Redness", "Oiliness", "Breakouts", "Texture", "Dark marks"]);
      for (const name of names) {
        await chip(page, name).click();
        await expect(chip(page, name)).toHaveAttribute("aria-selected", "true");
        const panel = page.locator("h2", { hasText: new RegExp(`^${name}$`, "i") }).locator("..");
        if (name === "Redness" || name === "Oiliness") {
          await expect(page.getByRole("img", { name: `${name} heatmap over your photo` })).toBeAttached();
          await expect(panel).toContainText(BAND);
        } else {
          await expect(panel).toContainText(C.told.title);
          await expect(panel).toContainText(C.told.ownAnswer);
          await expect(panel).not.toContainText(BAND);
          await expect(page.getByRole("img", { name: /heatmap/ })).toHaveCount(0);
          if (name === "Breakouts") await expect(panel).toContainText("You chose breakouts as a main skin concern.");
          if (name === "Dark marks") await expect(panel).toContainText("Leaves a dark mark that lingers");
          if (name === "Texture") await expect(panel).toContainText(C.told.nothing("texture"));
        }
        await shot(page, `results-${name.toLowerCase().replace(" ", "-")}`, width);
      }
      // The area picker is the mesh over the photo; choosing an area highlights it.
      const picker = page.getByTestId("mesh-picker");
      await expect(picker).toBeVisible({ timeout: 60_000 });
      await picker.getByRole("button", { name: "Forehead" }).click({ force: true });
      await expect(picker.getByRole("button", { name: "Forehead" })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("heading", { name: "Forehead", level: 3 })).toBeVisible();
      await expectTwoRows(page);
      await shot(page, "results-area-forehead", width);
      expect(outside).toEqual([]);
    });

    test("skipped the questions: the three chips invite the user to answer them", async ({ page }) => {
      test.setTimeout(480_000);
      const release = await holdScan(page);
      await signIn(page, MESH_SEED.skipped[width].phoneNumber);
      await page.goto("/skin-check");
      await expect(page.getByRole("heading", { name: Q.title })).toBeVisible({ timeout: 60_000 });
      await page.getByRole("button", { name: Q.skipNow }).click();
      await photoAndAnalyze(page);
      await expectScanning(page);
      release();
      await toResults(page);
      await expectTwoRows(page);
      for (const name of ["Breakouts", "Texture", "Dark marks"]) {
        await chip(page, name).click();
        const panel = page.locator("h2", { hasText: new RegExp(`^${name}$`, "i") }).locator("..");
        await expect(panel).toContainText(C.told.skipped(name.toLowerCase()));
        await expect(panel.getByRole("link", { name: Q.answerLink })).toBeVisible();
        await expect(panel).not.toContainText(BAND);
      }
      await shot(page, "results-skipped-breakouts", width);
    });

    test("an opened check with no kept photo: the face drawing, two readings, the user's answers", async ({ page }) => {
      await signIn(page, MESH_SEED.noPhoto.phoneNumber);
      await page.goto(`/checks/${MESH_SEED.noPhoto.uid}-1`);
      await expect(page.getByText(C.history.pastLine)).toBeVisible({ timeout: 60_000 });
      await expect(page.getByTestId("mesh-picker")).toHaveCount(0);
      await expect(page.getByRole("button", { name: "Forehead" })).toBeVisible();
      await expectTwoRows(page);
      await expect(page.getByRole("heading", { name: C.told.listTitle })).toBeVisible();
      await expect(page.getByText("You chose breakouts as a main skin concern.")).toBeVisible();
      await shot(page, "check-no-photo", width);
    });

    test("a kept photo: the mesh on Home and the opened check, with the chosen area", async ({ page }) => {
      const outside = watchHosts(page);
      await signIn(page, MESH_SEED.kept.phoneNumber);
      const home = page.getByTestId("mesh-picker");
      await expect(home).toBeVisible({ timeout: 90_000 });
      await expectTwoRows(page);
      // Keyboard: the middle of the cheeks' outline is the nose, so a pointer click there picks the nose, as it should.
      await home.getByRole("button", { name: "Cheeks" }).focus();
      await page.keyboard.press("Enter");
      await expect(home.getByRole("button", { name: "Cheeks" })).toHaveAttribute("aria-pressed", "true");
      await shot(page, "home-kept-photo", width);
      await page.goto(`/checks/${MESH_SEED.kept.uid}-1`);
      await expect(page.getByTestId("mesh-picker")).toBeVisible({ timeout: 90_000 });
      await expectTwoRows(page);
      await shot(page, "check-kept-photo", width);
      expect(outside).toEqual([]);
    });
  });
}

test("skipped questions on an opened check: no topic list, the existing invitation", async ({ page }) => {
  await signIn(page, MESH_SEED.noPhotoSkipped.phoneNumber);
  await page.goto(`/checks/${MESH_SEED.noPhotoSkipped.uid}-1`);
  await expect(page.getByText(Q.checkSkipped)).toBeVisible({ timeout: 60_000 });
  await expectTwoRows(page);
  await expect(page.getByText(C.told.sources)).toBeVisible();
  await shot(page, "check-skipped", "390");
});

test("the bucket refuses a read from our site (today's production CORS): the face drawing, no error", async ({ page }) => {
  await page.route((url) => url.hostname === "127.0.0.1" && url.pathname.includes("/original.jpg"), (route) => route.abort("accessdenied"));
  await signIn(page, MESH_SEED.kept.phoneNumber);
  await expect(page.getByRole("heading", { name: C.current.title })).toBeVisible();
  await expectTwoRows(page);
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId("mesh-picker")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Forehead" })).toBeVisible();
});

test("reduced motion: the mesh stays still, no sweeping band", async ({ page }) => {
  test.setTimeout(300_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const release = await holdScan(page);
  await signIn(page, MESH_SEED.skipped["390"].phoneNumber);
  await page.goto("/skin-check");
  await page.getByRole("button", { name: Q.skipNow }).click();
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
  await page.getByRole("button", { name: Q.skipNow }).click();
  await photoAndAnalyze(page);
  const scanning = page.getByTestId("scanning-photo");
  await expect(scanning).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(3_000);
  await expect(scanning).toHaveAttribute("data-mesh", "none");
  await expect(page.getByRole("status").filter({ hasText: "Reading your photo" })).toBeVisible();
  await shot(page, "scanning-no-mesh", "390");
  release();
  await toResults(page);
  await expectTwoRows(page);
  await expect(page.getByTestId("mesh-picker")).toHaveCount(0);
});
