// Generates the PWA PNG icons (192, 512, maskable 512, apple-touch 180)
// at build time — no binary icon files are kept in the repo.
//
// The artwork is NOT redrawn: it is the owner's dedicated icon-only
// MistriDako artwork (house+wrench, no text — sent 2026-11-20),
// embedded as a base64 data URI in client/src/logo.ts
// (LOGO_ICON_DATA_URI) because this repo is published through a
// text-only channel. This script decodes that PNG, box-downsamples it
// to each icon size (the maskable variant centres it at 80% on the
// icon's own white background, inside the safe zone), and re-encodes
// with the small PNG encoder below (node:zlib only). It also writes
// dist/og-image.png — the FULL official logo lockup (LOGO_DATA_URI,
// wordmark + tagline), which is what og:image / twitter:image point
// at; the icon artwork is for favicons and app icons only.
//
// Output goes to dist/ (Vite has already written the site there).

import { deflateSync, inflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ------------------------------------------------------- source artwork

function loadIconPixels() {
  const src = readFileSync(join(process.cwd(), "client/src/logo.ts"), "utf8");
  const m = src.match(/LOGO_ICON_DATA_URI\s*=\s*([\s\S]*?);\n/);
  if (!m) throw new Error("LOGO_ICON_DATA_URI not found in client/src/logo.ts");
  const b64 = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join("");
  const dataUri = b64.replace(/^data:image\/png;base64,/, "");
  return decodePng(Buffer.from(dataUri, "base64"));
}

// ------------------------------------------------------------- PNG codec

const crcTable = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter: none
    rgba.copy(raw, rowStart + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// Minimal decoder for the embedded icon: 8-bit, non-interlaced,
// colour type 2 (RGB) or 6 (RGBA) — the shapes gm/PNG writers emit.
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
  let off = 8;
  let width = 0;
  let height = 0;
  let colorType = 6;
  let bitDepth = 8;
  let interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("ascii", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    off += 12 + len;
  }
  if (bitDepth !== 8 || interlace !== 0 || (colorType !== 2 && colorType !== 6)) {
    throw new Error(`unsupported PNG: depth ${bitDepth}, type ${colorType}, interlace ${interlace}`);
  }
  const bpp = colorType === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * bpp;
  const px = Buffer.alloc(height * stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const row = px.subarray(y * stride, (y + 1) * stride);
    const prev = y > 0 ? px.subarray((y - 1) * stride, y * stride) : null;
    for (let x = 0; x < stride; x++) {
      const v = raw[p++];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev ? prev[x] : 0;
      const c = prev && x >= bpp ? prev[x - bpp] : 0;
      let out;
      switch (filter) {
        case 0: out = v; break;
        case 1: out = (v + a) & 0xff; break;
        case 2: out = (v + b) & 0xff; break;
        case 3: out = (v + ((a + b) >> 1)) & 0xff; break;
        case 4: {
          const pa = Math.abs(b - c);
          const pb = Math.abs(a - c);
          const pc = Math.abs(a + b - 2 * c);
          const pred = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          out = (v + pred) & 0xff;
          break;
        }
        default: throw new Error(`bad PNG filter ${filter}`);
      }
      row[x] = out;
    }
  }
  // Normalise to RGBA.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = px[i * bpp];
    rgba[i * 4 + 1] = px[i * bpp + 1];
    rgba[i * 4 + 2] = px[i * bpp + 2];
    rgba[i * 4 + 3] = bpp === 4 ? px[i * bpp + 3] : 255;
  }
  return { rgba, size: width };
}

// ------------------------------------------------------------ rasterising

// Box-average resize of a square RGBA image (downscale or same size).
function resizeSquare(src, srcSize, dstSize) {
  if (srcSize === dstSize) return Buffer.from(src);
  const out = Buffer.alloc(dstSize * dstSize * 4);
  const scale = srcSize / dstSize;
  for (let y = 0; y < dstSize; y++) {
    for (let x = 0; x < dstSize; x++) {
      const x0 = Math.floor(x * scale);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * scale));
      const y0 = Math.floor(y * scale);
      const y1 = Math.max(y0 + 1, Math.floor((y + 1) * scale));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let sy = y0; sy < y1 && sy < srcSize; sy++) {
        for (let sx = x0; sx < x1 && sx < srcSize; sx++) {
          const j = (sy * srcSize + sx) * 4;
          r += src[j]; g += src[j + 1]; b += src[j + 2]; a += src[j + 3]; n++;
        }
      }
      const o = (y * dstSize + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

function renderIcon(icon, size, { maskable = false } = {}) {
  if (!maskable) return encodePng(resizeSquare(icon.rgba, icon.size, size), size);
  // Maskable: white canvas, artwork centred at 80% (safe zone).
  const inner = Math.round(size * 0.8);
  const small = resizeSquare(icon.rgba, icon.size, inner);
  const canvas = Buffer.alloc(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    canvas[i * 4] = 255; canvas[i * 4 + 1] = 255; canvas[i * 4 + 2] = 255; canvas[i * 4 + 3] = 255;
  }
  const off = Math.round((size - inner) / 2);
  for (let y = 0; y < inner; y++) {
    small.copy(canvas, ((y + off) * size + off) * 4, y * inner * 4, (y + 1) * inner * 4);
  }
  return encodePng(canvas, size);
}

function loadFullLogoBytes() {
  const src = readFileSync(join(process.cwd(), "client/src/logo.ts"), "utf8");
  const m = src.match(/LOGO_DATA_URI\s*=\s*([\s\S]*?);\n/);
  if (!m) throw new Error("LOGO_DATA_URI not found in client/src/logo.ts");
  const b64 = [...m[1].matchAll(/"([^"]*)"/g)].map((x) => x[1]).join("");
  return Buffer.from(b64.replace(/^data:image\/png;base64,/, ""), "base64");
}

const icon = loadIconPixels();
const dist = join(process.cwd(), "dist");
writeFileSync(join(dist, "og-image.png"), loadFullLogoBytes());
console.log("generated dist/og-image.png (full official logo lockup)");
const jobs = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["icon-180.png", 180, {}],
];
for (const [name, size, opts] of jobs) {
  writeFileSync(join(dist, name), renderIcon(icon, size, opts));
  console.log(`generated dist/${name} (${size}x${size})`);
}
