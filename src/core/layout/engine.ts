import type { Deck, Slide } from '../model'
import type { Measurer } from '../measure'
import { SLIDE_H, SLIDE_W, type Scene } from '../scene'
import { deckTheme, type Theme } from '../themes'
import type { Ctx } from './ctx'
import { decorate } from './deco'
import { getLayout, LAYOUTS, signature } from './layouts'
import { applyFreeform } from '../freeform'

export interface Candidate {
  id: string
  name: string
  score: number
}

/** All layouts that can render this slide, best first. */
export function candidates(slide: Slide, index: number, total: number): Candidate[] {
  const sig = signature(slide, index, total)
  return LAYOUTS.map((l) => ({ id: l.id, name: l.name, score: l.score(sig) }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score)
}

/**
 * Picks a layout for every slide. Explicit choices are honoured (if still
 * valid); 'auto' slides get the best scoring layout, with a penalty for
 * repeating the previous slide's layout so decks feel varied.
 */
export function resolveLayouts(deck: Deck): string[] {
  const out: string[] = []
  const total = deck.slides.length
  deck.slides.forEach((slide, i) => {
    const cands = candidates(slide, i, total)
    if (slide.layout !== 'auto' && cands.some((c) => c.id === slide.layout)) {
      out.push(slide.layout)
      return
    }
    const prev = out[i - 1]
    const prev2 = out[i - 2]
    let best = cands[0]
    let bestScore = -Infinity
    for (const c of cands) {
      const s = c.score - (c.id === prev ? 3 : 0) - (c.id === prev2 ? 1 : 0)
      if (s > bestScore) {
        bestScore = s
        best = c
      }
    }
    out.push(best?.id ?? 'generic')
  })
  return out
}

export function buildScene(slide: Slide, index: number, total: number, layoutId: string, theme: Theme, m: Measurer, section?: number): Scene {
  const layout = getLayout(layoutId) ?? getLayout('generic')!
  const ctx: Ctx = { theme, slide, index, total, m, els: [], section }
  // background (as a shape so gradients work and Morph can blend it)
  ctx.els.push({ kind: 'shape', id: 'bg', shape: 'rect', x: 0, y: 0, w: SLIDE_W, h: SLIDE_H, fill: theme.bg })
  ctx.els.push(...decorate(ctx, layout.zone))
  layout.render(ctx)
  // free edits for this layout + free items, on top of the auto-layout
  applyFreeform(ctx, layout.id)
  return { bg: theme.bgColor, elements: ctx.els, notes: slide.notes, transition: slide.transition, layoutId: layout.id }
}

export function buildDeck(deck: Deck, m: Measurer): Scene[] {
  const theme = deckTheme(deck)
  const layouts = resolveLayouts(deck)
  let sections = 0
  return deck.slides.map((s, i) => {
    if (layouts[i] === 'section') sections++
    return buildScene(s, i, deck.slides.length, layouts[i], theme, m, sections)
  })
}
