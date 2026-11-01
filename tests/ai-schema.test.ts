import { describe, expect, it } from 'vitest'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { AiDeck, AiSlide, aiDeckToSlides, aiSlideToBlocks } from '../src/core/ai-schema'
import { Deck } from '../src/core/model'

describe('AI schema', () => {
  it('converts to a structured-output JSON schema', () => {
    const fmt = betaZodOutputFormat(AiDeck) as unknown as { type: string; schema: Record<string, unknown> }
    expect(fmt.type).toBe('json_schema')
    expect(JSON.stringify(fmt.schema)).toContain('"slides"')
  })

  it('turns Claude output into valid deck slides', () => {
    const slide: AiSlide = {
      eyebrow: 'Intro',
      title: 'Hello *world*',
      subtitle: null,
      text: null,
      bullets: null,
      stats: [{ value: '42%', label: 'growth' }],
      quote: null,
      chart: null,
      timeline: null,
      features: [{ icon: 'NotARealIcon', title: 'Fast', text: null }],
      comparison: null,
      wantsImage: true,
      notes: 'Say hi'
    }
    const slides = aiDeckToSlides({ title: 'T', slides: [slide] })
    const deck = Deck.parse({ version: 1, title: 'T', themeId: 'aurora', slides })
    const types = deck.slides[0].blocks.map((b) => b.type)
    expect(types).toEqual(['eyebrow', 'title', 'stat', 'features', 'image'])
    const feat = deck.slides[0].blocks.find((b) => b.type === 'features')
    expect(feat && feat.type === 'features' && feat.items[0].icon).toBe('Sparkles')
    expect(deck.slides[0].notes).toBe('Say hi')
    // existing images are kept when a slide is rewritten
    const kept = aiSlideToBlocks({ ...slide, wantsImage: false }, [{ id: 'img', type: 'image', src: 'data:x', width: 1, height: 1 }])
    expect(kept.some((b) => b.id === 'img')).toBe(true)
  })
})
