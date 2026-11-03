import type { BlockOf } from '../model'
import type { Para } from '../scene'
import { fitSize } from '../measure'
import { contrast, ensureContrast, extendPalette, mix, readableOn, separateColors } from '../color'
import { add, card, type Box, type Ctx, hline, pad2, parseInline, rect, roleSpec, text, vline } from './ctx'

// ---------------------------------------------------------------------------
// Block renderers: draw one content block into a box. Layouts arrange boxes.
// Element ids derive from block ids so "shuffle layout" and duplicated slides
// animate smoothly (Morph).
// ---------------------------------------------------------------------------

export function bulletParas(ctx: Ctx, items: string[], gapPt = 10): Para[] {
  return items.map((it, i) => ({
    runs: parseInline(it, ctx.theme),
    bullet: { char: '•', color: ctx.theme.accents[0], indent: 0.34 },
    spaceBefore: i === 0 ? 0 : gapPt
  }))
}

export function renderText(ctx: Ctx, b: BlockOf<'text'>, box: Box, o: { max?: number; align?: 'left' | 'center' } = {}): number {
  const paras: Para[] = b.text
    .split(/\n+/)
    .filter(Boolean)
    .map((p, i) => ({ runs: parseInline(p, ctx.theme), spaceBefore: i ? 10 : 0 }))
  return text(ctx, { id: b.id, role: 'body', paras, ...box, max: o.max, align: o.align, fit: 'content' }).height
}

export function renderBullets(ctx: Ctx, b: BlockOf<'bullets'>, box: Box, o: { max?: number } = {}): number {
  return text(ctx, { id: b.id, role: 'body', paras: bulletParas(ctx, b.items), ...box, max: o.max, fit: 'content' }).height
}

/** Big number in a card. Number uses the theme highlight (gradient text on some themes). */
export function renderStat(ctx: Ctx, b: BlockOf<'stat'>, box: Box, o: { card?: boolean; align?: 'left' | 'center'; max?: number } = {}): void {
  const t = ctx.theme
  const pad = o.card === false ? 0 : 0.35
  if (o.card !== false) card(ctx, `${b.id}-card`, box)
  const inner = { x: box.x + pad, y: box.y + pad, w: box.w - pad * 2, h: box.h - pad * 2 }
  const valueH = inner.h * 0.55
  const hl = t.highlight
  const run = hl.kind === 'solid' ? { text: b.value, color: hl.color } : { text: b.value, fill: hl, color: hl.stops[0].color }
  text(ctx, {
    id: `${b.id}-value`,
    role: 'stat',
    paras: [{ runs: [run] }],
    x: inner.x,
    y: inner.y,
    w: inner.w,
    h: valueH,
    max: o.max,
    align: o.align,
    valign: 'bottom',
    maxLines: 1
  })
  const lab = text(ctx, {
    id: `${b.id}-label`,
    role: 'cardTitle',
    text: b.label,
    x: inner.x,
    y: inner.y + valueH + 0.12,
    w: inner.w,
    h: Math.max(0.4, inner.h - valueH - 0.12),
    align: o.align,
    max: 20,
    fit: 'content'
  })
  if (b.caption) {
    const y = inner.y + valueH + 0.12 + lab.height + 0.08
    text(ctx, {
      id: `${b.id}-caption`,
      role: 'small',
      text: b.caption,
      x: inner.x,
      y,
      w: inner.w,
      h: Math.max(0.3, inner.y + inner.h - y),
      align: o.align
    })
  }
}

export function renderImage(ctx: Ctx, b: BlockOf<'image'>, box: Box, o: { radius?: number; circle?: boolean } = {}): void {
  if (!b.src) {
    // Placeholder that still looks designed.
    const t = ctx.theme
    rect(
      ctx,
      b.id,
      box,
      { kind: 'linear', angle: 45, stops: [{ pos: 0, color: t.accents[0], alpha: 0.35 }, { pos: 100, color: t.accents[1], alpha: 0.35 }] },
      o.radius ?? 0
    )
    const s = Math.min(box.w, box.h) * 0.18
    // full-bleed boxes carry text in their lower half – keep the icon in the upper part
    const cy = box.w > 9 ? box.y + box.h * 0.26 : box.y + box.h / 2
    add(ctx, { kind: 'icon', id: `${b.id}-ph`, icon: 'ImagePlus', color: t.text, stroke: 1.5, x: box.x + box.w / 2 - s / 2, y: cy - s / 2, w: s, h: s })
    return
  }
  add(ctx, {
    kind: 'image',
    id: b.id,
    ...box,
    src: b.src,
    srcW: b.width,
    srcH: b.height,
    focusX: b.focusX ?? 0.5,
    focusY: b.focusY ?? 0.5,
    radius: o.radius,
    circle: o.circle
  })
}

