// Generates the PWA PNG icons (192, 512, maskable 512, apple-touch 180)
// from code at build time — no binary icon files are kept in the repo.
//
// The artwork is the GhorSheba brand mark (house outline + leaf, as drawn
// by the Logo component in client/src/lib.tsx) rasterised analytically:
// a #087A35 rounded square, a white house outline and an orange/white
// leaf. Shapes are evaluated per pixel on a 4x supersampled grid and
// box-downsampled for smooth edges, then encoded as PNG with node:zlib.
//
// Output goes to dist/ (Vite has already written the site there).

import { deflateSync } from "node:zlib";
import { writeFileSync } from "node:fs";
import { join } from "node:path";

const GREEN = [8, 122, 53];
const WHITE = [255, 255, 255];
const ORANGE = [255, 138, 0];

// ---------------------------------------------------------------- PNG codec

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

// ------------------------------------------------------------- shape helpers
// All geometry is in the brand mark's 48x48 viewBox space.

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l2 = dx * dx + dy * dy;
  let t = l2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Is (x, y) inside a rotated ellipse?
function inEllipse(x, y, cx, cy, rx, ry, angleDeg) {
  const a = (angleDeg * Math.PI) / 180;
  const dx = x - cx;
  const dy = y - cy;
  const lx = dx * Math.cos(a) + dy * Math.sin(a);
  const ly = -dx * Math.sin(a) + dy * Math.cos(a);
  return (lx * lx) / (rx * rx) + (ly * ly) / (ry * ry) <= 1;
}

// Colour of the brand mark at viewBox point (x, y), or null for empty.
function markColor(x, y) {
  // Leaf (drawn over the house): two rotated ellipses meeting at (24, 33).
  if (inEllipse(x, y, 21.2, 28.6, 4.6, 2.6, -52)) return ORANGE;
  if (inEllipse(x, y, 26.9, 28.4, 4.4, 2.5, -128)) return WHITE;
  // House outline, stroke width ~3.4 (the SVG uses 4 at a larger visual
  // weight; 3.4 reads better at small icon sizes).
  const half = 1.7;
  // Roof: (6,22) -> (24,7) -> (42,22)
  if (distToSegment(x, y, 6, 22, 24, 7) <= half) return WHITE;
  if (distToSegment(x, y, 24, 7, 42, 22) <= half) return WHITE;
  // Walls: left (11,20)-(11,36), right (37,20)-(37,36), floor (11,37)-(37,37)
  if (distToSegment(x, y, 11, 20.5, 11, 36) <= half) return WHITE;
  if (distToSegment(x, y, 37, 20.5, 37, 36) <= half) return WHITE;
  if (distToSegment(x, y, 11.5, 37, 36.5, 37) <= half) return WHITE;
  return null;
}

// --------------------------------------------------------------- rasteriser

function renderIcon(size, { maskable = false } = {}) {
  const SS = 4; // supersampling factor
  const big = size * SS;
  const px = new Float32Array(big * big * 4);

  // Mark placement in the 512-space canvas: regular icons use the SVG's
  // own layout (mark inset ~13%); maskable icons shrink the mark into
  // the safe zone and bleed the background to the edges.
  const inset = maskable ? 0.21 : 0.13; // fraction of canvas on each side
  const markPx = big * (1 - inset * 2);
  const offset = big * inset;
  const radius = maskable ? 0 : big * 0.1875; // matches icon.svg rx=96/512

  for (let by = 0; by < big; by++) {
    for (let bx = 0; bx < big; bx++) {
      const i = (by * big + bx) * 4;
      // Background: rounded-rect clip in canvas space.
      const cx = Math.max(radius - bx, 0, bx - (big - 1 - radius));
      const cy = Math.max(radius - by, 0, by - (big - 1 - radius));
      if (cx * cx + cy * cy > radius * radius) continue; // transparent
      let r = GREEN[0];
      let g = GREEN[1];
      let b = GREEN[2];
      // Brand mark in viewBox space.
      const vx = ((bx - offset) / markPx) * 48;
      const vy = ((by - offset) / markPx) * 48;
      if (vx >= 0 && vx <= 48 && vy >= 0 && vy <= 48) {
        const c = markColor(vx, vy);
        if (c) {
          r = c[0];
          g = c[1];
          b = c[2];
        }
      }
      px[i] = r;
      px[i + 1] = g;
      px[i + 2] = b;
      px[i + 3] = 255;
    }
  }

  // Box downsample SS x SS -> size x size RGBA buffer.
  const out = Buffer.alloc(size * size * 4);
  const area = SS * SS;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const j = ((y * SS + sy) * big + (x * SS + sx)) * 4;
          r += px[j];
          g += px[j + 1];
          b += px[j + 2];
          a += px[j + 3];
        }
      }
      const o = (y * size + x) * 4;
      out[o] = Math.round(r / area);
      out[o + 1] = Math.round(g / area);
      out[o + 2] = Math.round(b / area);
      out[o + 3] = Math.round(a / area);
    }
  }
  return encodePng(out, size);
}

const dist = join(process.cwd(), "dist");
const jobs = [
  ["icon-192.png", 192, {}],
  ["icon-512.png", 512, {}],
  ["icon-maskable-512.png", 512, { maskable: true }],
  ["icon-180.png", 180, {}],
];
for (const [name, size, opts] of jobs) {
  writeFileSync(join(dist, name), renderIcon(size, opts));
  console.log(`generated dist/${name} (${size}x${size})`);
}
