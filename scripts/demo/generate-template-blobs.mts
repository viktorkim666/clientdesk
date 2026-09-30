// Rebuilds the 8 sample files in supabase/demo/files/ that back the file rows
// of the Northwind template (supabase/demo/template.sql). The output is
// deterministic, so running it again changes nothing unless this file does.
// Run it with `node scripts/demo/generate-template-blobs.mts`, then copy the
// printed sizes into the size_bytes column of the template's file rows (the
// unit test in src/lib/demo/template-files.test.ts fails if they differ).
//
// No dependencies: PNG and ZIP are packed by hand with node:zlib, PDF is a
// hand-written minimal file with one page per document.
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { crc32, deflateSync } from "node:zlib";

const OUTPUT_DIR = fileURLToPath(
  new URL("../../supabase/demo/files/", import.meta.url),
);

type Color = readonly [number, number, number];

// PNG ------------------------------------------------------------------

class Canvas {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;

  constructor(width: number, height: number, background: Color) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height * 3);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        this.set(x, y, background);
      }
    }
  }

  set(x: number, y: number, color: Color): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) {
      return;
    }
    const offset = (y * this.width + x) * 3;
    this.data[offset] = color[0];
    this.data[offset + 1] = color[1];
    this.data[offset + 2] = color[2];
  }

  rect(x: number, y: number, w: number, h: number, color: Color): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        this.set(xx, yy, color);
      }
    }
  }

  roundRect(
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
    color: Color,
  ): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) {
        const dx = Math.max(x + r - xx, 0, xx - (x + w - 1 - r));
        const dy = Math.max(y + r - yy, 0, yy - (y + h - 1 - r));
        if (dx * dx + dy * dy <= r * r) {
          this.set(xx, yy, color);
        }
      }
    }
  }

  circle(cx: number, cy: number, r: number, color: Color): void {
    this.roundRect(cx - r, cy - r, r * 2, r * 2, r, color);
  }

  verticalGradient(from: Color, to: Color): void {
    for (let y = 0; y < this.height; y++) {
      const t = y / (this.height - 1);
      const color: Color = [
        Math.round(from[0] + (to[0] - from[0]) * t),
        Math.round(from[1] + (to[1] - from[1]) * t),
        Math.round(from[2] + (to[2] - from[2]) * t),
      ];
      this.rect(0, y, this.width, 1, color);
    }
  }
}

function pngChunk(type: string, body: Uint8Array): Buffer {
  const typeAndBody = Buffer.concat([Buffer.from(type, "ascii"), body]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(typeAndBody));
  return Buffer.concat([length, typeAndBody, checksum]);
}