export function renderChart(ctx: Ctx, b: BlockOf<'chart'>, box: Box): void {
  const t = ctx.theme
  // one colour per slice (pie/donut) or per series – never repeat
  const perPoint = b.kind === 'pie' || b.kind === 'donut'
  const needed = perPoint ? b.categories.length : b.series.length
  let colors = extendPalette(t.chartColors, Math.max(1, needed), t.bgColor)
  let labelColor: string | undefined
  if (perPoint) {
    // One label colour for all slices (PowerPoint limitation): pick the one that
    // reads on most slices, then adjust the few slices where it doesn't.
    const white = colors.filter((c) => contrast(c, 'FFFFFF') >= 3).length
    const dark = colors.filter((c) => contrast(c, '1A1A1A') >= 3).length
    labelColor = white >= dark ? 'FFFFFF' : '1A1A1A'
    colors = separateColors(colors.map((c) => ensureContrast(c, labelColor!, 3)), labelColor)
  }
  add(ctx, {
    kind: 'chart',
    id: b.id,
    ...box,
    chartKind: b.kind,
    categories: b.categories,
    series: b.series,
    unit: b.unit,
    colors,
    labelColor,
    font: t.body.font,
    textColor: t.muted,
    gridColor: t.dark ? '3A3F55' : 'DDDDDD',
    fontSize: 12
  })
}

export function renderQuote(ctx: Ctx, b: BlockOf<'quote'>, box: Box, o: { align?: 'left' | 'center' } = {}): void {
  const t = ctx.theme
  // The glyph sits in the top of its line box, so the box can overlap the text below.
  const markH = Math.min(1.3, box.h * 0.26)
  text(ctx, {
    id: `${b.id}-mark`,
    role: 'hero',
    text: '“',
    color: t.accents[0],
    x: o.align === 'center' ? box.x + box.w / 2 - 1 : box.x - 0.08,
    y: box.y - 0.35,
    w: 2,
    h: 2.4,
    max: 150,
    min: 150,
    align: o.align
  })
  const authorH = b.author ? 0.45 : 0
  const q = text(ctx, {
    id: `${b.id}-text`,
    role: 'quote',
    text: b.text,
    x: box.x,
    y: box.y + markH * 0.7,
    w: box.w,
    h: box.h - markH * 0.7 - authorH - 0.2,
    align: o.align,
    fit: 'content'
  })
  if (b.author) {
    const y = box.y + markH * 0.7 + q.height + 0.3
    if (o.align !== 'center') hline(ctx, `${b.id}-rule`, box.x, y + 0.16, 0.4, t.accents[0], 1.5)
    text(ctx, {
      id: `${b.id}-author`,
      role: 'label',
      text: b.author,
      x: o.align === 'center' ? box.x : box.x + 0.55,
      y,
      w: box.w,
      h: 0.35,
      color: t.muted,
      align: o.align,
      maxLines: 1
    })
  }
}

export function renderTimeline(ctx: Ctx, b: BlockOf<'timeline'>, box: Box): void {
  const t = ctx.theme
  const n = Math.max(1, b.items.length)
  const colW = box.w / n
  const lineY = box.y + 0.75
  hline(ctx, `${b.id}-axis`, box.x, lineY, box.w, t.muted, 1, 0.5)
  // progress overlay in accent – looks like a "you are here" bar
  hline(ctx, `${b.id}-progress`, box.x, lineY, colW * (n - 0.5), t.accents[0], 2.5)
  b.items.forEach((it, i) => {
    const x = box.x + colW * i
    const dot = 0.22
    add(ctx, {
      kind: 'shape',
      id: `${b.id}-dot${i}`,
      shape: 'ellipse',
      x: x + 0.02,
      y: lineY - dot / 2,
      w: dot,
      h: dot,
      fill: { kind: 'solid', color: i === n - 1 ? t.accents[1] : t.accents[0] },
      line: { color: t.bgColor, width: 3 }
    })
    text(ctx, { id: `${b.id}-date${i}`, role: 'label', text: it.date, x, y: box.y, w: colW - 0.3, h: 0.4, maxLines: 1 })
    const ty = lineY + 0.35
    const tt = text(ctx, { id: `${b.id}-title${i}`, role: 'cardTitle', text: it.title, x, y: ty, w: colW - 0.35, h: 0.9, max: 22, fit: 'content' })
    if (it.text) {
      text(ctx, {
        id: `${b.id}-text${i}`,
        role: 'small',
        text: it.text,
        x,
        y: ty + tt.height + 0.12,
        w: colW - 0.35,
        h: Math.max(0.3, box.y + box.h - (ty + tt.height + 0.12))
      })
    }
  })
}

