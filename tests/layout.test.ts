import { describe, expect, it } from 'vitest'
import { DOMParser } from '@xmldom/xmldom'
import { buildDeck, candidates, resolveLayouts } from '../src/core/layout/engine'
import { heuristicMeasurer, measureParas } from '../src/core/measure'
import { newBlock, newSlide } from '../src/core/model'
import { sampleDeck } from '../src/core/sample'
import { SLIDE_H, SLIDE_W } from '../src/core/scene'
import { THEMES } from '../src/core/themes'
import { gradientXml, patchSlideXml, transitionXml, mergeBoldFonts } from '../src/core/export/postprocess'

describe('auto layout', () => {
  it('picks a layout that accepts each slide, and varies consecutive layouts', () => {
    const deck = sampleDeck()
    const layouts = resolveLayouts(deck)
    deck.slides.forEach((s, i) => {
      expect(candidates(s, i, deck.slides.length).map((c) => c.id)).toContain(layouts[i])
    })
    expect(layouts[0]).toBe('hero')
    expect(layouts[3]).toBe('stats')
    expect(layouts[4]).toBe('chart-takeaway')
  })

  it('honours a pinned layout and falls back when it no longer fits', () => {
    const deck = sampleDeck()
    deck.slides[2].layout = 'split'
    expect(resolveLayouts(deck)[2]).toBe('split')
    deck.slides[2].layout = 'quote' // not valid for a bullets slide
    expect(resolveLayouts(deck)[2]).not.toBe('quote')
  })

  it('always finds a layout, even for odd content', () => {
    const s = newSlide([newBlock('chart'), newBlock('quote'), newBlock('timeline'), newBlock('stat'), newBlock('image')])
    expect(candidates(s, 1, 3).length).toBeGreaterThan(0)
  })
})

describe('scenes', () => {
  for (const theme of THEMES) {
    it(`keeps text inside its boxes and on the slide (${theme.id})`, () => {
      const deck = { ...sampleDeck(), themeId: theme.id }
      for (const scene of buildDeck(deck, heuristicMeasurer)) {
        const ids = new Set<string>()
        for (const el of scene.elements) {
          expect(ids.has(el.id), `duplicate id ${el.id} on ${scene.layoutId}`).toBe(false)
          ids.add(el.id)
          if (el.kind !== 'text') continue
          expect(el.x).toBeGreaterThanOrEqual(-0.01)
          expect(el.x + el.w).toBeLessThanOrEqual(SLIDE_W + 0.01)
          expect(el.y + el.h).toBeLessThanOrEqual(SLIDE_H + 0.05)
          const m = measureParas(heuristicMeasurer, el.paras, el, el.size, el.w)
          expect(m.height, `${scene.layoutId}/${el.id} overflows`).toBeLessThanOrEqual(el.h + 0.15)
        }
        // morph anchors present on every slide
        for (const d of theme.deco === 'none' ? ['bg'] : ['bg', 'deco-0', 'deco-1', 'deco-2']) expect(ids.has(d)).toBe(true)
      }
    })
  }
})

describe('xml post-processing', () => {
  const parse = (xml: string): void => {
    const errors: string[] = []
    new DOMParser({ onError: (level: string, msg: string) => void errors.push(`${level}: ${msg}`) }).parseFromString(xml, 'text/xml')
    expect(errors).toEqual([])
  }
  const slide =
    '<p:sld xmlns:a="a" xmlns:r="r" xmlns:p="p"><p:cSld><p:spTree>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="2" name="!!bg"></p:cNvPr></p:nvSpPr><p:spPr><a:prstGeom prst="rect"><a:avLst></a:avLst></a:prstGeom><a:solidFill><a:srgbClr val="1F0001"/></a:solidFill></p:spPr></p:sp>' +
    '<p:sp><p:nvSpPr><p:cNvPr id="3" name="!!b"></p:cNvPr></p:nvSpPr><p:txBody><a:p><a:pPr algn="l"><a:buSzPct val="100000"/></a:pPr><a:r><a:t>x</a:t></a:r><a:pPr algn="l"></a:pPr><a:r><a:t>y</a:t></a:r></a:p></p:txBody></p:sp>' +
    '<p:pic><p:nvPicPr><p:cNvPr id="4" name="!!img"></p:cNvPr></p:nvPicPr><p:spPr><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>' +
    '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'

  it('patches gradients, bullets, rounded images, paragraph props and morph', () => {
    const out = patchSlideXml(
      slide,
      { transition: 'morph', imageRadius: { '!!img': 12000 }, bulletColor: { '!!b': 'FF0000' } },
      new Map([['1F0001', { kind: 'linear', angle: 90, stops: [{ pos: 0, color: '000000' }, { pos: 100, color: 'FFFFFF', alpha: 0.5 }] }]])
    )
    parse(out)
    expect(out).toContain('<a:gradFill')
    expect(out).toContain('<a:lin ang="5400000"')
    expect(out).not.toContain('1F0001')
    expect(out).toContain('<a:buClr><a:srgbClr val="FF0000"/></a:buClr>')
    expect(out).toContain('prst="roundRect"')
    expect(out.match(/<a:pPr/g)?.length).toBe(1)
    expect(out).toMatch(/<\/p:clrMapOvr><mc:AlternateContent.*p159:morph.*<\/mc:AlternateContent><\/p:sld>$/)
  })

  it('emits well-formed snippets', () => {
    parse(`<r xmlns:a="a" xmlns:p="p">${transitionXml('morph')}${transitionXml('fade')}</r>`)
    parse(`<r xmlns:a="a">${gradientXml({ kind: 'radial', stops: [{ pos: 0, color: 'FFFFFF', alpha: 0.4 }] })}</r>`)
  })

  it('folds embedded bold faces into their family', () => {
    const pres =
      '<p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter"/><p:regular r:id="rId1"/></p:embeddedFont>' +
      '<p:embeddedFont><p:font typeface="Inter__bold"/><p:regular r:id="rId2"/></p:embeddedFont></p:embeddedFontLst>'
    expect(mergeBoldFonts(pres)).toBe(
      '<p:embeddedFontLst><p:embeddedFont><p:font typeface="Inter"/><p:regular r:id="rId1"/><p:bold r:id="rId2"/></p:embeddedFont></p:embeddedFontLst>'
    )
  })
})

describe('text fitting', () => {
  it('shrinks text instead of letting a long word break mid-word', async () => {
    const { fitSize } = await import('../src/core/measure')
    const style = { font: 'Inter', bold: false, lineHeight: 1.1 }
    const paras = [{ runs: [{ text: 'Portuguese arrive' }] }]
    const wordW = heuristicMeasurer.width('Portuguese', 'Inter', 22, false) * 1.05
    const r = fitSize(heuristicMeasurer, paras, style, 22, 10, wordW * 0.9, 2)
    expect(r.size).toBeLessThan(22)
    expect(r.overflow).toBe(false)
  })
})
