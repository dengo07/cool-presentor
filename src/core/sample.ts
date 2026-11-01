import { type Block, type Deck, newBlock, newSlide } from './model'

const b = <T extends Block['type']>(type: T, patch: Partial<Extract<Block, { type: T }>> = {}): Block =>
  ({ ...newBlock(type), ...patch }) as Block

/** Demo deck shown on first launch – exercises every layout family. */
export function sampleDeck(): Deck {
  const slides = [
    newSlide([
      b('eyebrow', { text: 'Introducing Cool Presentor' }),
      b('title', { text: 'Decks that make people say *wow*' }),
      b('subtitle', { text: 'Write the content. Get a designed, animated PowerPoint in seconds.' })
    ]),
    newSlide([b('eyebrow', { text: 'Chapter one' }), b('title', { text: 'The problem with slides' })]),
    newSlide([
      b('title', { text: 'Why most decks *fall flat*' }),
      b('bullets', {
        items: [
          'Hours lost nudging boxes around',
          'Every deck looks like the default template',
          'Animations feel cheap or distracting',
          'Design skills are a bottleneck'
        ]
      })
    ]),
    newSlide([
      b('eyebrow', { text: 'By the numbers' }),
      b('title', { text: 'Time is the real cost' }),
      b('stat', { value: '6h', label: 'average time to build a 20-slide deck' }),
      b('stat', { value: '73%', label: 'of that time spent on formatting' }),
      b('stat', { value: '10×', label: 'faster with content-first design' })
    ]),
    newSlide([
      b('title', { text: 'Adoption is *accelerating*' }),
      b('chart', {
        kind: 'column',
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [{ name: 'Teams', values: [120, 340, 790, 1650] }]
      }),
      b('text', { text: 'Teams that switch **never go back**: usage doubled every quarter this year.' })
    ]),
    newSlide([
      b('title', { text: 'Everything you need, *nothing* you don’t' }),
      b('features', {
        items: [
          { icon: 'Wand2', title: 'Smart layouts', text: 'Content in, design out' },
          { icon: 'Palette', title: 'Curated themes', text: 'Typography that just works' },
          { icon: 'Move3d', title: 'Morph transitions', text: 'Native PowerPoint animation' },
          { icon: 'ChartColumn', title: 'Live charts', text: 'Editable in PowerPoint' },
          { icon: 'Sparkles', title: 'AI assist', text: 'Punch up any slide' },
          { icon: 'FileDown', title: 'Real .pptx', text: 'Fonts embedded' }
        ]
      })
    ]),
    newSlide([
      b('eyebrow', { text: 'Workflow' }),
      b('title', { text: 'Write like a doc. Present like a pro.' }),
      b('bullets', { items: ['Type your story as an outline', 'Pick a theme – or shuffle', 'Export a polished .pptx'] }),
      b('image', { src: '', width: 1600, height: 1200 })
    ]),
    newSlide([
      b('title', { text: 'The road ahead' }),
      b('timeline', {
        items: [
          { date: 'Q1', title: 'Private beta', text: '50 design partners' },
          { date: 'Q2', title: 'Public launch', text: 'Mac, Windows & Linux' },
          { date: 'Q3', title: 'Team spaces', text: 'Shared themes & assets' },
          { date: 'Q4', title: 'Live collab', text: 'Edit together in real time' }
        ]
      })
    ]),
    newSlide([
      b('title', { text: 'Before and after' }),
      b('comparison', {
        left: { title: 'PowerPoint', items: ['Blank canvas anxiety', 'Manual alignment', 'Generic templates'] },
        right: { title: 'Cool Presentor', items: ['Start from your words', 'Auto-layout everything', 'Designer-grade themes'] }
      })
    ]),
    newSlide([
      b('quote', {
        text: 'The audience never saw a bullet point. They saw a *story*.',
        author: 'Early beta user'
      })
    ]),
    newSlide([b('text', { text: 'Good design is *invisible*. Great design is **unforgettable**.' })]),
    newSlide([b('title', { text: 'Thank *you*' }), b('subtitle', { text: 'Questions? Let’s talk.' })])
  ]
  slides[0].notes = 'Welcome everyone. Today I want to show you a different way to build presentations.'
  return { version: 1, title: 'Cool Presentor – Demo', themeId: 'aurora', slides }
}

