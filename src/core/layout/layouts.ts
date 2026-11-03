import type { Block, BlockType, Slide } from '../model'
import { SLIDE_H as H, SLIDE_W as W } from '../scene'
import {
  renderBulletCards,
  renderBullets,
  renderChart,
  renderComparison,
  renderFeatures,
  renderFunnel,
  renderGantt,
  renderImage,
  renderQuote,
  renderStat,
  renderText,
  renderTimeline
} from './blocks'
import { all, type Box, card, contentBlocks, type Ctx, hasHeader, header, hline, MX, MY, one, pad2, rect, text, vline } from './ctx'
import type { Zone } from './deco'

// ---------------------------------------------------------------------------
// Signature of a slide's content – what layouts score against.
// ---------------------------------------------------------------------------

export interface Sig {
  n: Record<BlockType, number>
  content: number // number of non-header blocks
  isFirst: boolean
  isLast: boolean
  textLen: number
  bulletItems: number
  maxItemLen: number
}

const TYPES: BlockType[] = ['title', 'subtitle', 'eyebrow', 'text', 'bullets', 'stat', 'quote', 'image', 'chart', 'timeline', 'features', 'comparison', 'gantt', 'funnel']

export function signature(slide: Slide, index: number, total: number): Sig {
  const n = Object.fromEntries(TYPES.map((t) => [t, 0])) as Record<BlockType, number>
  let textLen = 0
  let bulletItems = 0
  let maxItemLen = 0
  for (const b of slide.blocks) {
    n[b.type]++
    if (b.type === 'text') textLen += b.text.length
    if (b.type === 'bullets') {
      bulletItems += b.items.length
      for (const it of b.items) {
        textLen += it.length
        maxItemLen = Math.max(maxItemLen, it.length)
      }
    }
  }
  return { n, content: contentBlocks(slide).length, isFirst: index === 0, isLast: index === total - 1, textLen, bulletItems, maxItemLen }
}

/** True when the slide contains no block types other than the given ones. */
function only(s: Sig, ...allowed: BlockType[]): boolean {
  const ok = new Set<BlockType>(['title', 'subtitle', 'eyebrow', ...allowed])
  return TYPES.every((t) => ok.has(t) || s.n[t] === 0)
}

export interface Layout {
  id: string
  name: string
  zone: Zone
  /** 0 = cannot render this content. Higher = better fit. */
  score(s: Sig): number
  render(ctx: Ctx): void
}

// Shift everything added since `from` vertically (used to centre measured content).
function shiftFrom(ctx: Ctx, from: number, dy: number): void {
  for (let i = from; i < ctx.els.length; i++) ctx.els[i].y += dy
}

/** Text and/or bullets in a box, stacked. Returns used height. */
function body(ctx: Ctx, box: Box, o: { max?: number } = {}): number {
  let y = box.y
  for (const b of ctx.slide.blocks) {
    if (b.type !== 'text' && b.type !== 'bullets') continue
    const bx = { x: box.x, y, w: box.w, h: box.y + box.h - y }
    const h = b.type === 'text' ? renderText(ctx, b, bx, o) : renderBullets(ctx, b, bx, o)
    y += h + 0.3
  }
  return Math.max(0, y - box.y - 0.3)
}

function bodyCentered(ctx: Ctx, box: Box, o: { max?: number } = {}): void {
  const from = ctx.els.length
  const h = body(ctx, box, o)
  shiftFrom(ctx, from, Math.max(0, (box.h - h) / 2))
}

/** Header group vertically centred together with body below it. */
function headerAndBody(ctx: Ctx, box: Box, o: { max?: number; titleMax?: number } = {}): void {
  const from = ctx.els.length
  const hasBody = ctx.slide.blocks.some((b) => b.type === 'text' || b.type === 'bullets')
  const headH = hasBody ? Math.min(2.6, box.h * 0.45) : box.h
  const bottom = header(ctx, { ...box, h: headH, max: o.titleMax })
  let used = bottom - box.y
  if (hasBody) {
    const by = bottom + 0.4
    used += 0.4 + body(ctx, { x: box.x, y: by, w: box.w, h: box.y + box.h - by }, o)
  }
  shiftFrom(ctx, from, Math.max(0, (box.h - used) / 2))
}

