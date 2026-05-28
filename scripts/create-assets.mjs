#!/usr/bin/env node
// Generates placeholder PNG assets required by Expo (icon, splash, etc.)
// Uses only Node.js built-ins — no npm install needed.
// Run once from the project root:  node scripts/create-assets.mjs
//
// Replace these placeholder images with real branded art before
// submitting to the App Store or Google Play.

import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ─── PNG builder (pure Node, no deps) ────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuf  = Buffer.from(type, 'ascii');
  const lenBuf   = Buffer.allocUnsafe(4); lenBuf.writeUInt32BE(data.length);
  const combined = Buffer.concat([typeBuf, data]);
  const crcBuf   = Buffer.allocUnsafe(4); crcBuf.writeUInt32BE(crc32(combined));
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function makePNG(w, h, r, g, b, r2 = r, g2 = g, b2 = b) {
  // Build raw scanlines: filter-byte(0) + RGB pixels per row.
  // For square icons we use a subtle two-tone gradient.
  const mid  = Math.floor(h / 2);
  const rows = [];
  for (let y = 0; y < h; y++) {
    const t   = y < mid ? y / mid : (y - mid) / mid;
    const pr  = Math.round(r + (r2 - r) * t);
    const pg  = Math.round(g + (g2 - g) * t);
    const pb  = Math.round(b + (b2 - b) * t);
    const row = Buffer.allocUnsafe(1 + w * 3);
    row[0] = 0; // filter: None
    for (let x = 0; x < w; x++) {
      row[1 + x * 3]     = pr;
      row[1 + x * 3 + 1] = pg;
      row[1 + x * 3 + 2] = pb;
    }
    rows.push(row);
  }

  const ihdrData = Buffer.allocUnsafe(13);
  ihdrData.writeUInt32BE(w, 0);
  ihdrData.writeUInt32BE(h, 4);
  ihdrData[8]  = 8; // bit depth
  ihdrData[9]  = 2; // RGB
  ihdrData[10] = 0; ihdrData[11] = 0; ihdrData[12] = 0;

  const sig       = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const rawPixels = Buffer.concat(rows);
  const compressed = deflateSync(rawPixels, { level: 6 });

  return Buffer.concat([sig, chunk('IHDR', ihdrData), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0))]);
}

// ─── Asset definitions ────────────────────────────────────────────────────────
// Brand color: iGym blue (#007AFF) → darker blue (#0047AB)
const BLUE1 = [0, 122, 255];   // iOS blue
const BLUE2 = [0,  71, 171];   // darker shade for gradient
const WHITE = [255, 255, 255];

const assets = [
  // Expo icon (must be 1024×1024)
  { file: 'assets/icon.png',          w: 1024, h: 1024, c1: BLUE1, c2: BLUE2 },
  // Android adaptive icon foreground (1024×1024, safe zone 512×512)
  { file: 'assets/adaptive-icon.png', w: 1024, h: 1024, c1: BLUE1, c2: BLUE2 },
  // Splash screen (portrait — Expo scales it)
  { file: 'assets/splash.png',        w: 1284, h: 2778, c1: BLUE1, c2: BLUE2 },
  // Web favicon
  { file: 'assets/favicon.png',       w: 64,   h: 64,   c1: BLUE1, c2: BLUE2 },
];

mkdirSync(resolve(root, 'assets'), { recursive: true });

for (const { file, w, h, c1, c2 } of assets) {
  const buf = makePNG(w, h, ...c1, ...c2);
  writeFileSync(resolve(root, file), buf);
  console.log(`  ✓ ${file}  (${w}×${h}, ${(buf.length / 1024).toFixed(1)} KB)`);
}

console.log('\n✅ Placeholder assets created.');
console.log('   Replace with real branded art before App Store / Play Store submission.\n');
