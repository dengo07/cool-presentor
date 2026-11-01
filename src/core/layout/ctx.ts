import type { Block, BlockOf, BlockType, Slide } from '../model'
import type { Measurer, TextStyle } from '../measure'
import { fitSize } from '../measure'
import type { Color, El, Fill, Para, Run, ShapeEl, TextEl } from '../scene'
import type { Theme } from '../themes'

// ---------------------------------------------------------------------------
// Layout context + reusable building blocks shared by all layouts.
// ---------------------------------------------------------------------------

export const MX = 0.85 // horizontal page margin (in)
export const MY = 0.7 // vertical page margin (in)

export interface Ctx {
  theme: Theme
  slide: Slide
  index: number
  total: number
  m: Measurer
  els: El[]
}

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export function all<T extends BlockType>(ctx: Ctx, type: T): BlockOf<T>[] {
  return ctx.slide.blocks.filter((b): b is BlockOf<T> => b.type === type)
}
export function one<T extends BlockType>(ctx: Ctx, type: T): BlockOf<T> | undefined {
  return all(ctx, type)[0]
}
export function add(ctx: Ctx, ...els: El[]): void {
  ctx.els.push(...els)
}

// ---------------------------------------------------------------------------
// Inline formatting: **bold**, *highlight* (accent colour / gradient text)
// ---------------------------------------------------------------------------

export function parseInline(text: string, theme: Theme, base?: Partial<Run>): Run[] {
  const runs: Run[] = []
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) runs.push({ ...base, text: text.slice(last, m.index) })
    const tok = m[0]
    if (tok.startsWith('**')) runs.push({ ...base, text: tok.slice(2, -2), bold: true })
    else {
      const hl = theme.highlight
      if (hl.kind === 'solid') runs.push({ ...base, text: tok.slice(1, -1), color: hl.color })
      else runs.push({ ...base, text: tok.slice(1, -1), fill: hl, color: hl.stops[0].color })
    }
    last = m.index + tok.length
  }
  if (last < text.length) runs.push({ ...base, text: text.slice(last) })
  return runs.length ? runs : [{ ...base, text: '' }]
}

export function stripInline(text: string): string {
  return text.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')
}

// ---------------------------------------------------------------------------
// Text roles
// ---------------------------------------------------------------------------

export type Role = 'hero' | 'title' | 'subtitle' | 'body' | 'label' | 'stat' | 'quote' | 'small' | 'cardTitle'

interface RoleSpec extends TextStyle {
  color: Color
  max: number
  min: number
}

export function roleSpec(theme: Theme, role: Role): RoleSpec {
  const h = theme.heading
  switch (role) {
    case 'hero':
      return { font: h.font, bold: h.bold, lineHeight: h.lineHeight, tracking: h.tracking, color: theme.text, max: 84, min: 36 }
    case 'title':
      return { font: h.font, bold: h.bold, lineHeight: h.lineHeight + 0.04, tracking: h.tracking * 0.6, color: theme.text, max: 44, min: 24 }
    case 'stat':
      return { font: h.font, bold: h.bold, lineHeight: 0.95, tracking: h.tracking, color: theme.text, max: 96, min: 28 }
    case 'quote':
      return { font: h.font, bold: false, lineHeight: 1.12, tracking: h.tracking * 0.5, color: theme.text, max: 40, min: 20 }
    case 'cardTitle':
      return { font: h.font, bold: h.bold, lineHeight: 1.08, tracking: h.tracking * 0.3, color: theme.text, max: 22, min: 14 }
    case 'subtitle':
      return { font: theme.body.font, bold: false, lineHeight: 1.3, color: theme.muted, max: 22, min: 14 }
    case 'body':
      return { font: theme.body.font, bold: false, lineHeight: 1.35, color: theme.text, max: 22, min: 12 }
    case 'small':
      return { font: theme.body.font, bold: false, lineHeight: 1.35, color: theme.muted, max: 15, min: 10 }
    case 'label':
      return {
        font: theme.label.font,
        bold: false,
        lineHeight: 1.2,
        tracking: theme.label.tracking,
        upper: theme.label.upper,
        color: theme.accents[0],
        max: 13,
        min: 9
      }
  }
}

export interface TextOpts extends Box {
  id: string
  role: Role
  text?: string
  paras?: Para[]
  align?: TextEl['align']
  valign?: TextEl['valign']
  color?: Color
  max?: number
  min?: number
  maxLines?: number
  /** 'content' shrinks the element height to the measured text height. */
  fit?: 'box' | 'content'
  bold?: boolean
}

/** Creates a fitted text element and pushes it. Returns element + content height. */
export function text(ctx: Ctx, o: TextOpts): { el: TextEl; height: number; size: number } {
  const spec = roleSpec(ctx.theme, o.role)
  const color = o.color ?? spec.color
  const paras: Para[] = o.paras ?? [{ runs: parseInline(o.text ?? '', ctx.theme) }]
  const style: TextStyle = { ...spec, bold: o.bold ?? spec.bold }
  const r = fitSize(ctx.m, paras, style, o.max ?? spec.max, o.min ?? spec.min, o.w, o.h, o.maxLines)
  const el: TextEl = {
    kind: 'text',
    id: o.id,
    x: o.x,
    y: o.y,
    w: o.w,
    h: o.fit === 'content' ? Math.min(o.h, r.height + 0.02) : o.h,
    paras,
    font: spec.font,
    size: r.size,
    bold: style.bold,
    color,
    align: o.align ?? 'left',
    valign: o.valign ?? 'top',
    lineHeight: spec.lineHeight,
    tracking: spec.tracking,
    upper: spec.upper
  }
  add(ctx, el)
  return { el, height: Math.min(o.h, r.height), size: r.size }
}

