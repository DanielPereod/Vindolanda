import { defineConfig } from "@playwright/test";
/** Isolated notes acceptance tests never access account data. */
export default defineConfig({
  testDir: ".",
  testMatch: "notes.spec.ts",
  use: { baseURL: "http://localhost:5175", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- --port 5175 --strictPort",
    url: "http://localhost:5175",
    reuseExistingServer: false,
  },
  workers: 1,
});
