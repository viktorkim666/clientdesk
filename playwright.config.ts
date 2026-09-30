import { execFileSync } from "node:child_process";
import { defineConfig, devices } from "@playwright/test";

let cachedSecretKey: string | undefined;

/**
 * The local stack's secret key, read from `supabase status -o env` in memory
 * and handed straight to the dev server's environment. It is never printed or
 * written to disk. The demo buttons need it to create sandbox users. Returns
 * "" when the stack is not running, which leaves the demo unconfigured (the
 * specs that need it then fail with a clear "isn't available" message).
 *
 * Older Supabase CLIs print `SERVICE_ROLE_KEY` instead of `SECRET_KEY`, so
 * that is the fallback (`scripts/demo/upload-template-blobs.mts` does the
 * same). The result is kept: Playwright loads this file more than once per
 * run, and each read would start another `pnpm supabase status`.
 */
function localSupabaseSecretKey(): string {
  if (cachedSecretKey !== undefined) return cachedSecretKey;

  try {
    const output = execFileSync("pnpm", ["supabase", "status", "-o", "env"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const valueOf = (name: string) => {
      const line = output.split("\n").find((l) => l.startsWith(`${name}=`));
      return line?.slice(name.length + 1).replace(/^"|"$/g, "");
    };
    cachedSecretKey =
      valueOf("SECRET_KEY") ?? valueOf("SERVICE_ROLE_KEY") ?? "";
  } catch {
    // The stack is not running; the specs that need the key report why.
    cachedSecretKey = "";
  }
  return cachedSecretKey;
}

export default defineConfig({
  testDir: "./e2e",
  // Clears the seeded AI-draft workspace's rate-limit rows before the suite
  // runs, so reruns can't exhaust its 50-per-24h cap. See the file itself.
  globalSetup: "./e2e/support/global-setup.ts",
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
    // regardless of what's in .env.local. The Supabase secret key comes from
    // the local stack so the demo buttons work; billing stays unconfigured
    // because it also needs the (empty) Stripe keys.
    command: "pnpm dev --port 3100",
    url: "http://localhost:3100",
    // Locally, a server already on :3100 is reused, and it keeps the
    // environment it was started with. If it was started before the local
    // stack (so without the secret key), the demo specs fail as "not
    // available": stop it and let Playwright start its own. CI always starts
    // a fresh one.
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3100",
      ANTHROPIC_API_KEY: "",
      STRIPE_SECRET_KEY: "",
      STRIPE_WEBHOOK_SECRET: "",
      STRIPE_PRO_PRICE_ID: "",
      SUPABASE_SECRET_KEY: localSupabaseSecretKey(),
      DEMO_VISITOR_SALT: "e2e-visitor-salt",
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
