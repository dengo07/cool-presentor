import type { Para } from './scene'

/** Measures a single line of text. Width returned in inches. */
export interface Measurer {
  width(text: string, font: string, sizePt: number, bold: boolean): number
}

/** Rough, font-agnostic measurer used outside the browser (tests, CLI). */
export const heuristicMeasurer: Measurer = {
  width(text, _font, size, bold) {
    let units = 0
    for (const ch of text) {
      if (ch === ' ') units += 0.28
      else if (/[il.,:;'|!]/.test(ch)) units += 0.28
      else if (/[mwMW@%]/.test(ch)) units += 0.85
      else if (/[A-Z0-9]/.test(ch)) units += 0.66
      else units += 0.53
    }
    return (units * size * (bold ? 1.06 : 1)) / 72
  }
}

export interface TextStyle {
  font: string
  bold: boolean
  lineHeight: number
  tracking?: number // pt
  upper?: boolean
}

/** CSS-equivalent line box height factor. Shared by preview + measurement. */
export const LINE_BOX = 1.2

// Small safety margin: PowerPoint's renderer is a touch wider than browsers.
const SAFETY = 1.05

/** Wraps paragraphs into a box width; returns total height in inches and line count. */
export function measureParas(
  m: Measurer,
  paras: Para[],
  style: TextStyle,
  size: number,
  boxW: number
): { height: number; lines: number; widest: number; overflow: boolean } {
  let lines = 0
  let overflow = false
  let height = 0
  let widest = 0
  const lineH = (size * style.lineHeight * LINE_BOX) / 72
  for (const p of paras) {
    const avail = boxW - (p.bullet ? p.bullet.indent : 0)
    const words: { text: string; bold: boolean }[] = []
    for (const r of p.runs) {
      const t = style.upper ? r.text.toUpperCase() : r.text
      for (const w of t.split(/(\s+)/)) if (w) words.push({ text: w, bold: r.bold ?? style.bold })
    }
    let lineW = 0
    let pl = 1
    for (const w of words) {
      const isSpace = /^\s+$/.test(w.text)
      const ww =
        m.width(w.text, style.font, size, w.bold) * SAFETY + ((style.tracking ?? 0) * w.text.length) / 72
      if (!isSpace && lineW > 0 && lineW + ww > avail) {
        widest = Math.max(widest, lineW)
        pl++
        lineW = ww
      } else if (!(isSpace && lineW === 0)) {
        lineW += ww
      }
      // A single word wider than the box would be broken mid-word by the
      // renderer – count the extra lines so fitting shrinks the text instead.
      if (!isSpace && ww > avail) {
        overflow = true
        const extra = Math.ceil(ww / avail) - 1
        pl += extra
        lineW = ww - extra * avail
      }
    }
    widest = Math.max(widest, lineW + (p.bullet ? p.bullet.indent : 0))
    lines += pl
    height += pl * lineH + ((p.spaceBefore ?? 0) / 72)
  }
  return { height, lines, widest, overflow }
}

/** Largest font size (stepping down) at which paras fit inside w×h. */
export function fitSize(
  m: Measurer,
  paras: Para[],
  style: TextStyle,
  maxSize: number,
  minSize: number,
  w: number,
  h: number,
  maxLines = Infinity
): { size: number; height: number; lines: number; widest: number; overflow: boolean } {
  let size = maxSize
  for (;;) {
    const r = measureParas(m, scaleParas(paras, size / maxSize), style, size, w)
    // a word wider than the box would be split mid-word, so that never counts as fitting
    if ((r.height <= h && r.lines <= maxLines && !r.overflow) || size <= minSize) return { size, ...r }
    size = Math.max(minSize, Math.round((size - Math.max(1, size * 0.06)) * 2) / 2)
  }
}

/** Para spacing scales with font size. */
export function scaleParas(paras: Para[], k: number): Para[] {
  if (k === 1) return paras
  return paras.map((p) => (p.spaceBefore ? { ...p, spaceBefore: p.spaceBefore * k } : p))
}
