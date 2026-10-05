import { devices } from "@playwright/test";
import base from "../../playwright.config";

// Design screenshots (docs/design/): every page and main state as a phone
// (390), a tablet (768) and a desktop browser (1280). Against a running stack
// (`npm run dev:local`):
//   SHOTS=before npx playwright test -c tests/design/playwright.config.ts
// The flow-to-results test scans a photo, so start from a fresh stack.
const phone = devices["iPhone 13"];
const config = {
  ...base,
  testDir: ".",
  testMatch: "*.shots.ts",
  globalSetup: "../browser/warm-up.ts",
  use: { baseURL: base.use?.baseURL, trace: "off" },
  projects: [
    { name: "390", use: { ...phone, browserName: "chromium", viewport: { width: 390, height: 844 } } },
    { name: "768", use: { ...devices["iPad Mini"], browserName: "chromium", viewport: { width: 768, height: 1024 } } },
    { name: "1280", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
};
export default config;
