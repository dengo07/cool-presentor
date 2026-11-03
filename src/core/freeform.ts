import type { Block, FreeColor, FreeItem, Slide, Tweak } from './model'
import { fitSize, type Measurer } from './measure'
import type { Color, El } from './scene'
import type { Theme } from './themes'
import { add, type Box, type Ctx, text } from './layout/ctx'

// ---------------------------------------------------------------------------
// Free editing on top of the auto-layout.
//
// The layout always runs first and stays the source of truth. Afterwards:
//   1. tweaks for the current layout move / scale / hide whole blocks,
//   2. free items (text, boxes, arrows) are drawn on top at fixed positions.
// Tweaks are keyed by layout id and block id, so content edits keep them and
// another layout starts clean instead of inheriting offsets made for a
// different arrangement.
// ---------------------------------------------------------------------------

export const FREE_PREFIX = 'free-'
const HEADER: Record<string, Block['type']> = { title: 'title', subtitle: 'subtitle', eyebrow: 'eyebrow' }

/** The editable group an element belongs to: a block id, a free item element id, or null (background, decoration). */
export function groupOf(elId: string, blocks: Pick<Block, 'id' | 'type'>[]): string | null {
  if (elId.startsWith(FREE_PREFIX)) return elId
  const header = HEADER[elId]
  if (header) return blocks.find((b) => b.type === header)?.id ?? null
  const hit = blocks.filter((b) => elId === b.id || elId.startsWith(b.id + '-')).sort((a, b) => b.id.length - a.id.length)[0]
  return hit?.id ?? null
}

/** Bounding box of elements (lines may have negative w/h). */
export function bounds(els: El[]): Box {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const e of els) {
    x0 = Math.min(x0, e.x, e.x + e.w)
    y0 = Math.min(y0, e.y, e.y + e.h)
    x1 = Math.max(x1, e.x, e.x + e.w)
    y1 = Math.max(y1, e.y, e.y + e.h)
  }
  return { x: x0, y: y0, w: Math.max(0, x1 - x0), h: Math.max(0, y1 - y0) }
}

/**
 * Moves and scales a group of elements as one: scale (sx, sy) about the
 * group's top-left corner, then offset (dx, dy). With a measurer, text is
 * re-fitted to its new box; without one (live drag preview) only geometry changes.
 */
export function transformGroup(els: El[], t: Tweak, m?: Measurer): El[] {
  const b = bounds(els)
  const sx = t.sx ?? 1
  const sy = t.sy ?? 1
  const dx = t.dx ?? 0
  const dy = t.dy ?? 0
  const scaled = sx !== 1 || sy !== 1
  return els.map((el): El => {
    const x = b.x + (el.x - b.x) * sx + dx
    const y = b.y + (el.y - b.y) * sy + dy
    const w = el.w * sx
    const h = el.h * sy
    if (el.kind === 'icon') {
      // icons stay square, centred where their box went
      const s = Math.min(sx, sy)
      return { ...el, x: x + w / 2 - (el.w * s) / 2, y: y + h / 2 - (el.h * s) / 2, w: el.w * s, h: el.h * s }
    }
    if (el.kind === 'text' && scaled && m) {
      const r = fitSize(m, el.paras, el, el.size * Math.max(sx, sy, 1), Math.min(el.size, 7), w, h)
      return { ...el, x, y, w, h, size: r.size }
    }
    if (el.kind === 'shape' && el.radius !== undefined) return { ...el, x, y, w, h, radius: el.radius * Math.min(sx, sy) }
    return { ...el, x, y, w, h }
  })
}

export function freeColor(theme: Theme, c: FreeColor | undefined, fallback: FreeColor): Color {
  switch (c ?? fallback) {
    case 'text':
      return theme.text
    case 'muted':
      return theme.muted
    case 'accent':
      return theme.accents[0]
    case 'accent2':
      return theme.accents[1]
    case 'accent3':
      return theme.accents[2]
    case 'alert':
      return theme.highlight.kind === 'solid' ? theme.highlight.color : theme.highlight.stops[0].color
  }
}