export function renderFeatures(ctx: Ctx, b: BlockOf<'features'>, box: Box, o: { cols?: number } = {}): void {
  const t = ctx.theme
  const n = Math.max(1, b.items.length)
  const cols = o.cols ?? (n <= 3 ? n : n === 4 ? 2 : 3)
  const rows = Math.ceil(n / cols)
  const gap = 0.3
  const cw = (box.w - gap * (cols - 1)) / cols
  const ch = (box.h - gap * (rows - 1)) / rows
  const short = ch < 2.45
  b.items.forEach((it, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    const x = box.x + c * (cw + gap)
    const y = box.y + r * (ch + gap)
    card(ctx, `${b.id}-card${i}`, { x, y, w: cw, h: ch })
    const pad = 0.32
    const ic = short ? 0.42 : 0.56
    // icon badge
    add(ctx, {
      kind: 'shape',
      id: `${b.id}-badge${i}`,
      shape: t.radius > 0 ? 'roundRect' : 'rect',
      radius: Math.min(0.16, t.radius),
      x: x + pad,
      y: y + pad,
      w: ic + 0.2,
      h: ic + 0.2,
      fill: { kind: 'solid', color: t.accents[i % 3], alpha: t.dark ? 0.18 : 0.12 }
    })
    add(ctx, { kind: 'icon', id: `${b.id}-icon${i}`, icon: it.icon, color: t.accents[i % 3], stroke: 2, x: x + pad + 0.1, y: y + pad + 0.1, w: ic, h: ic })
    if (short) {
      const tx = x + pad + ic + 0.45
      const tt = text(ctx, { id: `${b.id}-t${i}`, role: 'cardTitle', text: it.title, x: tx, y: y + pad - 0.02, w: x + cw - pad - tx, h: 0.5, max: 19, maxLines: 1, fit: 'content' })
      if (it.text)
        text(ctx, { id: `${b.id}-d${i}`, role: 'small', text: it.text, x: tx, y: y + pad + tt.height + 0.06, w: x + cw - pad - tx, h: ch - pad * 2 - tt.height })
    } else {
      const ty = y + pad + ic + 0.45
      const tt = text(ctx, { id: `${b.id}-t${i}`, role: 'cardTitle', text: it.title, x: x + pad, y: ty, w: cw - pad * 2, h: 0.75, fit: 'content' })
      if (it.text)
        text(ctx, {
          id: `${b.id}-d${i}`,
          role: 'small',
          text: it.text,
          x: x + pad,
          y: ty + tt.height + 0.1,
          w: cw - pad * 2,
          h: Math.max(0.3, y + ch - pad - (ty + tt.height + 0.1))
        })
    }
  })
}

export function renderComparison(ctx: Ctx, b: BlockOf<'comparison'>, box: Box): void {
  const t = ctx.theme
  const gap = 0.5
  const cw = (box.w - gap) / 2
  const sides = [b.left, b.right] as const
  sides.forEach((side, i) => {
    const x = box.x + i * (cw + gap)
    const accent = i === 1
    card(ctx, `${b.id}-card${i}`, { x, y: box.y, w: cw, h: box.h }, { accent })
    const pad = 0.45
    const fg = accent ? t.onAccent : t.text
    const tt = text(ctx, { id: `${b.id}-title${i}`, role: 'title', text: side.title, x: x + pad, y: box.y + pad, w: cw - pad * 2, h: 0.9, max: 32, color: fg, fit: 'content' })
    const ly = box.y + pad + tt.height + 0.3
    hline(ctx, `${b.id}-rule${i}`, x + pad, ly - 0.12, cw - pad * 2, fg, 0.75, 0.25)
    text(ctx, {
      id: `${b.id}-items${i}`,
      role: 'body',
      paras: side.items.map((it, j) => ({
        runs: parseInline(it, t),
        bullet: { char: i === 0 ? '–' : '✓', color: accent ? t.onAccent : t.accents[0], indent: 0.34 },
        spaceBefore: j ? 8 : 0
      })),
      x: x + pad,
      y: ly + 0.05,
      w: cw - pad * 2,
      h: box.y + box.h - pad - ly,
      color: fg,
      max: 20
    })
  })
  // "vs" badge
  const s = 0.62
  add(ctx, {
    kind: 'shape',
    id: `${b.id}-vs-bg`,
    shape: 'ellipse',
    x: box.x + cw + gap / 2 - s / 2,
    y: box.y + box.h / 2 - s / 2,
    w: s,
    h: s,
    fill: { kind: 'solid', color: t.bgColor },
    line: { color: t.accents[0], width: 1.5 }
  })
  text(ctx, {
    id: `${b.id}-vs`,
    role: 'label',
    text: 'vs',
    x: box.x + cw + gap / 2 - s / 2,
    y: box.y + box.h / 2 - s / 2,
    w: s,
    h: s,
    align: 'center',
    valign: 'middle',
    color: t.text,
    maxLines: 1
  })
}

