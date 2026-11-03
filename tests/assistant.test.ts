import { describe, expect, it } from 'vitest'
import { applyOps, describeDeckForAi } from '../src/core/assistant'
import type { AiOp, AiSlide } from '../src/core/ai-schema'
import { type Deck, parseDeck } from '../src/core/model'

const deck = (): Deck => ({
  version: 1,
  title: 'Demo',
  themeId: 'paper',
  slides: [
    {
      id: 's1',
      layout: 'auto',
      notes: 'intro',
      transition: 'morph',
      blocks: [
        { id: 'b1', type: 'title', text: 'Hello *world*' },
        { id: 'b2', type: 'image', src: 'data:image/png;base64,AAAA', width: 800, height: 600, alt: 'robot' }
      ]
    },
    {
      id: 's2',
      layout: 'auto',
      notes: '',
      transition: 'morph',
      blocks: [
        { id: 'b3', type: 'title', text: 'Specs' },
        { id: 'b4', type: 'bullets', items: ['2.4 GHz', '3.3 V'] }
      ]
    }
  ]
})

const op = (o: Partial<AiOp> & Pick<AiOp, 'op'>): AiOp => ({ slideId: null, blockId: null, afterSlideId: null, block: null, slide: null, text: null, ...o })

const aiSlide = (o: Partial<AiSlide>): AiSlide => ({
  eyebrow: null,
  title: null,
  subtitle: null,
  text: null,
  bullets: null,
  stats: null,
  quote: null,
  chart: null,
  timeline: null,
  features: null,
  comparison: null,
  gantt: null,
  funnel: null,
  diagram: null,
  wantsImage: false,
  notes: '',
  ...o
})

describe('describeDeckForAi', () => {
  it('includes ids and notes but never image data', () => {
    const s = describeDeckForAi(deck())
    expect(s).toContain('"id":"b4"')
    expect(s).toContain('"notes":"intro"')
    expect(s).toContain('"alt":"robot"')
    expect(s).not.toContain('base64')
  })
})

describe('applyOps', () => {
  it('edits one block in place and leaves everything else untouched', () => {
    const d = deck()
    const r = applyOps(d, [op({ op: 'edit_block', blockId: 'b4', block: JSON.stringify({ type: 'bullets', items: ['2,4 GHz', '3,3 V'] }) })])
    expect(r.errors).toEqual([])
    expect(r.deck.slides[1].blocks[1]).toEqual({ id: 'b4', type: 'bullets', items: ['2,4 GHz', '3,3 V'] })
    expect(r.deck.slides[0]).toBe(d.slides[0])
    expect(r.changes).toEqual(['Slide 2: edited bullet list'])
    expect(r.focus).toBe(1)
  })

  it('keeps the picture when the model edits an image block', () => {
    const r = applyOps(deck(), [op({ op: 'edit_block', blockId: 'b2', block: JSON.stringify({ type: 'image', alt: 'tracked robot' }) })])
    expect(r.deck.slides[0].blocks[1]).toMatchObject({ src: 'data:image/png;base64,AAAA', width: 800, alt: 'tracked robot' })
  })

  it('rejects malformed blocks without touching the deck', () => {
    const d = deck()
    const r = applyOps(d, [
      op({ op: 'edit_block', blockId: 'b4', block: '{"type":"bullets","items":"oops"}' }),
      op({ op: 'edit_block', blockId: 'nope', block: '{"type":"title","text":"x"}' }),
      op({ op: 'edit_block', blockId: 'b3', block: 'not json' })
    ])
    expect(r.errors).toHaveLength(3)
    expect(r.changes).toEqual([])
    expect(r.deck.slides).toEqual(d.slides)
  })

  it('adds header blocks at the top and others after a given block', () => {
    const r = applyOps(deck(), [
      op({ op: 'add_block', slideId: 's2', block: '{"type":"eyebrow","text":"Hardware"}' }),
      op({ op: 'add_block', slideId: 's2', blockId: 'b3', block: '{"type":"text","text":"Summary"}' })
    ])
    expect(r.deck.slides[1].blocks.map((b) => b.type)).toEqual(['eyebrow', 'title', 'text', 'bullets'])
  })

  it('replaces a slide keeping its images, title id and notes', () => {
    const r = applyOps(deck(), [
      op({
        op: 'replace_slide',
        slideId: 's1',
        slide: aiSlide({
          title: 'New *title*',
          diagram: {
            direction: 'right',
            nodes: [
              { id: 'a', label: 'A', text: null, group: null, style: null, shape: null, col: null, row: null },
              { id: 'b', label: 'B', text: null, group: null, style: 'alert', shape: null, col: 1, row: null }
            ],
            edges: [{ from: 'a', to: 'b', label: 'go', style: null, both: null }]
          }
        })
      })
    ])
    const blocks = r.deck.slides[0].blocks
    expect(blocks.find((b) => b.type === 'title')).toEqual({ id: 'b1', type: 'title', text: 'New *title*' })
    expect(blocks.find((b) => b.type === 'image')?.id).toBe('b2')
    expect(blocks.find((b) => b.type === 'diagram')).toMatchObject({ nodes: [{ id: 'a' }, { id: 'b', style: 'alert', col: 1 }], edges: [{ label: 'go' }] })
    expect(r.deck.slides[0].notes).toBe('intro')
  })

  it('inserts, moves, deletes slides and sets notes, layout and title', () => {
    const r = applyOps(deck(), [
      op({ op: 'insert_slide', afterSlideId: 's1', slide: aiSlide({ title: 'Middle', notes: 'n' }) }),
      op({ op: 'move_slide', slideId: 's2', afterSlideId: null }),
      op({ op: 'set_notes', slideId: 's1', text: 'hello' }),
      op({ op: 'set_layout', slideId: 's1', text: 'image-left' }),
      op({ op: 'set_layout', slideId: 's1', text: 'no-such-layout' }),
      op({ op: 'set_deck_title', text: '*Final*' }),
      op({ op: 'delete_slide', slideId: 's2' })
    ])
    expect(r.deck.slides.map((s) => s.blocks[0].type === 'title' && s.blocks[0].text)).toEqual(['Hello *world*', 'Middle'])
    expect(r.deck.slides[0]).toMatchObject({ notes: 'hello', layout: 'image-left' })
    expect(r.deck.title).toBe('Final')
    expect(r.errors).toEqual(['set_layout: unknown layout no-such-layout'])
  })

  it('refuses to delete the last slide or its last block', () => {
    const one: Deck = { ...deck(), slides: [deck().slides[1]] }
    const r = applyOps(one, [op({ op: 'delete_slide', slideId: 's2' }), op({ op: 'remove_block', blockId: 'b4' }), op({ op: 'remove_block', blockId: 'b3' })])
    expect(r.deck.slides).toHaveLength(1)
    expect(r.deck.slides[0].blocks).toHaveLength(1)
    expect(r.errors).toHaveLength(2)
  })
})

describe('assistant memory in the file', () => {
  it('round-trips through parseDeck and stays optional', () => {
    const withMemory = {
      ...deck(),
      assistant: { history: [{ role: 'user', text: 'hi', at: '2026-11-04T10:00:00Z' }], memory: ['Deck language is Turkish'], docs: [] }
    }
    expect(parseDeck(JSON.parse(JSON.stringify(withMemory))).assistant?.memory).toEqual(['Deck language is Turkish'])
    expect(parseDeck(JSON.parse(JSON.stringify(deck()))).assistant).toBeUndefined()
  })
})
