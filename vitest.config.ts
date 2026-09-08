import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Node environment only — these tests cover the presign route and the two
// client-side network helpers, both of which are plain fetch/logic. No JSDOM,
// no React rendering: the component-level behaviour they'd exercise is
// already fully determined by the helpers tested here.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
