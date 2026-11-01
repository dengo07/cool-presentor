import type { BlockOf } from '../model'
import type { Para } from '../scene'
import { fitSize } from '../measure'
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
    add(ctx, { kind: 'icon', id: `${b.id}-ph`, icon: 'ImagePlus', color: t.text, stroke: 1.5, x: box.x + box.w / 2 - s / 2, y: box.y + box.h / 2 - s / 2, w: s, h: s })
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
  add(ctx, {
    kind: 'chart',
    id: b.id,
    ...box,
    chartKind: b.kind,
    categories: b.categories,
    series: b.series,
    unit: b.unit,
    colors: t.chartColors,
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