/** Numbered cards for short bullet lists. */
export function renderBulletCards(ctx: Ctx, b: BlockOf<'bullets'>, box: Box): void {
  const t = ctx.theme
  const n = b.items.length
  const cols = n <= 3 ? n : n === 4 ? 2 : 3
  const rows = Math.ceil(n / cols)
  const gap = 0.3
  const cw = (box.w - gap * (cols - 1)) / cols
  const ch = (box.h - gap * (rows - 1)) / rows
  // Fit all card texts at one shared size so the grid looks consistent.
  const spec = roleSpec(t, 'cardTitle')
  const pad = 0.35
  let size = 24
  for (const it of b.items) {
    const f = fitSize(ctx.m, [{ runs: parseInline(it, t) }], spec, 26, 14, cw - pad * 2, ch - pad * 2 - 0.45)
    size = Math.min(size, f.size)
  }
  b.items.forEach((it, i) => {
    const c = i % cols
    const r = Math.floor(i / cols)
    const x = box.x + c * (cw + gap)
    const y = box.y + r * (ch + gap)
    card(ctx, `${b.id}-card${i}`, { x, y, w: cw, h: ch })
    text(ctx, { id: `${b.id}-n${i}`, role: 'label', text: pad2(i + 1), x: x + pad, y: y + pad, w: 1, h: 0.32, maxLines: 1 })
    vline(ctx, `${b.id}-tick${i}`, x, y + pad, 0.3, t.accents[i % 3], 3)
    text(ctx, { id: `${b.id}-t${i}`, role: 'cardTitle', text: it, x: x + pad, y: y + pad + 0.45, w: cw - pad * 2, h: ch - pad * 2 - 0.45, max: size, valign: 'bottom' })
  })
}

// ---------------------------------------------------------------------------
// Gantt chart – drawn with native shapes so it stays editable in PowerPoint.
// ---------------------------------------------------------------------------

const DAY = 86_400_000

/** Label colour for big/bold text on a coloured shape – white unless it really doesn't read. */
function labelOn(fill: string): string {
  return contrast(fill, 'FFFFFF') >= 3 ? 'FFFFFF' : '1A1A1A'
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function parseDay(s: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim())
  if (!m) return null
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3])
  return Number.isNaN(t) ? null : t
}

/** Axis ticks with a step chosen so there are at most ~12 labels. */
export function ganttTicks(min: number, max: number): { at: number; label: string }[] {
  const days = (max - min) / DAY
  const out: { at: number; label: string }[] = []
  const d0 = new Date(min)
  if (days <= 75) {
    // weekly (or daily for very short plans), starting on a Monday
    const step = days <= 14 ? 1 : days <= 28 ? 2 : 7
    let t = step === 7 ? min - ((d0.getUTCDay() + 6) % 7) * DAY : min
    for (; t <= max; t += step * DAY) {
      const at = Math.max(t, min)
      const d = new Date(at)
      out.push({ at, label: `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}` })
    }
    return out
  }
  const months = days / 30.4
  const step = months <= 12 ? 1 : months <= 24 ? 2 : months <= 36 ? 3 : months <= 72 ? 6 : 12
  const y = d0.getUTCFullYear()
  let m = Math.floor(d0.getUTCMonth() / step) * step
  for (;;) {
    const t = Date.UTC(y + Math.floor(m / 12), m % 12, 1)
    if (t > max) break
    // the first tick sits at the start of the axis, labelled with its month
    const d = new Date(t)
    const label = step >= 12 ? String(d.getUTCFullYear()) : d.getUTCMonth() === 0 || out.length === 0 ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : MONTHS[d.getUTCMonth()]
    out.push({ at: Math.max(t, min), label })
    m += step
  }
  return out
}

