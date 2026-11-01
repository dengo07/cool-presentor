import { describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { contrast } from '../src/core/color'
import { customizeTheme, getTheme, THEMES } from '../src/core/themes'
import { buildDeck } from '../src/core/layout/engine'
import { heuristicMeasurer } from '../src/core/measure'
import { exportPptx } from '../src/core/export/pptx'
import { Deck } from '../src/core/model'
import { sampleDeck } from '../src/core/sample'

describe('theme customisation', () => {
  it('is a no-op without customisations', () => {
    const t = getTheme('aurora')
    expect(customizeTheme(t, undefined)).toBe(t)
    expect(customizeTheme(t, {})).toBe(t)
  })

  it('recolours accents everywhere they are used', () => {
    const t = customizeTheme(getTheme('neon'), { accents: ['009C3B', 'FFDF00', '002776'] })
    expect(t.accents).toEqual(['009C3B', 'FFDF00', '002776'])
    expect(t.highlight).toEqual({ kind: 'solid', color: '009C3B' })
    expect(t.card.line?.color).toBe('009C3B') // neon card outline followed accent 1
    expect(t.chartColors.slice(0, 3)).toEqual(['009C3B', 'FFDF00', '002776'])
    expect(contrast(t.onAccent, t.accents[0])).toBeGreaterThanOrEqual(4.5)
  })

  it('keeps text readable when only the background changes', () => {
    for (const base of THEMES) {
      for (const bg of ['FFFFFF', '0A0A0A', '1D4E89', 'F4F1EA']) {
        const t = customizeTheme(base, { bg })
        expect(contrast(t.text, bg), `${base.id} on ${bg}`).toBeGreaterThanOrEqual(4.5)
        expect(t.bgColor).toBe(bg)
      }
    }
  })

  it('does not turn neutral accents (= text colour) into the new accent', () => {
    const t = customizeTheme(getTheme('swiss'), { accents: ['0047FF', 'FF00AA', '00AA55'] })
    expect(t.text).toBe('111111')
  })

  it('swaps fonts, radius and decorations; drops bold for fonts without a bold face', () => {
    const t = customizeTheme(getTheme('aurora'), { headingFont: 'Instrument Serif', headingBold: true, bodyFont: 'Manrope', radius: 0, deco: 'none' })
    expect(t.heading.font).toBe('Instrument Serif')
    expect(t.heading.bold).toBe(false)
    expect(t.body.font).toBe('Manrope')
    expect(t.radius).toBe(0)
    expect(t.deco).toBe('none')
  })

  it('survives the deck schema and exports with the custom colours', async () => {
    const deck = Deck.parse({ ...sampleDeck(), custom: { bg: '0A2540', bgGradient: true, accents: ['FF7A59', 'FFD166', '06D6A0'], headingFont: 'Sora' } })
    const scenes = buildDeck(deck, heuristicMeasurer)
    const title = scenes[0].elements.find((e) => e.id === 'title')
    expect(title && title.kind === 'text' && title.font).toBe('Sora')
    const bytes = await exportPptx(deck, scenes, { rasterizeIcon: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
    const xml = await (await JSZip.loadAsync(bytes)).file('ppt/slides/slide1.xml')!.async('string')
    expect(xml).toContain('FF7A59')
    expect(xml).toContain('0A2540')
  })
})

describe('ensureContrast', async () => {
  const { ensureContrast } = await import('../src/core/color')
  it('darkens light accents on light backgrounds and lightens on dark ones', () => {
    expect(contrast(ensureContrast('2498F5', 'F4F1EA'), 'F4F1EA')).toBeGreaterThanOrEqual(3)
    expect(contrast(ensureContrast('1D3557', '0B1020'), '0B1020')).toBeGreaterThanOrEqual(3)
    expect(ensureContrast('0E6B4A', 'FFFFFF')).toBe('0E6B4A') // already fine → unchanged
  })
})
