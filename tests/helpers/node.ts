import { deflateSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fontFilePath, type FontLoader } from '../../src/core/fonts'

const require = createRequire(import.meta.url)

/** Loads woff files straight from node_modules. */
export const nodeFontLoader: FontLoader = async (family, bold) => {
  const buf = readFileSync(require.resolve(fontFilePath(family, bold)))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}

function crc32(buf: Buffer): number {
  let c = ~0
  for (const b of buf) {
    c ^= b
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** Generates a colourful gradient PNG as a data URL (test image). */
export function gradientPng(w: number, h: number): string {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3
      const d = Math.hypot(x - w * 0.7, y - h * 0.3) / w
      raw[i] = Math.round(255 * (x / w))
      raw[i + 1] = Math.round(120 + 100 * Math.sin(y / 40))
      raw[i + 2] = Math.round(255 * Math.max(0, 1 - d))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
  return 'data:image/png;base64,' + png.toString('base64')
}
