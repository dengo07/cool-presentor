// Open-licensed (OFL) fonts. They are bundled with the app for the preview and
// embedded into exported .pptx files, so decks look identical everywhere.

export interface FontFamily {
  family: string
  pkg: string // @fontsource package name
  regular: number // weight used for normal text
  bold: number // weight used for bold text
}

export const FONTS: Record<string, FontFamily> = {
  Inter: { family: 'Inter', pkg: 'inter', regular: 400, bold: 700 },
  'Space Grotesk': { family: 'Space Grotesk', pkg: 'space-grotesk', regular: 400, bold: 700 },
  Fraunces: { family: 'Fraunces', pkg: 'fraunces', regular: 400, bold: 700 },
  Sora: { family: 'Sora', pkg: 'sora', regular: 400, bold: 700 },
  'DM Serif Display': { family: 'DM Serif Display', pkg: 'dm-serif-display', regular: 400, bold: 400 },
  'DM Sans': { family: 'DM Sans', pkg: 'dm-sans', regular: 400, bold: 700 },
  Syne: { family: 'Syne', pkg: 'syne', regular: 400, bold: 800 },
  'JetBrains Mono': { family: 'JetBrains Mono', pkg: 'jetbrains-mono', regular: 400, bold: 700 },
  'Instrument Serif': { family: 'Instrument Serif', pkg: 'instrument-serif', regular: 400, bold: 400 },
  'Bricolage Grotesque': { family: 'Bricolage Grotesque', pkg: 'bricolage-grotesque', regular: 400, bold: 700 },
  Manrope: { family: 'Manrope', pkg: 'manrope', regular: 400, bold: 700 },
  Unbounded: { family: 'Unbounded', pkg: 'unbounded', regular: 400, bold: 700 }
}

/** Path of a font file relative to node_modules. */
export function fontFilePath(family: string, bold: boolean): string {
  const f = FONTS[family]
  if (!f) throw new Error(`Unknown font ${family}`)
  const w = bold ? f.bold : f.regular
  return `@fontsource/${f.pkg}/files/${f.pkg}-latin-${w}-normal.woff`
}

export function hasBoldFace(family: string): boolean {
  const f = FONTS[family]
  return !!f && f.bold !== f.regular
}

/** Loads raw font bytes – implemented differently in browser and Node. */
export type FontLoader = (family: string, bold: boolean) => Promise<ArrayBuffer>
