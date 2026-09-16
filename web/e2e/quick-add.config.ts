import { defineConfig } from "@playwright/test";

/** Isolated browser checks use mocked API responses and never access account data. */
export default defineConfig({
  testDir: ".",
  testMatch: "quick-add.spec.ts",
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: false,
  },
  workers: 1,
});
