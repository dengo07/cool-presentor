import type { Color } from './scene'

// Small colour toolkit (hex strings without '#').

export function toRgb(c: Color): [number, number, number] {
  const n = parseInt(c, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

export function toHex([r, g, b]: [number, number, number]): Color {
  return [r, g, b]
    .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

/** Linear blend: t = 0 → a, t = 1 → b. */
export function mix(a: Color, b: Color, t: number): Color {
  const x = toRgb(a)
  const y = toRgb(b)
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t])
}

/** WCAG relative luminance (0..1). */
export function luminance(c: Color): number {
  const [r, g, b] = toRgb(c).map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** WCAG contrast ratio (1..21). */
export function contrast(a: Color, b: Color): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

export function isDark(c: Color): boolean {
  return luminance(c) < 0.2
}

/** Best readable foreground for a background. */
export function readableOn(bg: Color, light = 'FFFFFF', dark = '141414'): Color {
  return contrast(bg, light) >= contrast(bg, dark) ? light : dark
}

export function isHex(s: string): boolean {
  return /^[0-9A-Fa-f]{6}$/.test(s)
}

/** Darkens / lightens `c` until it reaches `min` contrast against `bg`. */
export function ensureContrast(c: Color, bg: Color, min = 3): Color {
  const toward = isDark(bg) ? 'FFFFFF' : '000000'
  let out = c
  for (let t = 0.05; contrast(out, bg) < min && t <= 0.9; t += 0.05) out = mix(c, toward, t)
  return out
}
