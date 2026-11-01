import { SLIDE_H, SLIDE_W, type El, type Fill } from '../scene'
import type { Ctx } from './ctx'

// ---------------------------------------------------------------------------
// Decorations. Every slide gets the same deco ids (deco-0..2) so that with
// Morph the shapes glide / grow / recolour between slides – the signature
// "how did you do that" effect. Layouts pick a zone that keeps them out of
// the content's way.
// ---------------------------------------------------------------------------

export type Zone = 'full' | 'right' | 'left' | 'corner' | 'center' | 'bottom'

function rng(seed: number): () => number {
  let s = (seed * 9301 + 49297) % 233280
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

interface Spot {
  cx: number
  cy: number
  r: number // radius in inches
}

function spots(zone: Zone, rand: () => number): Spot[] {
  const j = (v: number, amt: number): number => v + (rand() - 0.5) * amt
  switch (zone) {
    case 'full':
      return [
        { cx: j(SLIDE_W * 0.82, 1.5), cy: j(1.2, 1), r: j(3.6, 0.8) },
        { cx: j(SLIDE_W * 0.12, 1.5), cy: j(SLIDE_H * 0.95, 1), r: j(3.2, 0.8) },
        { cx: j(SLIDE_W * 0.55, 2), cy: j(SLIDE_H * 1.05, 0.5), r: j(2.4, 0.6) }
      ]
    case 'right':
      return [
        { cx: j(SLIDE_W * 0.9, 0.8), cy: j(SLIDE_H * 0.3, 1.2), r: j(3.4, 0.6) },
        { cx: j(SLIDE_W * 1.02, 0.4), cy: j(SLIDE_H * 0.85, 0.8), r: j(2.6, 0.6) },
        { cx: j(SLIDE_W * 0.72, 1), cy: j(SLIDE_H * 1.1, 0.4), r: j(1.6, 0.4) }
      ]
    case 'left':
      return [
        { cx: j(SLIDE_W * 0.06, 0.8), cy: j(SLIDE_H * 0.3, 1), r: j(3.2, 0.6) },
        { cx: j(-0.4, 0.4), cy: j(SLIDE_H * 0.95, 0.6), r: j(2.6, 0.5) },
        { cx: j(SLIDE_W * 0.3, 1), cy: j(-0.6, 0.4), r: j(1.6, 0.4) }
      ]
    case 'center':
      return [
        { cx: j(SLIDE_W * 0.5, 1.5), cy: j(SLIDE_H * 0.5, 1), r: j(3.4, 0.6) },
        { cx: j(SLIDE_W * 0.15, 1), cy: j(SLIDE_H * 0.15, 0.8), r: j(2.2, 0.5) },
        { cx: j(SLIDE_W * 0.88, 1), cy: j(SLIDE_H * 0.9, 0.8), r: j(2.2, 0.5) }
      ]
    case 'bottom':
      return [
        { cx: j(SLIDE_W * 0.25, 1.5), cy: j(SLIDE_H * 1.1, 0.4), r: j(3, 0.5) },
        { cx: j(SLIDE_W * 0.75, 1.5), cy: j(SLIDE_H * 1.15, 0.4), r: j(3, 0.5) },
        { cx: j(SLIDE_W * 0.5, 2), cy: j(SLIDE_H * 1.25, 0.3), r: j(2, 0.4) }
      ]
    case 'corner':
    default:
      return [
        { cx: j(SLIDE_W + 0.4, 0.4), cy: j(-0.5, 0.4), r: j(2.4, 0.4) },
        { cx: j(-0.6, 0.4), cy: j(SLIDE_H + 0.5, 0.4), r: j(2.2, 0.4) },
        { cx: j(SLIDE_W * 0.6, 1), cy: j(SLIDE_H + 1.1, 0.2), r: j(1.4, 0.3) }
      ]
  }
}

const glow = (color: string, alpha: number): Fill => ({
  kind: 'radial',
  stops: [
    { pos: 0, color, alpha },
    { pos: 35, color, alpha: alpha * 0.45 },
    { pos: 70, color, alpha: 0 },
    { pos: 100, color, alpha: 0 }
  ]
})

export function decorate(ctx: Ctx, zone: Zone): El[] {
  const t = ctx.theme
  const rand = rng(ctx.index * 7 + 3)
  const sp = spots(zone, rand)
  const [a0, a1, a2] = t.accents
  const els: El[] = []
  const sq = (id: string, s: Spot, fill: Fill, scale = 2): El => ({
    kind: 'shape',
    id,
    shape: 'rect',
    x: s.cx - s.r * scale * 0.5,
    y: s.cy - s.r * scale * 0.5,
    w: s.r * scale,
    h: s.r * scale,
    fill
  })
  const circ = (id: string, s: Spot, fill?: Fill, line?: { color: string; width: number; alpha?: number }): El => ({
    kind: 'shape',
    id,
    shape: 'ellipse',
    x: s.cx - s.r,
    y: s.cy - s.r,
    w: s.r * 2,
    h: s.r * 2,
    fill,
    line
  })
  const k = t.dark ? 1 : 0.7

  switch (t.deco) {
    case 'none':
      break
    case 'aurora':
      // soft radial glows; the squares are invisible at their edges
      els.push(sq('deco-0', sp[0], glow(a0, 0.6 * k), 2.6))
      els.push(sq('deco-1', sp[1], glow(a1, 0.45 * k), 2.6))
      els.push(sq('deco-2', sp[2], glow(a2, 0.4 * k), 2.6))
      break
    case 'orbs':
      els.push(
        circ('deco-0', { ...sp[0], r: sp[0].r * 0.75 }, {
          kind: 'linear',
          angle: 45 + ctx.index * 25,
          stops: [
            { pos: 0, color: a1, alpha: t.dark ? 0.95 : 0.55 },
            { pos: 100, color: a0, alpha: t.dark ? 0.95 : 0.55 }
          ]
        })
      )
      els.push(sq('deco-1', sp[1], glow(a2, 0.45 * k), 2.4))
      els.push(circ('deco-2', { ...sp[2], r: sp[2].r * 0.45 }, undefined, { color: a1, width: 1.5, alpha: 0.6 }))
      break
    case 'grid':
      els.push(sq('deco-0', sp[0], glow(a0, 0.28), 2.6))
      els.push(circ('deco-1', { ...sp[1], r: sp[1].r * 0.55 }, undefined, { color: a0, width: 1, alpha: 0.7 }))
      els.push(sq('deco-2', sp[2], glow(a1, 0.22), 2.2))
      break
    case 'lines':
      els.push(circ('deco-0', { ...sp[0], r: sp[0].r * 0.85 }, undefined, { color: t.muted, width: 0.75, alpha: 0.45 }))
      els.push(circ('deco-1', { ...sp[1], r: sp[1].r * 0.6 }, undefined, { color: a0, width: 0.75, alpha: 0.6 }))
      els.push(circ('deco-2', { ...sp[2], r: 0.09 }, { kind: 'solid', color: a0 }))
      break
    case 'blocks': {
      // Swiss-style hard blocks that slide around between slides
      const s0 = sp[0]
      const w0 = zone === 'full' || zone === 'center' ? 2.4 : 1.1
      els.push({
        kind: 'shape',
        id: 'deco-0',
        shape: 'rect',
        x: Math.min(SLIDE_W - 0.25, Math.max(SLIDE_W - w0, s0.cx - w0 / 2)),
        y: zone === 'corner' ? -0.01 : Math.max(-0.01, s0.cy - s0.r),
        w: w0,
        h: zone === 'corner' ? 0.28 : Math.min(SLIDE_H, s0.r * 2),
        fill: { kind: 'solid', color: a0 }
      })
      els.push(circ('deco-1', { ...sp[1], r: Math.min(1.4, sp[1].r * 0.45) }, { kind: 'solid', color: a1, alpha: t.dark ? 0.25 : 0.08 }))
      els.push({
        kind: 'shape',
        id: 'deco-2',
        shape: 'rect',
        x: Math.min(SLIDE_W - 0.5, Math.max(0.2, sp[2].cx)),
        y: Math.min(SLIDE_H - 0.5, Math.max(0.2, sp[2].cy - 1.3)),
        w: 0.22,
        h: 0.22,
        fill: { kind: 'solid', color: a2 }
      })
      break
    }
  }
  return els
}