function encodePng(canvas: Canvas): Buffer {
  const rowBytes = canvas.width * 3;
  const raw = Buffer.alloc((rowBytes + 1) * canvas.height);
  for (let y = 0; y < canvas.height; y++) {
    // Filter type 0 (none) at the start of each scanline.
    raw[y * (rowBytes + 1)] = 0;
    Buffer.from(canvas.data.buffer, y * rowBytes, rowBytes).copy(
      raw,
      y * (rowBytes + 1) + 1,
    );
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(canvas.width, 0);
  header.writeUInt32BE(canvas.height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // color type: truecolor
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

const INK: Color = [0x1f, 0x29, 0x37];
const MUTED: Color = [0xc9, 0xcd, 0xd4];
const WHITE: Color = [0xff, 0xff, 0xff];
const TEAL: Color = [0x0f, 0x76, 0x6e];
const SAND: Color = [0xe8, 0xd5, 0xb0];

// A stand-in for a homepage design: header, hero and three cards, with grey
// bars where text would be.
function homepageMockup(): Buffer {
  const c = new Canvas(960, 600, [0xfb, 0xf6, 0xee]);
  c.rect(0, 0, 960, 64, WHITE);
  c.roundRect(32, 18, 28, 28, 8, [0xc2, 0x41, 0x0c]);
  c.rect(72, 28, 96, 8, INK);
  for (let i = 0; i < 4; i++) {
    c.rect(560 + i * 90, 28, 62, 8, MUTED);
  }
  c.roundRect(860, 16, 72, 32, 16, [0xc2, 0x41, 0x0c]);

  c.roundRect(32, 96, 896, 240, 20, [0xf4, 0xdb, 0xb8]);
  c.rect(72, 136, 360, 18, INK);
  c.rect(72, 168, 300, 18, INK);
  c.rect(72, 214, 400, 8, [0x7a, 0x6a, 0x55]);
  c.rect(72, 234, 340, 8, [0x7a, 0x6a, 0x55]);
  c.roundRect(72, 276, 132, 36, 18, [0xc2, 0x41, 0x0c]);
  c.circle(742, 216, 92, [0xe0, 0xa8, 0x6c]);
  c.circle(742, 216, 56, [0xf7, 0xe6, 0xcb]);

  const cardColors: Color[] = [
    [0xe0, 0xa8, 0x6c],
    [0xb9, 0x7b, 0x4a],
    [0xd9, 0x8e, 0x5a],
  ];
  cardColors.forEach((color, i) => {
    const x = 32 + i * 304;
    c.roundRect(x, 368, 288, 200, 16, WHITE);
    c.roundRect(x + 24, 392, 56, 56, 14, color);
    c.rect(x + 24, 470, 160, 12, INK);
    c.rect(x + 24, 496, 232, 8, MUTED);
    c.rect(x + 24, 514, 200, 8, MUTED);
  });
  return encodePng(c);
}

// Two logo directions side by side: a rounded wordmark and a monogram.
function logoDirections(): Buffer {
  const c = new Canvas(960, 480, [0xf1, 0xf5, 0xf4]);
  c.verticalGradient([0xf1, 0xf5, 0xf4], [0xdb, 0xe8, 0xe6]);
  c.roundRect(32, 32, 432, 416, 20, WHITE);
  c.roundRect(496, 32, 432, 416, 20, TEAL);

  // Direction A: a pill wordmark.
  c.roundRect(92, 176, 312, 96, 48, TEAL);
  for (let i = 0; i < 6; i++) {
    c.roundRect(130 + i * 40, 204, 24, 40, 12, WHITE);
  }
  c.rect(92, 312, 200, 10, MUTED);
  c.rect(92, 336, 140, 10, MUTED);

  // Direction B: a monogram on the dark panel.
  c.circle(712, 240, 104, SAND);
  c.circle(712, 240, 84, TEAL);
  c.rect(676, 196, 20, 88, SAND);
  c.rect(728, 196, 20, 88, SAND);
  for (let i = 0; i < 88; i++) {
    c.rect(676 + Math.round((i * 52) / 88), 196 + i, 20, 1, SAND);
  }
  c.rect(596, 380, 232, 10, [0x9c, 0xd0, 0xc9]);
  c.rect(636, 404, 152, 10, [0x9c, 0xd0, 0xc9]);
  return encodePng(c);
}

// PDF ------------------------------------------------------------------

type PdfDocument = {
  title: string;
  subtitle: string;
  lines: readonly string[];
};

function pdfEscape(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function encodePdf({ title, subtitle, lines }: PdfDocument): Buffer {
  const content: string[] = [
    "0.059 0.463 0.431 rg",
    "56 742 60 6 re f",
    "BT /F2 26 Tf 56 700 Td 0.122 0.161 0.216 rg",
    `(${pdfEscape(title)}) Tj ET`,
    "BT /F1 12 Tf 56 676 Td 0.42 0.45 0.5 rg",
    `(${pdfEscape(subtitle)}) Tj ET`,
    "BT /F1 12 Tf 56 630 Td 18 TL 0.122 0.161 0.216 rg",
    ...lines.map((line, i) => `${i === 0 ? "" : "T* "}(${pdfEscape(line)}) Tj`),
    "ET",
  ];
  const stream = content.join("\n");

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

// DOCX (a ZIP of three XML parts, stored without compression) --------------

type ZipEntry = { name: string; data: Buffer };

function encodeZip(entries: readonly ZipEntry[]): Buffer {
  const DOS_TIME = 0;
  const DOS_DATE = 0x21; // 1980-01-01, so the output never changes
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const { name, data } of entries) {
    const nameBytes = Buffer.from(name, "utf8");
    const checksum = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBytes, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(DOS_TIME, 12);
    central.writeUInt16LE(DOS_DATE, 14);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);

    offset += local.length + nameBytes.length + data.length;
  }

  const centralDirectory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralDirectory, end]);
}

function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function encodeDocx(paragraphs: readonly string[]): Buffer {
  const body = paragraphs
    .map(
      (text) =>
        `<w:p><w:r><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r></w:p>`,
    )
    .join("");
  const files: ZipEntry[] = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
          "</Types>",
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
          "</Relationships>",
      ),
    },
    {
      name: "word/document.xml",
      data: Buffer.from(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
          `<w:body>${body}</w:body></w:document>`,
      ),
    },
  ];
  return encodeZip(files);
}

