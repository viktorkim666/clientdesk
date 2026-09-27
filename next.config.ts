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

  // No script-src/style-src: this app relies on Next.js's inline runtime
  // and style tags, and a nonce-based CSP tight enough to cover those is
  // its own project (wiring a per-request nonce through every layout and
  // the framework's own inline scripts). The directives below still block
  // the attacks a missing CSP leaves open - framing, foreign form posts,
  // and base-tag/object-embed injection - without that larger rework.
  //
  // `Strict-Transport-Security` is inert on http (browsers ignore it
  // outside https), so it's a no-op on localhost and only takes effect
  // once the app is served over https.
  headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