export function renderGantt(ctx: Ctx, b: BlockOf<'gantt'>, box: Box): void {
  const t = ctx.theme
  const tasks = b.tasks
    .map((k) => ({ ...k, s: parseDay(k.start), e: parseDay(k.end) }))
    .filter((k): k is typeof k & { s: number; e: number } => k.s !== null && k.e !== null)
    .map((k) => ({ ...k, e: Math.max(k.s, k.e) }))
  if (!tasks.length) {
    text(ctx, { id: `${b.id}-empty`, role: 'small', text: 'Add tasks with dates (YYYY-MM-DD) to draw the schedule.', ...box })
    return
  }
  const min = Math.min(...tasks.map((k) => k.s))
  const max = Math.max(...tasks.map((k) => k.e)) + DAY // end dates are inclusive
  const span = Math.max(DAY, max - min)

  const groups = [...new Set(tasks.map((k) => k.group).filter((g): g is string => !!g))]
  const colors = extendPalette(t.accents, Math.max(1, groups.length || 1), t.bgColor)
  const colorOf = (g?: string): string => colors[Math.max(0, groups.indexOf(g ?? ''))] ?? t.accents[0]

  const legendH = groups.length > 1 ? 0.45 : 0
  const headerH = 0.42
  const labelW = Math.min(3.1, box.w * 0.27)
  const x0 = box.x + labelW + 0.25
  const x1 = box.x + box.w
  const rowH = Math.min(0.62, (box.h - headerH - legendH) / tasks.length)
  const y0 = box.y + headerH
  const X = (ms: number): number => x0 + ((ms - min) / span) * (x1 - x0)
  const rowsBottom = y0 + rowH * tasks.length

  // zebra rows
  tasks.forEach((_, i) => {
    if (i % 2 === 0) rect(ctx, `${b.id}-row${i}`, { x: box.x, y: y0 + i * rowH, w: box.w, h: rowH }, { kind: 'solid', color: t.text, alpha: t.dark ? 0.05 : 0.035 })
  })
  // time axis
  const ticks = ganttTicks(min, max)
  ticks.forEach((tk, i) => {
    const x = X(tk.at)
    vline(ctx, `${b.id}-grid${i}`, x, y0 - 0.06, rowsBottom - y0 + 0.06, t.muted, 0.75, 0.35)
    const next = i < ticks.length - 1 ? X(ticks[i + 1].at) : x1
    if (next - x > 0.35) text(ctx, { id: `${b.id}-tick${i}`, role: 'label', text: tk.label, x: x + 0.06, y: box.y, w: next - x - 0.08, h: 0.3, color: t.muted, maxLines: 1, max: 11, min: 8 })
  })
  // tasks
  tasks.forEach((k, i) => {
    const cy = y0 + i * rowH + rowH / 2
    text(ctx, { id: `${b.id}-name${i}`, role: 'body', text: k.name, x: box.x + 0.12, y: y0 + i * rowH, w: labelW - 0.12, h: rowH, valign: 'middle', max: 15, min: 9, maxLines: 1 })
    const c = colorOf(k.group)
    if (k.s === k.e) {
      // milestone
      const d = Math.min(rowH * 0.55, 0.32)
      add(ctx, { kind: 'shape', id: `${b.id}-bar${i}`, shape: 'diamond', x: X(k.s + DAY / 2) - d / 2, y: cy - d / 2, w: d, h: d, fill: { kind: 'solid', color: c } })
      return
    }
    const bx = X(k.s)
    const bw = Math.max(0.08, X(k.e + DAY) - bx)
    const bh = rowH * 0.56
    const r = Math.min(bh / 2, 0.08)
    const p = k.progress
    if (p !== undefined && p < 100) {
      add(ctx, { kind: 'shape', id: `${b.id}-bar${i}`, shape: 'roundRect', radius: r, x: bx, y: cy - bh / 2, w: bw, h: bh, fill: { kind: 'solid', color: mix(c, t.bgColor, 0.62) } })
      if (p > 0)
        add(ctx, { kind: 'shape', id: `${b.id}-done${i}`, shape: 'roundRect', radius: r, x: bx, y: cy - bh / 2, w: Math.max(r * 2, (bw * p) / 100), h: bh, fill: { kind: 'solid', color: c } })
    } else {
      add(ctx, { kind: 'shape', id: `${b.id}-bar${i}`, shape: 'roundRect', radius: r, x: bx, y: cy - bh / 2, w: bw, h: bh, fill: { kind: 'solid', color: c } })
    }
    if (p !== undefined) {
      const label = p >= 100 ? '✓' : `${Math.round(p)}%`
      const inside = bw > 0.75
      const lx = inside ? bx + 0.08 : bx + bw + 0.06
      if (inside || x1 - lx > 0.45)
        text(ctx, {
          id: `${b.id}-pct${i}`,
          role: 'small',
          text: label,
          x: lx,
          y: cy - bh / 2,
          w: inside ? bw - 0.12 : 0.6,
          h: bh,
          valign: 'middle',
          color: inside ? (p >= 100 ? labelOn(c) : readableOn(mix(c, t.bgColor, 0.62))) : t.muted,
          max: 11,
          min: 8,
          maxLines: 1
        })
    }
  })
  // legend for colour-coded workstreams
  if (groups.length > 1) {
    let lx = x0
    groups.forEach((g, i) => {
      const w = Math.min(2.6, 0.45 + g.length * 0.085)
      rect(ctx, `${b.id}-lg${i}`, { x: lx, y: rowsBottom + 0.2, w: 0.16, h: 0.16 }, { kind: 'solid', color: colors[i] }, 0.03)
      text(ctx, { id: `${b.id}-lgt${i}`, role: 'small', text: g, x: lx + 0.24, y: rowsBottom + 0.13, w: w - 0.24, h: 0.3, max: 12, maxLines: 1, color: t.muted })
      lx += w + 0.2
    })
  }
}