// ---------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------

export function card(ctx: Ctx, id: string, b: Box, opts: { accent?: boolean; radius?: number } = {}): ShapeEl {
  const t = ctx.theme
  const el: ShapeEl = {
    kind: 'shape',
    id,
    ...b,
    shape: (opts.radius ?? t.radius) > 0 ? 'roundRect' : 'rect',
    radius: opts.radius ?? t.radius,
    fill: opts.accent ? { kind: 'solid', color: t.accents[0] } : t.card.fill,
    line: opts.accent ? undefined : t.card.line,
    shadow: t.card.shadow ? { color: '1E1B4B', alpha: 0.12, blur: 24, offset: 6, angle: 90 } : undefined
  }
  add(ctx, el)
  return el
}

export function rect(ctx: Ctx, id: string, b: Box, fill: Fill, radius = 0): ShapeEl {
  const el: ShapeEl = { kind: 'shape', id, ...b, shape: radius ? 'roundRect' : 'rect', radius, fill }
  add(ctx, el)
  return el
}

export function hline(ctx: Ctx, id: string, x: number, y: number, w: number, color: Color, width = 1, alpha = 1): void {
  add(ctx, { kind: 'shape', id, x, y, w, h: 0, shape: 'line', line: { color, width, alpha } })
}

export function vline(ctx: Ctx, id: string, x: number, y: number, h: number, color: Color, width = 1, alpha = 1): void {
  add(ctx, { kind: 'shape', id, x, y, w: 0, h, shape: 'line', line: { color, width, alpha } })
}

// ---------------------------------------------------------------------------
// Header (eyebrow + title + subtitle) – used by most layouts.
// Ids are semantic ('eyebrow', 'title', 'subtitle') so they morph across slides.
// ---------------------------------------------------------------------------

export interface HeaderOpts extends Box {
  role?: 'hero' | 'title'
  align?: TextEl['align']
  max?: number
  subMax?: number
  gap?: number
  /** vertical anchoring of the whole group inside the box */
  anchor?: 'top' | 'middle' | 'bottom'
  titleColor?: Color
  subColor?: Color
}

/** Places eyebrow/title/subtitle stacked; returns bottom y of the group. */
export function header(ctx: Ctx, o: HeaderOpts): number {
  const eyebrow = one(ctx, 'eyebrow')
  const title = one(ctx, 'title')
  const subtitle = one(ctx, 'subtitle')
  const role = o.role ?? 'title'
  const gap = o.gap ?? 0.22

  // Measure first, then place (so we can anchor the group).
  const parts: { kind: 'eyebrow' | 'title' | 'subtitle'; h: number; run: (y: number) => number }[] = []
  if (eyebrow) {
    const h = 0.32
    parts.push({
      kind: 'eyebrow',
      h,
      run: (y) => {
        text(ctx, { id: 'eyebrow', role: 'label', text: eyebrow.text, x: o.x, y, w: o.w, h, align: o.align, maxLines: 1 })
        return h
      }
    })
  }
  const subH = subtitle ? Math.min(1.4, o.h * 0.3) : 0
  if (title) {
    const titleBoxH = Math.max(0.6, o.h - (eyebrow ? 0.32 + gap : 0) - (subtitle ? subH + gap : 0))
    const spec = roleSpec(ctx.theme, role)
    const paras = [{ runs: parseInline(title.text, ctx.theme) }]
    const fit = fitSize(ctx.m, paras, spec, o.max ?? spec.max, spec.min, o.w, titleBoxH)
    const th = Math.min(titleBoxH, fit.height)
    parts.push({
      kind: 'title',
      h: th,
      run: (y) => {
        text(ctx, {
          id: 'title',
          role,
          paras,
          x: o.x,
          y,
          w: o.w,
          h: th + 0.05,
          align: o.align,
          max: fit.size,
          color: o.titleColor
        })
        return th
      }
    })
  }
  if (subtitle) {
    const spec = roleSpec(ctx.theme, 'subtitle')
    const paras = [{ runs: parseInline(subtitle.text, ctx.theme) }]
    const fit = fitSize(ctx.m, paras, spec, o.subMax ?? spec.max, spec.min, o.w, subH)
    const sh = Math.min(subH, fit.height)
    parts.push({
      kind: 'subtitle',
      h: sh,
      run: (y) => {
        text(ctx, {
          id: 'subtitle',
          role: 'subtitle',
          paras,
          x: o.x,
          y,
          w: o.w,
          h: sh + 0.05,
          align: o.align,
          max: fit.size,
          color: o.subColor
        })
        return sh
      }
    })
  }
  const total = parts.reduce((s, p) => s + p.h, 0) + gap * Math.max(0, parts.length - 1)
  let y = o.anchor === 'middle' ? o.y + (o.h - total) / 2 : o.anchor === 'bottom' ? o.y + o.h - total : o.y
  parts.forEach((p, i) => {
    y += p.run(y)
    if (i < parts.length - 1) y += p.kind === 'eyebrow' ? gap * 0.7 : gap
  })
  return y
}

export function hasHeader(ctx: Ctx): boolean {
  return ctx.slide.blocks.some((b) => b.type === 'title' || b.type === 'eyebrow' || b.type === 'subtitle')
}

export function contentBlocks(slide: Slide): Block[] {
  return slide.blocks.filter((b) => b.type !== 'title' && b.type !== 'subtitle' && b.type !== 'eyebrow')
}

export function pad2(n: number): string {
  return String(n).padStart(2, '0')
}