function renderFreeItem(ctx: Ctx, it: FreeItem): void {
  const t = ctx.theme
  const id = FREE_PREFIX + it.id
  const box = { x: Math.min(it.x, it.x + it.w), y: Math.min(it.y, it.y + it.h), w: Math.abs(it.w), h: Math.abs(it.h) }
  if (it.kind === 'text') {
    text(ctx, { id, role: 'body', text: it.text ?? '', ...box, color: freeColor(t, it.color, 'text'), max: it.size ?? 20, min: 7 })
    return
  }
  const c = freeColor(t, it.color, 'accent')
  if (it.kind === 'arrow') {
    add(ctx, { kind: 'shape', id, shape: 'line', x: it.x, y: it.y, w: it.w, h: it.h, line: { color: c, width: 2.25 }, arrow: { end: true } })
    return
  }
  add(ctx, {
    kind: 'shape',
    id,
    shape: it.kind === 'ellipse' ? 'ellipse' : t.radius > 0 ? 'roundRect' : 'rect',
    radius: Math.min(t.radius, box.h / 2, 0.2),
    ...box,
    fill: it.filled ? { kind: 'solid', color: c } : undefined,
    line: it.filled ? undefined : { color: c, width: 2 }
  })
}

/** Applies this layout's tweaks and draws the free items. Runs after the layout. */
export function applyFreeform(ctx: Ctx, layoutId: string): void {
  const slide = ctx.slide
  const tweaks = slide.tweaks?.[layoutId]
  if (tweaks && Object.keys(tweaks).length) {
    const groups = new Map<string, number[]>()
    ctx.els.forEach((el, i) => {
      const g = groupOf(el.id, slide.blocks)
      if (g && tweaks[g]) groups.set(g, [...(groups.get(g) ?? []), i])
    })
    const drop = new Set<number>()
    for (const [g, idx] of groups) {
      const tw = tweaks[g]
      if (tw.hidden) idx.forEach((i) => drop.add(i))
      else transformGroup(idx.map((i) => ctx.els[i]), tw, ctx.m).forEach((el, k) => (ctx.els[idx[k]] = el))
    }
    if (drop.size) ctx.els = ctx.els.filter((_, i) => !drop.has(i))
  }
  for (const it of slide.extras ?? []) renderFreeItem(ctx, it)
}

// ---------------------------------------------------------------------------
// Pure slide updates used by the editor
// ---------------------------------------------------------------------------

const isIdentity = (t: Tweak): boolean =>
  !t.hidden && Math.abs(t.dx ?? 0) < 1e-3 && Math.abs(t.dy ?? 0) < 1e-3 && Math.abs((t.sx ?? 1) - 1) < 1e-3 && Math.abs((t.sy ?? 1) - 1) < 1e-3

/** Sets (or with null clears) one block's tweak for a layout. Empty maps are removed. */
export function setTweak(slide: Slide, layoutId: string, key: string, tweak: Tweak | null): Slide {
  const forLayout = { ...(slide.tweaks?.[layoutId] ?? {}) }
  if (tweak && !isIdentity(tweak)) forLayout[key] = tweak
  else delete forLayout[key]
  const tweaks = { ...(slide.tweaks ?? {}) }
  if (Object.keys(forLayout).length) tweaks[layoutId] = forLayout
  else delete tweaks[layoutId]
  return { ...slide, tweaks: Object.keys(tweaks).length ? tweaks : undefined }
}

export function clearTweaks(slide: Slide, layoutId: string): Slide {
  const tweaks = { ...(slide.tweaks ?? {}) }
  delete tweaks[layoutId]
  return { ...slide, tweaks: Object.keys(tweaks).length ? tweaks : undefined }
}

export function upsertExtra(slide: Slide, item: FreeItem): Slide {
  const extras = slide.extras ?? []
  return { ...slide, extras: extras.some((e) => e.id === item.id) ? extras.map((e) => (e.id === item.id ? item : e)) : [...extras, item] }
}

export function removeExtra(slide: Slide, id: string): Slide {
  const extras = (slide.extras ?? []).filter((e) => e.id !== id)
  return { ...slide, extras: extras.length ? extras : undefined }
}

/**
 * The tweak that puts a group whose box is currently `shown` (with tweak `t`
 * applied) at `target` instead – used when a drag or resize ends.
 */
export function retarget(t: Tweak, shown: Box, target: Box): Tweak {
  const sx = t.sx ?? 1
  const sy = t.sy ?? 1
  // the untweaked box the layout produced
  const base = { x: shown.x - (t.dx ?? 0), y: shown.y - (t.dy ?? 0), w: shown.w / sx, h: shown.h / sy }
  return {
    ...t,
    dx: target.x - base.x,
    dy: target.y - base.y,
    sx: base.w > 1e-6 ? target.w / base.w : sx,
    sy: base.h > 1e-6 ? target.h / base.h : sy
  }
}
