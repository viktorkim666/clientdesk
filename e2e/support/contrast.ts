import type { Locator, Page } from "@playwright/test";

// WCAG contrast of `fg` over an opaque `bg`. `fg` may carry alpha. A canvas
// resolves any CSS color the browser understands, including oklch and
// color-mix results that getComputedStyle returns unchanged.
export async function contrastRatio(
  page: Page,
  fg: string,
  bg: string,
): Promise<number> {
  return page.evaluate(
    ([fgCss, bgCss]) => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) {
        throw new Error("2d canvas context is unavailable");
      }
      const luminance = (r: number, g: number, b: number) => {
        const [lr, lg, lb] = [r, g, b].map((channel) => {
          const value = channel / 255;
          return value <= 0.03928
            ? value / 12.92
            : ((value + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
      };
      const pixel = (layers: string[]) => {
        context.clearRect(0, 0, 1, 1);
        for (const layer of layers) {
          context.fillStyle = layer;
          context.fillRect(0, 0, 1, 1);
        }
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        return luminance(r, g, b);
      };
      const back = pixel([bgCss]);
      const front = pixel([bgCss, fgCss]);
      const [light, dark] = back > front ? [back, front] : [front, back];
      return (light + 0.05) / (dark + 0.05);
    },
    [fg, bg],
  );
}

// Background painted behind an element: its own, else the nearest ancestor's.
export async function backgroundBehind(locator: Locator): Promise<string> {
  return locator.evaluate((element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const color = getComputedStyle(node).backgroundColor;
      if (color !== "rgba(0, 0, 0, 0)" && color !== "transparent") {
        return color;
      }
    }
    return getComputedStyle(document.body).backgroundColor;
  });
}
