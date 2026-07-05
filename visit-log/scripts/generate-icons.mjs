// Rasterizes the app icon (red gradient tile + white location pin) to the PNG
// sizes PWA/iOS require. Pure Node — no native image dependencies — so it runs
// in any CI container. Invoked via `npm run icons` (part of `npm run build`).
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons')

const GRAD_TOP = [255, 46, 59]
const GRAD_BOTTOM = [196, 5, 17]
const DOT = [227, 6, 19]
const WHITE = [255, 255, 255]

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})

function crc32(buf) {
  let c = 0xffffffff
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function insideRoundedRect(x, y, size, radius) {
  const rx = Math.max(Math.min(x, size - x), 0)
  const ry = Math.max(Math.min(y, size - y), 0)
  if (rx >= radius || ry >= radius) return true
  const dx = radius - rx
  const dy = radius - ry
  return dx * dx + dy * dy <= radius * radius
}

function insideTriangle(px, py, a, b, c) {
  const sign = (p1, p2, p3) => (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
  const d1 = sign([px, py], a, b)
  const d2 = sign([px, py], b, c)
  const d3 = sign([px, py], c, a)
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0
  return !(hasNeg && hasPos)
}

/**
 * @param {number} size       output pixel size
 * @param {boolean} rounded   transparent rounded corners (false = full-bleed square)
 * @param {number} scale      content scale (maskable icons need a safe zone)
 */
function renderIcon(size, rounded, scale) {
  const rgba = Buffer.alloc(size * size * 4)
  const SS = 3 // supersampling grid
  const cornerR = (116 / 512) * size
  const cx = size / 2
  const cy = (236 / 512) * size * scale + (size / 2) * (1 - scale)
  const pinR = (120 / 512) * size * scale
  const dotR = (52 / 512) * size * scale
  const tipY = cy + pinR * 1.62
  const baseY = cy + pinR * 0.5
  const baseHalf = pinR * 0.82

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let cover = 0
      let pin = 0
      let dot = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS
          const py = y + (sy + 0.5) / SS
          if (rounded && !insideRoundedRect(px, py, size, cornerR)) continue
          cover++
          const dx = px - cx
          const dy = py - cy
          const inDot = dx * dx + dy * dy <= dotR * dotR
          const inPin =
            dx * dx + dy * dy <= pinR * pinR ||
            insideTriangle(px, py, [cx - baseHalf, baseY], [cx + baseHalf, baseY], [cx, tipY])
          if (inDot) dot++
          else if (inPin) pin++
        }
      }
      const total = SS * SS
      if (cover === 0) continue
      const t = y / size
      const bg = [
        GRAD_TOP[0] + (GRAD_BOTTOM[0] - GRAD_TOP[0]) * t,
        GRAD_TOP[1] + (GRAD_BOTTOM[1] - GRAD_TOP[1]) * t,
        GRAD_TOP[2] + (GRAD_BOTTOM[2] - GRAD_TOP[2]) * t,
      ]
      const pinFrac = pin / cover
      const dotFrac = dot / cover
      const bgFrac = 1 - pinFrac - dotFrac
      const idx = (y * size + x) * 4
      for (let ch = 0; ch < 3; ch++) {
        rgba[idx + ch] = Math.round(bg[ch] * bgFrac + WHITE[ch] * pinFrac + DOT[ch] * dotFrac)
      }
      rgba[idx + 3] = Math.round((cover / total) * 255)
    }
  }
  return encodePng(size, rgba)
}

mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(join(OUT_DIR, 'icon-192.png'), renderIcon(192, true, 1))
writeFileSync(join(OUT_DIR, 'icon-512.png'), renderIcon(512, true, 1))
writeFileSync(join(OUT_DIR, 'icon-maskable-512.png'), renderIcon(512, false, 0.72))
writeFileSync(join(OUT_DIR, 'apple-touch-icon.png'), renderIcon(180, false, 0.92))
console.log('Icons generated in', OUT_DIR)
