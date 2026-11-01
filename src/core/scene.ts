// ---------------------------------------------------------------------------
// Scene: the single source of truth for both the live preview and the .pptx.
// All geometry is in inches on a 13.333 x 7.5 (16:9) canvas. Font sizes in pt.
// Colors are 6-digit hex without '#'.
// ---------------------------------------------------------------------------

import type { ChartKind } from './model'

export const SLIDE_W = 13.333
export const SLIDE_H = 7.5

export type Color = string

export interface GradientStop {
  pos: number // 0..100
  color: Color
  alpha?: number // 0..1 (default 1)
}

export type Fill =
  | { kind: 'solid'; color: Color; alpha?: number }
  | { kind: 'linear'; angle: number; stops: GradientStop[] } // angle: 0 = left→right, 90 = top→bottom
  | { kind: 'radial'; stops: GradientStop[] }

export interface Run {
  text: string
  bold?: boolean
  italic?: boolean
  color?: Color
  fill?: Fill // gradient text
}

export interface Para {
  runs: Run[]
  bullet?: { char: string; color: Color; indent: number } // indent in inches
  spaceBefore?: number // pt
}

interface ElBase {
  id: string // stable morph id – identical ids across slides animate with Morph
  x: number
  y: number
  w: number
  h: number
  rotate?: number
}

export interface TextEl extends ElBase {
  kind: 'text'
  paras: Para[]
  font: string
  size: number // pt
  bold: boolean
  italic?: boolean
  color: Color
  align: 'left' | 'center' | 'right'
  valign: 'top' | 'middle' | 'bottom'
  lineHeight: number // multiple
  tracking?: number // pt letter spacing
  upper?: boolean
}

export interface ShapeEl extends ElBase {
  kind: 'shape'
  shape: 'rect' | 'roundRect' | 'ellipse' | 'line'
  fill?: Fill
  line?: { color: Color; width: number; alpha?: number; dash?: boolean } // width in pt
  radius?: number // inches (roundRect)
  shadow?: { color: Color; alpha: number; blur: number; offset: number; angle: number } // blur/offset in pt
}

export interface ImageEl extends ElBase {
  kind: 'image'
  src: string
  srcW: number
  srcH: number
  focusX: number
  focusY: number
  radius?: number // inches; huge = pill
  circle?: boolean
}

export interface IconEl extends ElBase {
  kind: 'icon'
  icon: string
  color: Color
  stroke: number
}

export interface ChartEl extends ElBase {
  kind: 'chart'
  chartKind: ChartKind
  categories: string[]
  series: { name: string; values: number[] }[]
  unit?: string
  colors: Color[]
  font: string
  textColor: Color
  gridColor: Color
  fontSize: number
}

export type El = TextEl | ShapeEl | ImageEl | IconEl | ChartEl

export interface Scene {
  bg: Color
  elements: El[]
  notes: string
  transition: 'morph' | 'fade' | 'none'
  layoutId: string
}

/** CSS representation of a fill (used by preview). */
export function fillToCss(f: Fill): string {
  if (f.kind === 'solid') return rgba(f.color, f.alpha ?? 1)
  const stops = f.stops.map((s) => `${rgba(s.color, s.alpha ?? 1)} ${s.pos}%`).join(', ')
  if (f.kind === 'linear') return `linear-gradient(${f.angle + 90}deg, ${stops})`
  return `radial-gradient(circle farthest-corner at 50% 50%, ${stops})`
}

export function rgba(c: Color, a = 1): string {
  const n = parseInt(c, 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}
