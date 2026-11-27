import { defineConfig } from "@playwright/test"

// e2e runs against `next start` and a local Supabase with Mailpit and tests/e2e/github-mock.ts.
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:3000", trace: "off" },
  webServer: { command: "npm run start", url: "http://localhost:3000/signup", reuseExistingServer: !process.env.CI, timeout: 60_000 },
})
