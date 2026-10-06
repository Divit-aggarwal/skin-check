import { readFileSync } from "node:fs";
import { defineConfig, devices } from "@playwright/test";

// Dashboard lane browser tests (docs/lanes/dashboard-design.md §6). `npm run
// test:browser` starts a fresh stack and runs them. Or run
// against a stack already started with `npm run dev:local`; the ports come
// from PORT_BASE in .env.lane, as scripts/local-stack.sh reads it.
// The warm-up compiles each route once before the first test.
// testDir keeps Playwright away from the vitest files, and vitest only
// includes tests/**/*.test.ts, so it never picks up these *.spec.ts files.
const lane = (() => {
  try {
    return readFileSync(".env.lane", "utf8");
  } catch {
    return "";
  }
})();
const B = Number(process.env.PORT_BASE ?? /PORT_BASE=(\d+)/.exec(lane)?.[1] ?? 3100);
process.env.PW_AUTH_HOST ??= `127.0.0.1:${B + 1}`;
process.env.PW_FIRESTORE_HOST ??= `127.0.0.1:${B + 2}`;
process.env.PW_PORT ??= String(B);

export default defineConfig({
  testDir: "tests/browser",
  globalSetup: "./tests/browser/warm-up.ts",
  outputDir: ".local-stack/test-results", // gitignored, like the rest of the stack's output
  testMatch: "*.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 180_000, // the amd64 engine runs under emulation
  expect: { timeout: 20_000 },
  reporter: [["list"]],
  use: {
    ...devices["iPhone 13"],
    browserName: "chromium",
    viewport: { width: 390, height: 844 },
    baseURL: `http://localhost:${B}`,
    trace: "retain-on-failure",
  },
});
