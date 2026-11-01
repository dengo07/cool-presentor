import type { Color, Fill } from './scene'

export type DecoStyle = 'aurora' | 'orbs' | 'grid' | 'lines' | 'blocks'

export interface Theme {
  id: string
  name: string
  tagline: string
  dark: boolean
  bg: Fill
  bgColor: Color // solid fallback / average
  text: Color
  muted: Color
  accents: [Color, Color, Color]
  onAccent: Color
  highlight: Fill // used for *highlighted* words
  card: { fill: Fill; line?: { color: Color; alpha: number; width: number }; shadow?: boolean }
  heading: { font: string; bold: boolean; tracking: number; lineHeight: number; upper?: boolean }
  body: { font: string }
  label: { font: string; upper: boolean; tracking: number }
  deco: DecoStyle
  radius: number
  chartColors: Color[]
}

const solid = (color: Color, alpha?: number): Fill => ({ kind: 'solid', color, alpha })
const lin = (angle: number, ...colors: Color[]): Fill => ({
  kind: 'linear',
  angle,
  stops: colors.map((color, i) => ({ pos: Math.round((i / Math.max(1, colors.length - 1)) * 100), color }))
})

export const THEMES: Theme[] = [
  {
    id: 'aurora',
    name: 'Midnight Aurora',
    tagline: 'Glowing gradients on deep navy',
    dark: true,
    bg: lin(120, '0B1020', '120E2A'),
    bgColor: '0B1020',
    text: 'F5F7FF',
    muted: '9AA3C7',
    accents: ['8B5CF6', '22D3EE', 'F472B6'],
    onAccent: 'FFFFFF',
    highlight: lin(0, 'A78BFA', '22D3EE'),
    card: { fill: solid('FFFFFF', 0.06), line: { color: 'FFFFFF', alpha: 0.12, width: 0.75 } },
    heading: { font: 'Space Grotesk', bold: true, tracking: -1, lineHeight: 0.98 },
    body: { font: 'Inter' },
    label: { font: 'JetBrains Mono', upper: true, tracking: 2 },
    deco: 'aurora',
    radius: 0.22,
    chartColors: ['8B5CF6', '22D3EE', 'F472B6', 'FBBF24', '34D399']
  },
  {
    id: 'paper',
    name: 'Paper & Ink',
    tagline: 'Editorial serif on warm paper',
    dark: false,
    bg: solid('F5F0E6'),
    bgColor: 'F5F0E6',
    text: '1C1917',
    muted: '6B635A',
    accents: ['C2410C', '1E3A8A', '3F6212'],
    onAccent: 'FFFFFF',
    highlight: solid('C2410C'),
    card: { fill: solid('FFFDF8'), line: { color: '1C1917', alpha: 0.18, width: 0.75 } },
    heading: { font: 'Fraunces', bold: false, tracking: -0.5, lineHeight: 1.0 },
    body: { font: 'Inter' },
    label: { font: 'Inter', upper: true, tracking: 2.5 },
    deco: 'lines',
    radius: 0.06,
    chartColors: ['C2410C', '1E3A8A', '3F6212', 'B45309', '6B635A']
  },
  {
    id: 'neon',
    name: 'Neon Grid',
    tagline: 'Electric lime on pitch black',
    dark: true,
    bg: solid('060608'),
    bgColor: '060608',
    text: 'FFFFFF',
    muted: '8A8A99',
    accents: ['B6FF3B', 'FF2E88', '00E5FF'],
    onAccent: '060608',
    highlight: solid('B6FF3B'),
    card: { fill: solid('FFFFFF', 0.04), line: { color: 'B6FF3B', alpha: 0.35, width: 0.75 } },
    heading: { font: 'Unbounded', bold: true, tracking: -1, lineHeight: 1.02 },
    body: { font: 'Manrope' },
    label: { font: 'JetBrains Mono', upper: true, tracking: 2 },
    deco: 'grid',
    radius: 0.12,
    chartColors: ['B6FF3B', 'FF2E88', '00E5FF', 'FFFFFF', '8A8A99']
  },
  {
    id: 'swiss',
    name: 'Swiss Minimal',
    tagline: 'Bold grotesk, red accents, pure grid',
    dark: false,
    bg: solid('FFFFFF'),
    bgColor: 'FFFFFF',
    text: '111111',
    muted: '6E6E6E',
    accents: ['E10600', '111111', '0047FF'],
    onAccent: 'FFFFFF',
    highlight: solid('E10600'),
    card: { fill: solid('F3F3F3') },
    heading: { font: 'Inter', bold: true, tracking: -1.5, lineHeight: 0.98 },
    body: { font: 'Inter' },
    label: { font: 'Inter', upper: true, tracking: 1.5 },
    deco: 'blocks',
    radius: 0,
    chartColors: ['E10600', '111111', '9E9E9E', '0047FF', 'FF8A80']
  },
  {
    id: 'sunset',
    name: 'Sunset Boulevard',
    tagline: 'Warm coral and gold over plum',
    dark: true,
    bg: lin(135, '1E0B2E', '3A0F3F'),
    bgColor: '2A0D36',
    text: 'FFF4EC',
    muted: 'D2B3C4',
    accents: ['FF7A59', 'FFC857', 'FF3D7F'],
    onAccent: '1E0B2E',
    highlight: lin(0, 'FFC857', 'FF7A59', 'FF3D7F'),
    card: { fill: solid('FFFFFF', 0.07), line: { color: 'FFFFFF', alpha: 0.14, width: 0.75 } },
    heading: { font: 'Sora', bold: true, tracking: -1, lineHeight: 1.0 },
    body: { font: 'DM Sans' },
    label: { font: 'DM Sans', upper: true, tracking: 2.5 },
    deco: 'orbs',
    radius: 0.28,
    chartColors: ['FF7A59', 'FFC857', 'FF3D7F', 'C084FC', 'FFF4EC']
  },
  {
    id: 'evergreen',
    name: 'Evergreen',
    tagline: 'Calm serif on deep forest green',
    dark: true,
    bg: lin(160, '0C1D15', '12291E'),
    bgColor: '0F2219',
    text: 'EEF5EF',
    muted: '9DB5A5',
    accents: ['C6F35E', '6EE7B7', 'F5D06F'],
    onAccent: '0C1D15',
    highlight: solid('C6F35E'),
    card: { fill: solid('FFFFFF', 0.06), line: { color: 'C6F35E', alpha: 0.18, width: 0.75 } },
    heading: { font: 'DM Serif Display', bold: false, tracking: -0.5, lineHeight: 1.02 },
    body: { font: 'DM Sans' },
    label: { font: 'DM Sans', upper: true, tracking: 2.5 },
    deco: 'aurora',
    radius: 0.2,
    chartColors: ['C6F35E', '6EE7B7', 'F5D06F', '93C5FD', 'EEF5EF']
  },
  {
    id: 'mono',
    name: 'Mono Bold',
    tagline: 'Loud display type, safety orange',
    dark: false,
    bg: solid('EFEDE8'),
    bgColor: 'EFEDE8',
    text: '0A0A0A',
    muted: '5E5E5E',
    accents: ['FF4F00', '0A0A0A', '2B59FF'],
    onAccent: 'FFFFFF',
    highlight: solid('FF4F00'),
    card: { fill: solid('0A0A0A', 0.05), line: { color: '0A0A0A', alpha: 1, width: 1.5 } },
    heading: { font: 'Syne', bold: true, tracking: -1.5, lineHeight: 0.95 },
    body: { font: 'Manrope' },
    label: { font: 'JetBrains Mono', upper: true, tracking: 1 },
    deco: 'blocks',
    radius: 0,
    chartColors: ['FF4F00', '0A0A0A', '2B59FF', '9A9A9A', 'FFB38A']
  },
  {
    id: 'frost',
    name: 'Frosted Glass',
    tagline: 'Pastel light with glassy cards',
    dark: false,
    bg: lin(135, 'EEF0FF', 'FDF2F8'),
    bgColor: 'F5F1FB',
    text: '1E1B4B',
    muted: '5B5880',
    accents: ['6366F1', 'EC4899', '06B6D4'],
    onAccent: 'FFFFFF',
    highlight: lin(0, '6366F1', 'EC4899'),
    card: {
      fill: solid('FFFFFF', 0.6),
      line: { color: 'FFFFFF', alpha: 0.9, width: 1 },
      shadow: true
    },
    heading: { font: 'Bricolage Grotesque', bold: true, tracking: -1, lineHeight: 1.0 },
    body: { font: 'Inter' },
    label: { font: 'Inter', upper: true, tracking: 2 },
    deco: 'orbs',
    radius: 0.3,
    chartColors: ['6366F1', 'EC4899', '06B6D4', 'F59E0B', 'A5B4FC']
  },
  {
    id: 'noir',
    name: 'Noir Editorial',
    tagline: 'Elegant serif, gold on charcoal',
    dark: true,
    bg: solid('121212'),
    bgColor: '121212',
    text: 'F3EDE3',
    muted: 'A39E95',
    accents: ['E8C07D', 'F3EDE3', 'B5838D'],
    onAccent: '121212',
    highlight: solid('E8C07D'),
    card: { fill: solid('FFFFFF', 0.04), line: { color: 'E8C07D', alpha: 0.3, width: 0.75 } },
    heading: { font: 'Instrument Serif', bold: false, tracking: -0.5, lineHeight: 1.0 },
    body: { font: 'Inter' },
    label: { font: 'Inter', upper: true, tracking: 3 },
    deco: 'lines',
    radius: 0.04,
    chartColors: ['E8C07D', 'F3EDE3', 'B5838D', '7D8C93', 'A39E95']
  }
]

export function getTheme(id: string): Theme {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

/** All font families a theme needs (for loading / embedding). */
export function themeFonts(t: Theme): string[] {
  return [...new Set([t.heading.font, t.body.font, t.label.font])]
}
