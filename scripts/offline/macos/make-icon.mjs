#!/usr/bin/env node
// ============================================================================
// Generate a placeholder 1024×1024 app-icon source PNG (no deps).
// ----------------------------------------------------------------------------
//   node scripts/offline/macos/make-icon.mjs [out.png]
// A dark VANTORA-tone background with a centered rounded accent square. This is
// a BETA PLACEHOLDER — replace with the real brand icon before GA. The Tauri
// icon set (icons/*) is generated from it via `npx tauri icon`.
// ============================================================================
import zlib from 'node:zlib';
import fs from 'node:fs';

const N = 1024;
const bg = [0x0b, 0x12, 0x20]; // navy
const fg = [0x38, 0xbd, 0xf8]; // cyan
const fgDark = [0x0e, 0x74, 0x90];

// Centered rounded square covering ~52% of the canvas.
const pad = Math.round(N * 0.24);
const lo = pad, hi = N - pad;
const radius = Math.round(N * 0.10);

function inRoundedRect(x, y) {
  if (x < lo || x >= hi || y < lo || y >= hi) return false;
  const dx = x < lo + radius ? lo + radius - x : x > hi - radius ? x - (hi - radius) : 0;
  const dy = y < lo + radius ? lo + radius - y : y > hi - radius ? y - (hi - radius) : 0;
  return dx * dx + dy * dy <= radius * radius;
}

// RGBA scanlines, each prefixed with a 0 filter byte.
const rowLen = 1 + N * 4;
const raw = Buffer.alloc(rowLen * N);
for (let y = 0; y < N; y++) {
  const base = y * rowLen;
  raw[base] = 0; // filter: none
  for (let x = 0; x < N; x++) {
    const i = base + 1 + x * 4;
    let c = bg;
    if (inRoundedRect(x, y)) {
      // subtle vertical gradient inside the square
      const t = (y - lo) / (hi - lo);
      c = [
        Math.round(fg[0] * (1 - t) + fgDark[0] * t),
        Math.round(fg[1] * (1 - t) + fgDark[1] * t),
        Math.round(fg[2] * (1 - t) + fgDark[2] * t),
      ];
    }
    raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; raw[i + 3] = 0xff;
  }
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body) >>> 0, 0);
  return Buffer.concat([len, body, crc]);
}

// CRC32 (PNG)
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(N, 0); ihdr.writeUInt32BE(N, 4);
ihdr[8] = 8;   // bit depth
ihdr[9] = 6;   // color type RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = process.argv[2] || 'src-tauri/icons/icon-source.png';
fs.writeFileSync(out, png);
console.log(`› wrote ${out} (${N}×${N})`);