// ---------------------------------------------------------------------------
// Funnel – stages that narrow down, with conversion between steps.
// ---------------------------------------------------------------------------

function fmtNum(v: number): string {
  if (Math.abs(v) >= 1e6) return `${Math.round(v / 1e5) / 10}M`
  if (Math.abs(v) >= 1e4) return `${Math.round(v / 100) / 10}k`
  return v.toLocaleString('en-US')
}

export function renderFunnel(ctx: Ctx, b: BlockOf<'funnel'>, box: Box): void {
  const t = ctx.theme
  const stages = b.stages.filter((s) => Number.isFinite(s.value))
  if (!stages.length) return
  const max = Math.max(...stages.map((s) => Math.abs(s.value)), 1)
  const gap = 0.1
  const rowH = Math.min(1.05, (box.h - gap * (stages.length - 1)) / stages.length)
  const barArea = box.w * 0.6
  const top = box.y + (box.h - (rowH * stages.length + gap * (stages.length - 1))) / 2
  stages.forEach((s, i) => {
    const y = top + i * (rowH + gap)
    const w = barArea * (0.28 + (0.72 * Math.abs(s.value)) / max)
    const x = box.x + (barArea - w) / 2
    const c = mix(t.accents[0], t.bgColor, (i / Math.max(1, stages.length)) * 0.55)
    add(ctx, { kind: 'shape', id: `${b.id}-bar${i}`, shape: t.radius > 0 ? 'roundRect' : 'rect', radius: Math.min(t.radius, rowH / 2), x, y, w, h: rowH, fill: { kind: 'solid', color: c } })
    text(ctx, {
      id: `${b.id}-v${i}`,
      role: 'cardTitle',
      text: fmtNum(s.value) + (b.unit ?? ''),
      x,
      y,
      w,
      h: rowH,
      align: 'center',
      valign: 'middle',
      color: labelOn(c),
      bold: true,
      max: 24,
      min: 10,
      maxLines: 1
    })
    const lx = box.x + barArea + 0.45
    const conv = i > 0 && stages[i - 1].value ? Math.round((s.value / stages[i - 1].value) * 1000) / 10 : null
    text(ctx, { id: `${b.id}-l${i}`, role: 'cardTitle', text: s.label, x: lx, y: y + (conv !== null ? 0.02 : 0), w: box.x + box.w - lx, h: conv !== null ? rowH * 0.58 : rowH, valign: conv !== null ? 'bottom' : 'middle', max: 22, maxLines: 1 })
    if (conv !== null)
      text(ctx, { id: `${b.id}-c${i}`, role: 'small', text: `${conv}% of previous step`, x: lx, y: y + rowH * 0.6, w: box.x + box.w - lx, h: rowH * 0.4, maxLines: 1, max: 13 })
  })
}