export function renderAny(ctx: Ctx, b: Block, box: Box): void {
  switch (b.type) {
    case 'text':
      renderText(ctx, b, box)
      break
    case 'bullets':
      renderBullets(ctx, b, box)
      break
    case 'stat':
      renderStat(ctx, b, box)
      break
    case 'quote':
      renderQuote(ctx, b, box)
      break
    case 'image':
      renderImage(ctx, b, box, { radius: ctx.theme.radius })
      break
    case 'chart':
      renderChart(ctx, b, box)
      break
    case 'timeline':
      renderTimeline(ctx, b, box)
      break
    case 'features':
      renderFeatures(ctx, b, box)
      break
    case 'comparison':
      renderComparison(ctx, b, box)
      break
    case 'gantt':
      renderGantt(ctx, b, box)
      break
    case 'funnel':
      renderFunnel(ctx, b, box)
      break
    default:
      break
  }
}

const accentRule = (ctx: Ctx, x: number, y: number, w = 1.1): void => hline(ctx, 'rule', x, y, w, ctx.theme.accents[0], 2.5)

// ---------------------------------------------------------------------------
// The layouts
// ---------------------------------------------------------------------------

export const LAYOUTS: Layout[] = [
  {
    id: 'hero',
    name: 'Hero',
    zone: 'full',
    score: (s) => (s.n.title && only(s) ? (s.isFirst ? 14 : 6) : 0),
    render(ctx) {
      const bottom = header(ctx, { x: MX + 0.15, y: MY + 0.3, w: 9.4, h: H - MY * 2 - 0.8, role: 'hero', anchor: 'middle', max: 84, subMax: 24 })
      accentRule(ctx, MX + 0.15, Math.min(H - 0.7, bottom + 0.45))
    }
  },
  {
    id: 'statement',
    name: 'Centered statement',
    zone: 'center',
    score: (s) => (s.n.title && only(s) ? (s.isFirst ? 9 : s.isLast ? 12 : 9) : 0),
    render(ctx) {
      const bottom = header(ctx, { x: 1.4, y: MY, w: W - 2.8, h: H - MY * 2, role: 'hero', align: 'center', anchor: 'middle', max: 72 })
      accentRule(ctx, W / 2 - 0.55, Math.min(H - 0.6, bottom + 0.4))
    }
  },
  {
    id: 'section',
    name: 'Section divider',
    zone: 'left',
    score: (s) => (s.n.title && only(s) && !s.isFirst && !s.n.subtitle ? 9.5 : 0),
    render(ctx) {
      const t = ctx.theme
      const hl = t.highlight
      const num = pad2(ctx.section ?? ctx.index + 1)
      const run = hl.kind === 'solid' ? { text: num, color: hl.color } : { text: num, fill: hl, color: hl.stops[0].color }
      text(ctx, { id: 'section-num', role: 'hero', paras: [{ runs: [run] }], x: MX, y: 1.2, w: 4.4, h: 5, max: 200, valign: 'middle', maxLines: 1 })
      vline(ctx, 'rule', 5.6, 2.3, 2.9, t.accents[0], 2.5)
      header(ctx, { x: 6.2, y: MY, w: W - 6.2 - MX, h: H - MY * 2, role: 'hero', anchor: 'middle', max: 64 })
    }
  },
  {
    id: 'title-body',
    name: 'Title + body',
    zone: 'right',
    score: (s) => (s.n.title && (s.n.text || s.n.bullets) && only(s, 'text', 'bullets') ? 6 : 0),
    render(ctx) {
      const bottom = header(ctx, { x: MX, y: MY + 0.1, w: 9, h: 2.4 })
      accentRule(ctx, MX, bottom + 0.3, 0.8)
      body(ctx, { x: MX, y: bottom + 0.65, w: 8, h: H - MY - bottom - 0.65 }, { max: 24 })
    }
  },
  {
    id: 'split',
    name: 'Split columns',
    zone: 'corner',
    score: (s) => (s.n.title && (s.n.text || s.n.bullets) && only(s, 'text', 'bullets') ? (s.textLen < 520 ? 7.5 : 5) : 0),
    render(ctx) {
      header(ctx, { x: MX, y: MY, w: 4.9, h: H - MY * 2, anchor: 'middle', max: 46 })
      vline(ctx, 'rule', 6.25, 1.6, H - 3.2, ctx.theme.accents[0], 2.5)
      bodyCentered(ctx, { x: 6.85, y: MY, w: W - 6.85 - MX, h: H - MY * 2 }, { max: 24 })
    }
  },
  {
    id: 'cards',
    name: 'Numbered cards',
    zone: 'corner',
    score: (s) =>
      s.n.bullets === 1 && only(s, 'bullets') && s.bulletItems >= 2 && s.bulletItems <= 6 && s.maxItemLen <= 110 ? 8.5 : 0,
    render(ctx) {
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 2, h: 2 })
      const top = Math.max(bottom + 0.5, 2.3)
      renderBulletCards(ctx, one(ctx, 'bullets')!, { x: MX, y: top, w: W - MX * 2, h: H - MY - top })
    }
  },
  {
    id: 'image-left',
    name: 'Image left, full bleed',
    zone: 'corner',
    score: (s) => (s.n.image === 1 && only(s, 'image', 'text', 'bullets') ? 9 : 0),
    render(ctx) {
      renderImage(ctx, one(ctx, 'image')!, { x: 0, y: 0, w: W * 0.47, h: H })
      headerAndBody(ctx, { x: W * 0.47 + 0.75, y: MY, w: W * 0.53 - 0.75 - MX, h: H - MY * 2 })
    }
  },
  {
    id: 'image-right',
    name: 'Image right, rounded',
    zone: 'corner',
    score: (s) => (s.n.image === 1 && only(s, 'image', 'text', 'bullets') ? 8.5 : 0),
    render(ctx) {
      const r = Math.max(0.15, ctx.theme.radius * 1.5)
      renderImage(ctx, one(ctx, 'image')!, { x: W - MX - 5.7, y: MY, w: 5.7, h: H - MY * 2 }, { radius: r })
      headerAndBody(ctx, { x: MX, y: MY, w: W - MX * 2 - 5.7 - 0.7, h: H - MY * 2 })
    }
  },
  {
    id: 'image-full',
    name: 'Full-bleed image',
    zone: 'corner',
    score: (s) => (s.n.image === 1 && only(s, 'image') ? (s.n.title ? 10 : 9) : 0),
    render(ctx) {
      renderImage(ctx, one(ctx, 'image')!, { x: 0, y: 0, w: W, h: H })
      rect(ctx, 'scrim', { x: 0, y: 0, w: W, h: H }, {
        kind: 'linear',
        angle: 90,
        stops: [
          { pos: 0, color: '000000', alpha: 0 },
          { pos: 35, color: '000000', alpha: 0.08 },
          { pos: 100, color: '000000', alpha: 0.85 }
        ]
      })
      header(ctx, { x: MX, y: H * 0.35, w: 9.5, h: H * 0.65 - MY, anchor: 'bottom', role: 'hero', max: 64, titleColor: 'FFFFFF', subColor: 'E6E6E6', eyebrowColor: 'FFFFFF' })
    }
  },
  {
    id: 'image-framed',
    name: 'Framed image',
    zone: 'corner',
    score: (s) => (s.n.image === 1 && s.n.title && only(s, 'image', 'text', 'bullets') ? 7 : 0),
    render(ctx) {
      const b = { x: W - MX - 5.6, y: 1.05, w: 5.6, h: 5.4 }
      const pad = 0.14
      ctx.els.push({
        kind: 'shape',
        id: 'frame',
        shape: 'rect',
        ...b,
        rotate: -2.5,
        fill: { kind: 'solid', color: 'FFFFFF' },
        shadow: { color: '000000', alpha: 0.25, blur: 30, offset: 10, angle: 90 }
      })
      renderImage(ctx, one(ctx, 'image')!, { x: b.x + pad, y: b.y + pad, w: b.w - pad * 2, h: b.h - pad * 2 })
      ctx.els[ctx.els.length - 1].rotate = -2.5
      headerAndBody(ctx, { x: MX, y: MY, w: W - MX * 2 - 5.6 - 0.8, h: H - MY * 2 })
    }
  },
  {
    id: 'image-pair',
    name: 'Two photos',
    zone: 'corner',
    score: (s) => (s.n.image === 2 && only(s, 'image') ? 11 : 0),
    render(ctx) {
      const imgs = all(ctx, 'image')
      const bottom = hasHeader(ctx) ? header(ctx, { x: MX, y: MY, w: W - MX * 2 - 1, h: 1.8 }) : MY - 0.35
      const top = bottom + 0.4
      const capH = imgs.some((i) => i.alt) ? 0.6 : 0
      const gap = 0.25
      const w = (W - MX * 2 - gap) / 2
      const h = H - MY + 0.2 - top - capH
      imgs.forEach((im, i) => {
        const x = MX + i * (w + gap)
        renderImage(ctx, im, { x, y: top, w, h }, { radius: ctx.theme.radius })
        if (im.alt) text(ctx, { id: `${im.id}-cap`, role: 'small', text: im.alt, x, y: top + h + 0.12, w, h: capH - 0.1, max: 13, maxLines: 2 })
      })
    }
  },
  {
    id: 'stats',
    name: 'Stat row',
    zone: 'corner',
    score: (s) => (s.n.stat >= 2 && s.n.stat <= 4 && only(s, 'stat') ? 10 : 0),
    render(ctx) {
      const stats = all(ctx, 'stat')
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 1.5, h: 2.1 })
      const top = Math.max(bottom + 0.55, 2.4)
      const gap = 0.3
      const cw = (W - MX * 2 - gap * (stats.length - 1)) / stats.length
      const ch = Math.min(3.6, H - MY - top)
      stats.forEach((st, i) => renderStat(ctx, st, { x: MX + i * (cw + gap), y: top, w: cw, h: ch }, { max: stats.length > 3 ? 64 : 80 }))
    }
  },
  {
    id: 'stat-hero',
    name: 'Giant number',
    zone: 'corner',
    score: (s) => (s.n.stat === 1 && only(s, 'stat', 'text', 'bullets') ? 10 : 0),
    render(ctx) {
      const st = one(ctx, 'stat')!
      renderStat(ctx, st, { x: MX, y: 1.0, w: 6.4, h: 5.2 }, { card: false, max: 190 })
      vline(ctx, 'rule', 7.55, 1.9, 3.6, ctx.theme.accents[0], 2.5)
      headerAndBody(ctx, { x: 8.1, y: MY, w: W - 8.1 - MX, h: H - MY * 2 }, { titleMax: 36, max: 20 })
    }
  },
  {
    id: 'quote',
    name: 'Big quote',
    zone: 'center',
    score: (s) => (s.n.quote === 1 && only(s, 'quote') ? 10 : 0),
    render(ctx) {
      const eb = one(ctx, 'eyebrow')
      if (eb) text(ctx, { id: 'eyebrow', role: 'label', text: eb.text, x: 1.7, y: MY + 0.1, w: 8, h: 0.32 })
      renderQuote(ctx, one(ctx, 'quote')!, { x: 1.7, y: 1.0, w: W - 3.4, h: H - 1.9 })
    }
  },
  {
    id: 'quote-image',
    name: 'Quote + portrait',
    zone: 'corner',
    score: (s) => (s.n.quote === 1 && s.n.image === 1 && only(s, 'quote', 'image') ? 11 : 0),
    render(ctx) {
      renderImage(ctx, one(ctx, 'image')!, { x: W * 0.6, y: 0, w: W * 0.4, h: H })
      renderQuote(ctx, one(ctx, 'quote')!, { x: MX + 0.2, y: 1.0, w: W * 0.6 - MX - 1, h: H - 1.9 })
    }
  },
  {
    id: 'chart-takeaway',
    name: 'Chart + takeaway',
    zone: 'corner',
    score: (s) => (s.n.chart === 1 && (s.n.text || s.n.bullets || s.n.stat === 1) && only(s, 'chart', 'text', 'bullets', 'stat') ? 10 : 0),
    render(ctx) {
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 2, h: 1.9 })
      const top = Math.max(bottom + 0.45, 2.1)
      const h = H - MY - top
      renderChart(ctx, one(ctx, 'chart')!, { x: MX - 0.1, y: top, w: 7.4, h })
      const cx = MX + 7.7
      const box = { x: cx, y: top, w: W - MX - cx, h }
      card(ctx, 'side-card', box)
      const st = one(ctx, 'stat')
      if (st) {
        const sh = Math.min(2.8, box.h * 0.55)
        renderStat(ctx, st, { x: box.x + 0.4, y: box.y + 0.15, w: box.w - 0.8, h: sh }, { card: false, max: 72 })
        body(ctx, { x: box.x + 0.4, y: box.y + sh + 0.35, w: box.w - 0.8, h: box.h - sh - 0.6 }, { max: 17 })
      } else {
        bodyCentered(ctx, { x: box.x + 0.4, y: box.y + 0.4, w: box.w - 0.8, h: box.h - 0.8 }, { max: 20 })
      }
    }
  },
  {
    id: 'chart-wide',
    name: 'Wide chart',
    zone: 'corner',
    score: (s) => (s.n.chart === 1 && only(s, 'chart') ? 9 : 0),
    render(ctx) {
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 2, h: 1.9 })
      const top = Math.max(bottom + 0.4, 1.9)
      renderChart(ctx, one(ctx, 'chart')!, { x: MX - 0.1, y: top, w: W - MX * 2 + 0.2, h: H - MY - top })
    }
  },
  {
    id: 'gantt',
    name: 'Gantt chart',
    zone: 'corner',
    score: (s) => (s.n.gantt === 1 && only(s, 'gantt') ? 10 : 0),
    render(ctx) {
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 2, h: 1.8 })
      const top = Math.max(bottom + 0.4, 1.9)
      renderGantt(ctx, one(ctx, 'gantt')!, { x: MX, y: top, w: W - MX * 2, h: H - MY + 0.15 - top })
    }
  },
  {
    id: 'funnel',
    name: 'Funnel',
    zone: 'corner',
    score: (s) => (s.n.funnel === 1 && only(s, 'funnel', 'text', 'bullets') ? 10 : 0),
    render(ctx) {
      const hasBody = ctx.slide.blocks.some((b) => b.type === 'text' || b.type === 'bullets')
      if (hasBody) {
        // funnel on the left, header + takeaway on the right
        renderFunnel(ctx, one(ctx, 'funnel')!, { x: MX, y: MY + 0.1, w: 7.4, h: H - MY * 2 - 0.2 })
        headerAndBody(ctx, { x: MX + 7.9, y: MY, w: W - MX * 2 - 7.9, h: H - MY * 2 }, { titleMax: 34, max: 18 })
        return
      }
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 2, h: 1.8 })
      const top = Math.max(bottom + 0.45, 2)
      renderFunnel(ctx, one(ctx, 'funnel')!, { x: MX, y: top, w: W - MX * 2, h: H - MY - top })
    }
  },
  {
    id: 'timeline',
    name: 'Timeline',
    zone: 'corner',
    score: (s) => (s.n.timeline === 1 && only(s, 'timeline') ? 10 : 0),
    render(ctx) {
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 2, h: 2.2 })
      const top = Math.max(bottom + 0.6, 2.4)
      const tl = one(ctx, 'timeline')!
      const need = tl.items.some((i) => i.text) ? 2.6 : 1.9
      const avail = H - MY - top
      const y = top + Math.max(0, (avail - need) / 2)
      renderTimeline(ctx, tl, { x: MX, y, w: W - MX * 2, h: Math.min(avail, need + 0.6) })
    }
  },
  {
    id: 'features',
    name: 'Feature grid',
    zone: 'corner',
    score: (s) => (s.n.features === 1 && only(s, 'features') ? 10 : 0),
    render(ctx) {
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 2, h: 2 })
      const top = Math.max(bottom + 0.5, 2.2)
      renderFeatures(ctx, one(ctx, 'features')!, { x: MX, y: top, w: W - MX * 2, h: H - MY - top })
    }
  },
  {
    id: 'features-side',
    name: 'Features beside title',
    zone: 'corner',
    score: (s) => (s.n.features === 1 && s.n.title && only(s, 'features') ? 7.5 : 0),
    render(ctx) {
      header(ctx, { x: MX, y: MY, w: 4.4, h: H - MY * 2, anchor: 'middle', max: 44 })
      const f = one(ctx, 'features')!
      const n = f.items.length
      const h = Math.min(H - MY * 2, n * 1.35 + (n - 1) * 0.3)
      renderFeatures(ctx, f, { x: 5.9, y: (H - h) / 2, w: W - 5.9 - MX, h }, { cols: n > 4 ? 2 : 1 })
    }
  },
  {
    id: 'comparison',
    name: 'Comparison',
    zone: 'corner',
    score: (s) => (s.n.comparison === 1 && only(s, 'comparison') ? 10 : 0),
    render(ctx) {
      const bottom = header(ctx, { x: MX, y: MY, w: W - MX * 2 - 2, h: 1.9 })
      const top = Math.max(bottom + 0.5, 2.1)
      renderComparison(ctx, one(ctx, 'comparison')!, { x: MX, y: top, w: W - MX * 2, h: H - MY - top })
    }
  },
  {
    id: 'big-text',
    name: 'Big statement',
    zone: 'center',
    score: (s) => (s.n.text === 1 && !s.n.title && only(s, 'text') && s.textLen <= 240 ? 10 : 0),
    render(ctx) {
      const eb = one(ctx, 'eyebrow')
      const t = one(ctx, 'text')!
      const from = ctx.els.length
      let y = MY
      if (eb) {
        text(ctx, { id: 'eyebrow', role: 'label', text: eb.text, x: 1.5, y, w: W - 3, h: 0.32, align: 'center' })
        y += 0.6
      }
      const r = text(ctx, { id: t.id, role: 'quote', text: t.text, x: 1.5, y, w: W - 3, h: H - MY - y - 0.2, max: 52, align: 'center', fit: 'content' })
      accentRule(ctx, W / 2 - 0.55, y + r.height + 0.45)
      shiftFrom(ctx, from, Math.max(0, (H - (y + r.height + 0.5 - MY)) / 2 - MY))
    }
  },
  {
    id: 'generic',
    name: 'Stacked',
    zone: 'corner',
    score: () => 1,
    render(ctx) {
      const content = contentBlocks(ctx.slide)
      const hasHead = ctx.slide.blocks.some((b) => b.type === 'title' || b.type === 'subtitle' || b.type === 'eyebrow')
      const bottom = hasHead ? header(ctx, { x: MX, y: MY, w: W - MX * 2 - 1, h: 1.9 }) : MY - 0.4
      const top = bottom + 0.45
      const avail = { x: MX, y: top, w: W - MX * 2, h: H - MY - top }
      if (!content.length) return
      // Up to 3 side-by-side columns, otherwise rows.
      if (content.length <= 3) {
        const gap = 0.45
        const cw = (avail.w - gap * (content.length - 1)) / content.length
        content.forEach((b, i) => renderAny(ctx, b, { x: avail.x + i * (cw + gap), y: avail.y, w: cw, h: avail.h }))
      } else {
        const gap = 0.25
        const rh = (avail.h - gap * (content.length - 1)) / content.length
        content.forEach((b, i) => renderAny(ctx, b, { x: avail.x, y: avail.y + i * (rh + gap), w: avail.w, h: rh }))
      }
    }
  }
]


export function getLayout(id: string): Layout | undefined {
  return LAYOUTS.find((l) => l.id === id)
}
