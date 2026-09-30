// Rebuilds src/app/favicon.ico from the logo mark: renders 16 and 32 px PNG
// frames with next/og and packs them into an ICO container. Run it with
// `pnpm icons:favicon` after the mark changes.
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { ImageResponse } from "next/og.js";

const SIZES = [16, 32] as const;
const OUTPUT = fileURLToPath(
  new URL("../src/app/favicon.ico", import.meta.url),
);

// Same geometry as src/components/logo-mark.tsx with literal colors.
function mark(size: number) {
  return createElement(
    "svg",
    { width: size, height: size, viewBox: "0 0 24 24" },
    createElement("rect", {
      width: 24,
      height: 24,
      rx: 6,
      fill: "#4F39F6",
    }),
    createElement("rect", {
      x: 5,
      y: 5,
      width: 10,
      height: 10,
      rx: 2.5,
      fill: "#FFFFFF",
      opacity: 0.45,
    }),
    createElement("rect", {
      x: 9,
      y: 9,
      width: 10,
      height: 10,
      rx: 2.5,
      fill: "#FFFFFF",
    }),
  );
}

async function renderPng(size: number): Promise<Buffer> {
  const response = new ImageResponse(mark(size), {
    width: size,
    height: size,
  });
  return Buffer.from(await response.arrayBuffer());
}

function packIco(frames: { size: number; png: Buffer }[]): Buffer {
  const headerSize = 6 + frames.length * 16;
  const header = Buffer.alloc(headerSize);
  // ICONDIR: reserved, type 1 (icon), image count.
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);

  let offset = headerSize;
  frames.forEach(({ size, png }, index) => {
    const entry = 6 + index * 16;
    header.writeUInt8(size, entry); // width
    header.writeUInt8(size, entry + 1); // height
    header.writeUInt8(0, entry + 2); // palette colors
    header.writeUInt8(0, entry + 3); // reserved
    header.writeUInt16LE(1, entry + 4); // color planes
    header.writeUInt16LE(32, entry + 6); // bits per pixel
    header.writeUInt32LE(png.length, entry + 8); // data size
    header.writeUInt32LE(offset, entry + 12); // data offset
    offset += png.length;
  });

  return Buffer.concat([header, ...frames.map((frame) => frame.png)]);
}

const frames = await Promise.all(
  SIZES.map(async (size) => ({ size, png: await renderPng(size) })),
);
const ico = packIco(frames);
await writeFile(OUTPUT, ico);
console.log(`Wrote ${OUTPUT} (${ico.length} bytes, ${SIZES.join(", ")} px)`);
