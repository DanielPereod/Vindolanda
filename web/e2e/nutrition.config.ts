import { defineConfig } from "@playwright/test";

/** Isolated nutrition acceptance tests use mocked API responses and never access account data. */
export default defineConfig({
  testDir: ".",
  testMatch: "nutrition.spec.ts",
  use: { baseURL: "http://localhost:5176", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 5176 --strictPort",
    url: "http://localhost:5176",
    reuseExistingServer: false,
  },
  workers: 1,
});
