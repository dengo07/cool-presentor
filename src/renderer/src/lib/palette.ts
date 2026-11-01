import { mix, toHex, toRgb } from '@core/color'

/** Curated accent palettes (3 colours each). */
export const PALETTES: { name: string; colors: [string, string, string] }[] = [
  { name: 'Brazil', colors: ['009C3B', 'E8B400', '002776'] },
  { name: 'Ocean', colors: ['0284C7', '14B8A6', '6366F1'] },
  { name: 'Sunset', colors: ['EA580C', 'E11D48', 'EAB308'] },
  { name: 'Berry', colors: ['BE185D', '7C3AED', 'F472B6'] },
  { name: 'Forest', colors: ['15803D', 'A16207', '0F766E'] },
  { name: 'Earth', colors: ['B45309', '78716C', '65A30D'] },
  { name: 'Neon', colors: ['B6FF3B', 'FF2E88', '00E5FF'] },
  { name: 'Mono', colors: ['262626', '737373', 'A3A3A3'] }
]

export const BACKGROUNDS = ['FFFFFF', 'F4F1EA', 'F5F1FB', 'EEF2F6', '111111', '0B1020', '0F2219', '1E0B2E']

function hsl([r, g, b]: [number, number, number]): [number, number, number] {
  r /= 255
  g /= 255
  b /= 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  const d = max - min
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1))
  let h = 0
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [(h * 60 + 360) % 360, s, l]
}

function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255]
}

async function pixels(src: string): Promise<Uint8ClampedArray> {
  const img = new Image()
  img.src = src
  await img.decode()
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 64
  const ctx = c.getContext('2d')!
  ctx.drawImage(img, 0, 0, 64, 64)
  return ctx.getImageData(0, 0, 64, 64).data
}

/**
 * Picks three vivid, distinct colours from the deck's photos – so the theme
 * matches the imagery. Colours are nudged to mid lightness so they work as
 * accents on light and dark backgrounds.
 */
export async function paletteFromImages(srcs: string[]): Promise<[string, string, string] | null> {
  const buckets = new Map<string, { n: number; r: number; g: number; b: number }>()
  for (const src of srcs.slice(0, 12)) {
    const d = await pixels(src)
    for (let i = 0; i < d.length; i += 4) {
      const rgb: [number, number, number] = [d[i], d[i + 1], d[i + 2]]
      const [, s, l] = hsl(rgb)
      if (s < 0.35 || l < 0.18 || l > 0.82) continue
      const key = `${rgb[0] >> 5}-${rgb[1] >> 5}-${rgb[2] >> 5}`
      const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
      bk.n++
      bk.r += rgb[0]
      bk.g += rgb[1]
      bk.b += rgb[2]
      buckets.set(key, bk)
    }
  }
  const ranked = [...buckets.values()]
    .map((bk) => {
      const rgb: [number, number, number] = [bk.r / bk.n, bk.g / bk.n, bk.b / bk.n]
      // favour vivid colours: a small bright float beats a large grey-green field
      return { rgb, score: Math.pow(bk.n, 0.6) * Math.pow(hsl(rgb)[1], 2) }
    })
    .sort((a, b) => b.score - a.score)
  const picked: [number, number, number][] = []
  const hueDist = (a: number, b: number): number => Math.min(Math.abs(a - b), 360 - Math.abs(a - b))
  for (const c of ranked) {
    if (picked.every((p) => hueDist(hsl(p)[0], hsl(c.rgb)[0]) > 35)) picked.push(c.rgb)
    if (picked.length === 3) break
  }
  if (!picked.length) return null
  while (picked.length < 3) picked.push(toRgb(mix(toHex(picked[0]), '808080', 0.45 * picked.length)))
  // normalise to a confident accent: saturated, mid lightness
  return picked.map((rgb) => {
    const [h, s0, l0] = hsl(rgb)
    return toHex(fromHsl(h, Math.min(1, Math.max(0.55, s0 * 1.25)), Math.min(0.55, Math.max(0.38, l0))))
  }) as [string, string, string]
}
