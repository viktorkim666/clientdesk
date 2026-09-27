import type { NextConfig } from "next";

// playwright.config.ts starts its own dev server on a separate port so
// e2e always runs with empty API keys, regardless of a dev server a
// developer already has running on :3000. Next.js locks `distDir` to one
// `next dev` process at a time (see experimental.lockDistDir), so the e2e
// server needs its own build directory to run alongside that other server.
const nextConfig: NextConfig = {
  ...(process.env.PLAYWRIGHT_DIST_DIR
    ? { distDir: process.env.PLAYWRIGHT_DIST_DIR }
    : {}),
};

export default nextConfig;
