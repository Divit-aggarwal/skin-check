import { devices } from "@playwright/test";
import base from "../../playwright.config";

// Mockup match (G37): each lane's *.match.ts shots at the mockup phone width
// (393, overlaid by tests/design/overlay.py) and at 320, 375 and 430 (looked
// at, not overlaid). The 393 viewport is the mockup screen (852) minus the iOS
// status bar (59). Shots go to docs/design/mockup-match/shots/<NN>-<state>@<width>.png.
// Against a running stack, through the slot wrapper:
//   PW_ARGS="-c tests/design/match.config.ts tests/design/<lane>.match.ts" bash scripts/with-stack-slot.sh npm run test:browser
const phone = devices["iPhone 13"];
const at = (width: number, height: number) => ({
  name: String(width),
  use: { ...phone, browserName: "chromium" as const, viewport: { width, height } },
});
export default {
  ...base,
  testDir: ".",
  testMatch: "*.match.ts",
  globalSetup: "../browser/warm-up.ts",
  use: { baseURL: base.use?.baseURL, trace: "off" as const },
  projects: [at(393, 793), at(320, 568), at(375, 812), at(430, 932)],
};
