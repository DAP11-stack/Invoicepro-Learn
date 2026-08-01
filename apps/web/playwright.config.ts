import { fileURLToPath } from "node:url";

import { defineConfig, devices } from "@playwright/test";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));

export default defineConfig({
  testDir: "./e2e",
  outputDir: "../../test-results/e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5173",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
    video: "retain-on-failure"
  },
  webServer: [
    {
      command: "npm run dev:api",
      cwd: repositoryRoot,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      url: "http://127.0.0.1:3000/api/v1/health"
    },
    {
      command: "npm run dev:web -- --host 127.0.0.1",
      cwd: repositoryRoot,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      url: "http://127.0.0.1:5173"
    }
  ]
});
