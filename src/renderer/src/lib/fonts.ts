import { FONTS, fontFilePath, hasBoldFace, type FontLoader } from '@core/fonts'
import type { Measurer } from '@core/measure'

// Bundle the woff files we need (regular + bold weights) as asset URLs.
const files = import.meta.glob<string>('../../../../node_modules/@fontsource/*/files/*-latin-{400,700,800}-normal.woff', {
  query: '?url',
  import: 'default',
  eager: true
})

function urlFor(family: string, bold: boolean): string {
  const path = fontFilePath(family, bold)
  const key = Object.keys(files).find((k) => k.endsWith(path))
  if (!key) throw new Error(`Font file missing: ${path}`)
  return files[key]
}

/** Registers every theme font with the document and waits until loaded. */
export async function installFonts(): Promise<void> {
  const jobs: Promise<unknown>[] = []
  for (const f of Object.values(FONTS)) {
    const faces: [boolean, string][] = [[false, '400']]
    if (hasBoldFace(f.family)) faces.push([true, '700'])
    for (const [bold, weight] of faces) {
      const face = new FontFace(f.family, `url(${urlFor(f.family, bold)}) format('woff')`, { weight })
      document.fonts.add(face)
      jobs.push(face.load().catch((e) => console.warn('font failed', f.family, e)))
    }
  }
  await Promise.all(jobs)
}

export const loadFontBytes: FontLoader = async (family, bold) => {
  const res = await fetch(urlFor(family, bold))
  return res.arrayBuffer()
}

// ---------------------------------------------------------------------------
// Canvas text measurer (same fonts as the preview → WYSIWYG line breaks)
// ---------------------------------------------------------------------------

const canvas = document.createElement('canvas')
const ctx2d = canvas.getContext('2d')!
const cache = new Map<string, number>()

export const canvasMeasurer: Measurer = {
  width(text, font, size, bold) {
    const key = `${font}|${bold ? 1 : 0}|${text}`
    let w = cache.get(key)
    if (w === undefined) {
      ctx2d.font = `${bold ? 700 : 400} 100px "${font}"`
      w = ctx2d.measureText(text).width
      if (cache.size > 50000) cache.clear()
      cache.set(key, w)
    }
    // width at 100px → at `size` px; 1px here == 1pt, 72pt per inch
    return (w * size) / 100 / 72
  }
}

export function clearMeasureCache(): void {
  cache.clear()
}
