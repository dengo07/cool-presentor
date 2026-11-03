import { describe, expect, it } from 'vitest'
import { applyFreeform, clearTweaks, groupOf, retarget, setTweak, transformGroup } from '../src/core/freeform'
import { buildDeck } from '../src/core/layout/engine'
import { heuristicMeasurer } from '../src/core/measure'
import type { Deck, Slide } from '../src/core/model'
import type { El, ShapeEl, TextEl } from '../src/core/scene'

const slide = (extra: Partial<Slide> = {}): Slide => ({
  id: 's1',
  layout: 'auto',
  notes: '',
  transition: 'morph',
  blocks: [
    { id: 'bt', type: 'title', text: 'Hello there' },
    { id: 'bb', type: 'bullets', items: ['One point', 'Two points', 'Three points'] }
  ],
  ...extra
})
const deck = (s: Slide): Deck => ({ version: 1, title: 'x', themeId: 'paper', slides: [{ ...slide(), id: 's0' }, s] })
const scene = (s: Slide) => buildDeck(deck(s), heuristicMeasurer)[1]
const els = (s: Slide, key: string): El[] => scene(s).elements.filter((e) => groupOf(e.id, s.blocks) === key)

describe('groups', () => {
  it('maps semantic header ids, block element ids and free items', () => {
    const blocks = slide().blocks
    expect(groupOf('title', blocks)).toBe('bt')
    expect(groupOf('bb', blocks)).toBe('bb')
    expect(groupOf('bb-3', blocks)).toBe('bb')
    expect(groupOf('free-f1', blocks)).toBe('free-f1')
    expect(groupOf('deco1', blocks)).toBeNull()
    expect(groupOf('bg', blocks)).toBeNull()
  })
})

describe('tweaks', () => {
  const layout = scene(slide()).layoutId

  it('moves only the tweaked block, in the layout it was made for', () => {
    const before = scene(slide())
    const moved = scene(slide({ tweaks: { [layout]: { bt: { dx: 1, dy: 0.5 } } } }))
    const t0 = before.elements.find((e) => e.id === 'title')!
    const t1 = moved.elements.find((e) => e.id === 'title')!
    expect(t1.x).toBeCloseTo(t0.x + 1)
    expect(t1.y).toBeCloseTo(t0.y + 0.5)
    const other = (s: typeof before) => s.elements.filter((e) => e.id !== 'title').map((e) => [e.id, e.x, e.y])
    expect(other(moved)).toEqual(other(before))
    // a tweak saved for another layout does nothing here
    const elsewhere = scene(slide({ tweaks: { 'some-other-layout': { bt: { dx: 3 } } } }))
    expect(elsewhere.elements.find((e) => e.id === 'title')!.x).toBeCloseTo(t0.x)
  })

  it('hides a block and scales one with its text re-fitted', () => {
    const s = slide({ tweaks: { [layout]: { bt: { hidden: true }, bb: { sx: 0.5, sy: 0.5 } } } })
    expect(els(s, 'bt')).toHaveLength(0)
    const big = els(slide(), 'bb').find((e): e is TextEl => e.kind === 'text')!
    const small = els(s, 'bb').find((e): e is TextEl => e.kind === 'text')!
    expect(small.w).toBeCloseTo(big.w / 2)
    expect(small.size).toBeLessThan(big.size)
  })

  it('retarget gives the tweak that lands a group on the target box', () => {
    const base: El[] = [
      { kind: 'shape', id: 'a', shape: 'rect', x: 1, y: 1, w: 2, h: 1 },
      { kind: 'shape', id: 'b', shape: 'rect', x: 2, y: 2, w: 2, h: 1 }
    ]
    const t = { dx: 0.5, sx: 1.5 }
    const shown = transformGroup(base, t)
    const sb = { x: Math.min(...shown.map((e) => e.x)), y: 1, w: 0, h: 0 }
    sb.w = Math.max(...shown.map((e) => e.x + e.w)) - sb.x
    sb.h = 2
    const target = { x: 4, y: 3, w: 3, h: 4 }
    const out = transformGroup(base, retarget(t, sb, target))
    expect(Math.min(...out.map((e) => e.x))).toBeCloseTo(4)
    expect(Math.min(...out.map((e) => e.y))).toBeCloseTo(3)
    expect(Math.max(...out.map((e) => e.x + e.w))).toBeCloseTo(7)
    expect(Math.max(...out.map((e) => e.y + e.h))).toBeCloseTo(7)
  })

  it('drops identity tweaks and empty maps', () => {
    let s = setTweak(slide(), 'L', 'bt', { dx: 1 })
    expect(s.tweaks).toEqual({ L: { bt: { dx: 1 } } })
    s = setTweak(s, 'L', 'bt', { dx: 0, sx: 1 })
    expect(s.tweaks).toBeUndefined()
    expect(clearTweaks(setTweak(slide(), 'L', 'bt', { hidden: true }), 'L').tweaks).toBeUndefined()
  })
})

describe('free items', () => {
  it('draws text, shapes and arrows on top of the layout, on-theme', () => {
    const s = slide({
      extras: [
        { id: 'f1', kind: 'text', x: 1, y: 1, w: 3, h: 0.8, text: 'Note', color: 'accent' },
        { id: 'f2', kind: 'rect', x: 2, y: 2, w: 1, h: 1, filled: true },
        { id: 'f3', kind: 'arrow', x: 5, y: 5, w: -2, h: 0 }
      ]
    })
    const sc = scene(s)
    const last = sc.elements.slice(-3)
    expect(last.map((e) => e.id)).toEqual(['free-f1', 'free-f2', 'free-f3'])
    expect((last[0] as TextEl).paras[0].runs[0].text).toBe('Note')
    expect((last[1] as ShapeEl).fill).toBeDefined()
    expect((last[2] as ShapeEl).arrow).toEqual({ end: true })
    expect(last[2]).toMatchObject({ x: 5, w: -2 })
  })

  it('applyFreeform is a no-op without tweaks or extras', () => {
    const ctx = { theme: {} as never, slide: slide(), index: 0, total: 1, m: heuristicMeasurer, els: [] as El[] }
    applyFreeform(ctx, 'x')
    expect(ctx.els).toEqual([])
  })
})
