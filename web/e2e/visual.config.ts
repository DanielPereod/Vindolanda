import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "_visual.spec.ts",
  use: { baseURL: "http://localhost:5175", trace: "off" },
  webServer: {
    command: "npm run dev -- --port 5175 --strictPort",
    url: "http://localhost:5175",
    reuseExistingServer: false,
  },
  workers: 1,
});
