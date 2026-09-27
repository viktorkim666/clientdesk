import { test, expect } from "@playwright/test";

// Verifies the security headers `next.config.ts` sets on every route (see
// `headers()` there for what each one guards against and why the CSP has no
// script-src/style-src). `/login` is a static, unauthenticated page, so this
// doesn't depend on a signed-in session or seeded data.
test.describe("security headers", () => {
  test("are present on a page response", async ({ page }) => {
    const response = await page.request.get("/login");
    const headers = response.headers();

    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["content-security-policy"]).toBe(
      "frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
    expect(headers["strict-transport-security"]).toBe(
      "max-age=63072000; includeSubDomains",
    );
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
  });
});
