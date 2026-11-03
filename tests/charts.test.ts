import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { contrast, extendPalette } from '../src/core/color'
import { buildDeck } from '../src/core/layout/engine'
import { ganttTicks } from '../src/core/layout/blocks'
import { heuristicMeasurer, measureParas } from '../src/core/measure'
import { type Deck, newBlock, newSlide, type Block } from '../src/core/model'
import { exportPptx } from '../src/core/export/pptx'
import { THEMES } from '../src/core/themes'
import type { ChartEl } from '../src/core/scene'

const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
const cats = ['Rent', 'Food', 'Transport', 'Fun', 'Savings', 'Health', 'Gifts', 'Phone', 'Books', 'Travel', 'Pets', 'Other']

function chartDeck(themeId: string): Deck {
  const chart = (kind: string, series = 1): Block =>
    ({
      ...newBlock('chart'),
      kind,
      categories: cats.slice(0, kind === 'radar' ? 6 : kind === 'pie' || kind === 'donut' ? 12 : 4),
      series: Array.from({ length: series }, (_, k) => ({ name: `S${k + 1}`, values: cats.map((_, i) => 10 + ((i * 7 + k * 5) % 23)) }))
    }) as Block
  const slides = [
    newSlide([{ ...newBlock('title'), text: 'Where the money goes' } as Block, chart('pie')]),
    newSlide([{ ...newBlock('title'), text: 'Donut' } as Block, chart('donut')]),
    newSlide([{ ...newBlock('title'), text: 'Stacked' } as Block, chart('stacked-column', 3)]),
    newSlide([{ ...newBlock('title'), text: 'Stacked bar' } as Block, chart('stacked-bar', 3)]),
    newSlide([{ ...newBlock('title'), text: 'Skills' } as Block, chart('radar', 2)]),
    newSlide([{ ...newBlock('title'), text: 'Project plan' } as Block, newBlock('gantt')]),
    newSlide([{ ...newBlock('title'), text: 'Conversion' } as Block, newBlock('funnel')]),
    newSlide([{ ...newBlock('title'), text: 'Conversion' } as Block, newBlock('funnel'), { ...newBlock('text'), text: 'Only **3%** of visitors become customers.' } as Block])
  ]
  return { version: 1, title: 'Charts', themeId, slides }
}

describe('chart colours', () => {
  for (const t of THEMES) {
    it(`gives every slice its own visible colour (${t.id})`, () => {
      const p = extendPalette(t.chartColors, 12, t.bgColor)
      expect(p).toHaveLength(12)
      expect(new Set(p).size).toBe(12)
      for (const c of p) expect(contrast(c, t.bgColor), c).toBeGreaterThanOrEqual(1.25)
    })
  }

  it('pie slices are all distinct and their labels are readable', () => {
    for (const t of THEMES) {
      const pie = buildDeck(chartDeck(t.id), heuristicMeasurer)[0].elements.find((e) => e.kind === 'chart') as ChartEl
      expect(pie.colors).toHaveLength(12)
      expect(new Set(pie.colors).size).toBe(12)
      for (const c of pie.colors) expect(contrast(c, pie.labelColor!), `${t.id} ${c}`).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('gantt', () => {
  it('picks a readable number of axis ticks for any span', () => {
    const day = 86_400_000
    const start = Date.UTC(2026, 0, 5)
    for (const days of [5, 20, 60, 180, 400, 900, 3000]) {
      const ticks = ganttTicks(start, start + days * day)
      expect(ticks.length, `${days} days`).toBeGreaterThanOrEqual(1)
      expect(ticks.length, `${days} days`).toBeLessThanOrEqual(14)
      for (let i = 1; i < ticks.length; i++) expect(ticks[i].at).toBeGreaterThan(ticks[i - 1].at)
    }
  })

  it('draws bars in date order, progress overlays and a milestone diamond', () => {
    const scene = buildDeck(chartDeck('atlas'), heuristicMeasurer)[5]
    expect(scene.layoutId).toBe('gantt')
    const bars = scene.elements.filter((e) => /-bar\d+$/.test(e.id))
    expect(bars).toHaveLength(5)
    expect(bars[0].x).toBeLessThan(bars[2].x)
    expect(bars[4].kind === 'shape' && bars[4].shape).toBe('diamond')
    expect(scene.elements.some((e) => /-done\d+$/.test(e.id))).toBe(true)
  })
})

describe('new chart types', () => {
  for (const t of THEMES) {
    it(`keep text inside its boxes (${t.id})`, () => {
      for (const scene of buildDeck(chartDeck(t.id), heuristicMeasurer)) {
        const ids = new Set<string>()
        for (const el of scene.elements) {
          expect(ids.has(el.id), `duplicate ${el.id}`).toBe(false)
          ids.add(el.id)
          if (!el.id.startsWith('deco')) expect(el.x + el.w, `${scene.layoutId}/${el.id}`).toBeLessThanOrEqual(13.34)
          if (el.kind !== 'text') continue
          const m = measureParas(heuristicMeasurer, el.paras, el, el.size, el.w)
          expect(m.height, `${scene.layoutId}/${el.id}`).toBeLessThanOrEqual(el.h + 0.15)
        }
      }
    })
  }

  it('export as native stacked / radar charts and shape-based gantt', async () => {
    const deck = chartDeck('aurora')
    const zip = await JSZip.loadAsync(await exportPptx(deck, buildDeck(deck, heuristicMeasurer), { rasterizeIcon: async () => PIXEL }))
    const charts = await Promise.all(Object.keys(zip.files).filter((f) => /charts\/chart\d+\.xml$/.test(f)).map((f) => zip.file(f)!.async('string')))
    expect(charts.some((x) => x.includes('<c:radarChart>'))).toBe(true)
    expect(charts.filter((x) => x.includes('<c:grouping val="stacked"/>')).length).toBe(2)
    const pie = charts.find((x) => x.includes('<c:pieChart>'))!
    expect(pie).toContain('<c:legendPos val="r"/>')
    // horizontal bars are reversed so the first category ends up on top, as in the preview
    const bars = charts.find((x) => x.includes('<c:barDir val="bar"/>'))!
    expect(bars.indexOf('>Fun<')).toBeLessThan(bars.indexOf('>Rent<'))
    const gantt = await zip.file('ppt/slides/slide6.xml')!.async('string')
    expect(gantt).toContain('prst="diamond"')
  })
})
