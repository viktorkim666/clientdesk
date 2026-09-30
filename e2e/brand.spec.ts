import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

function pngSize(bytes: Buffer): { width: number; height: number } {
  const signature = bytes.subarray(0, 8).toString("hex");
  expect(signature).toBe("89504e470d0a1a0a");
  // The IHDR chunk follows the signature: width and height are the first two
  // big-endian 32-bit fields of its data.
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

async function metaContent(page: Page, selector: string): Promise<string> {
  const content = await page.locator(selector).getAttribute("content");
  expect(content, selector).toBeTruthy();
  return content ?? "";
}

async function fetchPng(request: APIRequestContext, url: string) {
  const response = await request.get(url);
  expect(response.status(), url).toBe(200);
  expect(response.headers()["content-type"]).toContain("image/png");
  return pngSize(await response.body());
}

test.describe("icons", () => {
  test("the page links an SVG icon that is served as SVG", async ({
    page,
    request,
  }) => {
    await page.goto("/");

    const href = await page
      .locator('link[rel="icon"][href*=".svg"]')
      .first()
      .getAttribute("href");
    expect(href).toBeTruthy();

    const response = await request.get(href ?? "");
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("image/svg+xml");
    expect(await response.text()).toContain("<svg");
  });

  test("/favicon.ico is an ICO with 16 and 32 pixel frames", async ({
    request,
  }) => {
    const response = await request.get("/favicon.ico");
    expect(response.status()).toBe(200);

    const bytes = await response.body();
    // ICONDIR: reserved 0, type 1 (icon), image count.
    expect(bytes.readUInt16LE(0)).toBe(0);
    expect(bytes.readUInt16LE(2)).toBe(1);
    expect(bytes.readUInt16LE(4)).toBe(2);
    // ICONDIRENTRY: width and height bytes at offsets 0 and 1 of each 16-byte
    // entry that follows the 6-byte header.
    const sizes = [0, 1].map((index) => bytes[6 + index * 16]);
    expect(sizes).toEqual([16, 32]);
    // Each frame is an embedded PNG.
    for (const index of [0, 1]) {
      const offset = bytes.readUInt32LE(6 + index * 16 + 12);
      expect(bytes.subarray(offset, offset + 4).toString("hex")).toBe(
        "89504e47",
      );
    }
  });

  test("the Apple touch icon is a 180x180 PNG", async ({ page, request }) => {
    await page.goto("/");

    const href = await page
      .locator('link[rel="apple-touch-icon"]')
      .getAttribute("href");
    expect(href).toBeTruthy();

    expect(await fetchPng(request, href ?? "")).toEqual({
      width: 180,
      height: 180,
    });
  });
});

test.describe("social preview", () => {
  test("Open Graph and Twitter metadata are present", async ({ page }) => {
    await page.goto("/");

    expect(await metaContent(page, 'meta[property="og:title"]')).toBe(
      "Clientdesk",
    );
    expect(await metaContent(page, 'meta[property="og:site_name"]')).toBe(
      "Clientdesk",
    );
    expect(await metaContent(page, 'meta[property="og:type"]')).toBe("website");
    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe(
      "summary_large_image",
    );
  });

  for (const [name, selector] of [
    ["og:image", 'meta[property="og:image"]'],
    ["twitter:image", 'meta[name="twitter:image"]'],
  ] as const) {
    test(`${name} is an absolute URL to a 1200x630 PNG`, async ({
      page,
      request,
      baseURL,
    }) => {
      await page.goto("/");

      const url = await metaContent(page, selector);
      expect(url).toMatch(/^https?:\/\//);
      // The metadata is built from NEXT_PUBLIC_SITE_URL. A reused dev server
      // started with another value would point the image at a different
      // host, so fail with that reason instead of a confusing fetch error.
      expect(baseURL, "the Playwright baseURL is configured").toBeTruthy();
      expect(
        new URL(url).origin,
        `${name} points at ${new URL(url).origin}, but the app under test is ${baseURL}. Is a server with another NEXT_PUBLIC_SITE_URL being reused?`,
      ).toBe(new URL(baseURL ?? "").origin);

      expect(await fetchPng(request, url)).toEqual({
        width: 1200,
        height: 630,
      });
    });
  }
});
