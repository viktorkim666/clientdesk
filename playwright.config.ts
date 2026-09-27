import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  // Serial: every spec signs up its own users against one shared local
  // Supabase + dev server, so parallel workers racing the same dev server
  // compilation caused flaky timeouts unrelated to the app itself.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3100",
    trace: "on-first-retry",
  },
  webServer: {
    // A dedicated port and build directory so this server never collides
    // with a developer's own `pnpm dev` on :3000, and its own env so e2e
    // always runs against the fake AI generator and unconfigured billing
    // regardless of what's in .env.local.
    command: "pnpm dev --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      ANTHROPIC_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      STRIPE_PRO_PRICE_ID: "",
      SUPABASE_SECRET_KEY: "",
      PLAYWRIGHT_DIST_DIR: ".next-e2e",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
