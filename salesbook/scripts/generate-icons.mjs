// One-shot PWA icon generator: renders the SalesBook mark (SVG) to PNGs.
// Usage: npm i --no-save sharp && node scripts/generate-icons.mjs
import sharp from 'sharp';
import { mkdirSync } from 'node:fs';

const mark = (inset) => `
  <g transform="translate(${256 * inset}, ${256 * inset}) scale(${1 - inset})">
    <path d="M256 164c-36-24-84-33-126-28-9 1-16 9-16 18v172c0 11 10 19 21 18 40-5 86 4 121 28 35-24 81-33 121-28 11 1 21-7 21-18V154c0-9-7-17-16-18-42-5-90 4-126 28z"
      fill="none" stroke="#fff" stroke-width="27" stroke-linejoin="round"/>
    <path d="M256 170v196" stroke="#fff" stroke-width="24" stroke-linecap="round"/>
    <path d="M300 218l34 34 62-62" stroke="#fff" stroke-width="0" fill="none"/>
  </g>`;

const svg = (rx, inset = 0) => Buffer.from(`
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#1F4ED8"/>
      <stop offset="1" stop-color="#0EA5E9"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="${rx}" fill="url(#g)"/>
  ${mark(inset)}
</svg>`);

mkdirSync('public/icons', { recursive: true });
await sharp(svg(120)).resize(192, 192).png().toFile('public/icons/icon-192.png');
await sharp(svg(120)).resize(512, 512).png().toFile('public/icons/icon-512.png');
await sharp(svg(0, 0.12)).resize(512, 512).png().toFile('public/icons/maskable-512.png');
await sharp(svg(0)).resize(180, 180).png().toFile('public/icons/apple-touch-icon.png');
console.log('icons written to public/icons/');
