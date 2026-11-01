import { describe, expect, it } from 'vitest'
import { mkdirSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import { sampleDeck } from '../src/core/sample'
import { buildDeck } from '../src/core/layout/engine'
import { heuristicMeasurer } from '../src/core/measure'
import { exportPptx } from '../src/core/export/pptx'
import { THEMES } from '../src/core/themes'
import { gradientPng, nodeFontLoader } from './helpers/node'

// A tiny 1x1 PNG so Node doesn't need a canvas to rasterise icons.
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

describe('sample export', () => {
  for (const theme of THEMES) {
    it(`exports a valid pptx for theme ${theme.id}`, async () => {
      const deck = sampleDeck()
      deck.themeId = theme.id
      for (const s of deck.slides) for (const b of s.blocks) if (b.type === 'image') b.src = gradientPng(400, 300)
      const scenes = buildDeck(deck, heuristicMeasurer)
      const bytes = await exportPptx(deck, scenes, { loadFont: nodeFontLoader, rasterizeIcon: async () => PIXEL })
      mkdirSync('tests/output', { recursive: true })
      writeFileSync(`tests/output/sample-${theme.id}.pptx`, bytes)

      const zip = await JSZip.loadAsync(bytes)
      const slides = Object.keys(zip.files).filter((f) => /^ppt\/slides\/slide\d+\.xml$/.test(f))
      expect(slides.length).toBe(deck.slides.length)
      for (const f of slides) {
        const xml = await zip.file(f)!.async('string')
        expect(xml).toContain('p159:morph')
        expect(xml).not.toMatch(/val="1F[0-9A-F]{4}"/) // all gradient sentinels replaced
        for (const para of xml.match(/<a:p>[\s\S]*?<\/a:p>/g) ?? []) expect(para.match(/<a:pPr\b/g)?.length ?? 0).toBeLessThanOrEqual(1)
        expect(xml).toContain('name="!!') // morph names present
      }
      const pres = await zip.file('ppt/presentation.xml')!.async('string')
      expect(pres).toContain('<p:embeddedFontLst>')
      expect(pres).not.toContain('__bold')
    })
  }
})
