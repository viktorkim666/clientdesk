import { defineConfig } from "vitest/config";
import path from "node:path";

const dirname = import.meta.dirname;

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "e2e/support/**/*.test.ts"],
    env: {
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    },
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/supabase/**"],
      reporter: ["text"],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(dirname, "./src"),
      // `server-only`'s default export throws unconditionally so a Client
      // Component build fails on import; Next's RSC bundler avoids that by
      // resolving the package's own `react-server` export condition to its
      // no-op `empty.js` instead. Vitest doesn't apply that condition, so
      // point at the same no-op file directly — the package's own escape
      // hatch, not a project-specific stub.
      "server-only": path.resolve(
        dirname,
        "./node_modules/server-only/empty.js",
      ),
    },
  },
});