// Files ------------------------------------------------------------------

// Names match the file rows in supabase/demo/template.sql.
const FILES: ReadonlyArray<readonly [string, Buffer]> = [
  ["homepage-mockup.png", homepageMockup()],
  ["logo-directions.png", logoDirections()],
  [
    "brand-guidelines.pdf",
    encodePdf({
      title: "Lumen Dental Brand Guidelines",
      subtitle: "Prepared by Northwind Studio",
      lines: [
        "Color: deep teal (#0F766E) with a warm sand accent (#E8D5B0).",
        "Both pass contrast checks on the clinic's printed forms.",
        "",
        "Logo: use the rounded wordmark on light backgrounds and the monogram",
        "on teal. Keep clear space equal to the height of the letter L.",
        "",
        "Typography: a friendly sans-serif for headings, a neutral one for body",
        "text. Body copy is never smaller than 11 pt in print.",
        "",
        "Tone: calm, plain and warm. Say what happens next, not what could go wrong.",
      ],
    }),
  ],
  [
    "holiday-menu-proofs.pdf",
    encodePdf({
      title: "Holiday Menu: Print Proofs",
      subtitle: "Acme Bakery, first proof from the printer",
      lines: [
        "Colors match the screen mockups.",
        "The pastry photos look slightly dark, so they are being re-exported",
        "with a brighter profile.",
        "",
        "Page 1: Cakes and tarts",
        "Page 2: Bread and morning pastries",
        "Page 3: Catering and pre-orders",
        "",
        "Next: corrected photos, then a second proof for sign-off.",
      ],
    }),
  ],
  [
    "campaign-results.pdf",
    encodePdf({
      title: "Launch Campaign: Results",
      subtitle: "Fernhill Books, first weekend",
      lines: [
        "Newsletter: 3,200 readers reached.",
        "Pre-order page: 410 visits in the first weekend.",
        "",
        "What worked: the teaser posts before launch day and a short",
        "newsletter with one clear button.",
        "",
        "What to repeat: the same schedule for the autumn titles.",
      ],
    }),
  ],
  [
    "gallery-layout.pdf",
    encodePdf({
      title: "Portfolio Gallery Layout",
      subtitle: "Cedar & Stone Landscaping",
      lines: [
        "Approved layout: a three-column grid on desktop, one column on phones.",
        "Before-and-after sliders for the three biggest garden projects.",
        "",
        "Each project page: a hero photo, a short story, the scope of work",
        "and three to six supporting photos.",
        "",
        "Please upload the originals of your last five jobs.",
      ],
    }),
  ],
  [
    "site-copy-feedback.docx",
    encodeDocx([
      "Acme Bakery: website copy feedback",
      "Homepage: love the headline. Can we mention that everything is baked the same morning?",
      "Menu page: please list allergens under each item, not in a footnote.",
      "Catering form: two days notice is enough for most orders, so please change the note.",
    ]),
  ],
  [
    "shipping-rules.docx",
    encodeDocx([
      "Fernhill Books: shipping rules",
      "Local delivery: free above a set order value, flat fee below it.",
      "Standard post: priced by weight in three bands.",
      "Pre-orders ship together on release day.",
    ]),
  ],
];

await mkdir(OUTPUT_DIR, { recursive: true });
for (const [name, data] of FILES) {
  await writeFile(new URL(name, `file://${OUTPUT_DIR}`), data);
  console.log(`${name} ${data.length}`);
}
