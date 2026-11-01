import { describe, expect, it } from 'vitest'
import { deckToOutline, outlineToSlides } from '../src/core/outline'
import { sampleDeck } from '../src/core/sample'

describe('outline mode', () => {
  it('round-trips the sample deck without losing blocks', () => {
    const deck = sampleDeck()
    const text = deckToOutline(deck)
    const slides = outlineToSlides(text, deck)
    expect(slides.length).toBe(deck.slides.length)
    slides.forEach((s, i) => {
      expect(s.blocks.map((b) => b.type)).toEqual(deck.slides[i].blocks.map((b) => b.type))
    })
    expect(deckToOutline({ ...deck, slides })).toBe(text)
  })

  it('parses a fresh outline', () => {
    const deck = sampleDeck()
    const slides = outlineToSlides(
      ['^ Intro', '# Hello *world*', '## sub', '', '# Points', '- a', '- b', '// say hi', '= 42% | answer', '" Be bold — Me', 'plain text'].join('\n'),
      deck
    )
    expect(slides).toHaveLength(2)
    expect(slides[0].blocks.map((b) => b.type)).toEqual(['eyebrow', 'title', 'subtitle'])
    expect(slides[1].blocks.map((b) => b.type)).toEqual(['title', 'bullets', 'stat', 'quote', 'text'])
    expect(slides[1].notes).toBe('say hi')
  })
})
