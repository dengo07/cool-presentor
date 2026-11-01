import { z } from 'zod'

// ---------------------------------------------------------------------------
// Deck model. Users only ever edit *content*; layout + design is derived.
// ---------------------------------------------------------------------------

const id = z.string()

export const TitleBlock = z.object({ id, type: z.literal('title'), text: z.string() })
export const SubtitleBlock = z.object({ id, type: z.literal('subtitle'), text: z.string() })
export const EyebrowBlock = z.object({ id, type: z.literal('eyebrow'), text: z.string() })
export const TextBlock = z.object({ id, type: z.literal('text'), text: z.string() })
export const BulletsBlock = z.object({ id, type: z.literal('bullets'), items: z.array(z.string()) })
export const StatBlock = z.object({
  id,
  type: z.literal('stat'),
  value: z.string(),
  label: z.string(),
  caption: z.string().optional()
})
export const QuoteBlock = z.object({ id, type: z.literal('quote'), text: z.string(), author: z.string().optional() })
export const ImageBlock = z.object({
  id,
  type: z.literal('image'),
  src: z.string(), // data URL
  width: z.number(), // natural pixel size
  height: z.number(),
  alt: z.string().optional(),
  focusX: z.number().optional(), // 0..1 crop focus
  focusY: z.number().optional()
})
export const ChartKind = z.enum(['column', 'bar', 'line', 'area', 'pie', 'donut'])
export const ChartBlock = z.object({
  id,
  type: z.literal('chart'),
  kind: ChartKind,
  categories: z.array(z.string()),
  series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
  unit: z.string().optional()
})
export const TimelineBlock = z.object({
  id,
  type: z.literal('timeline'),
  items: z.array(z.object({ date: z.string(), title: z.string(), text: z.string().optional() }))
})
export const FeaturesBlock = z.object({
  id,
  type: z.literal('features'),
  items: z.array(z.object({ icon: z.string(), title: z.string(), text: z.string().optional() }))
})
export const ComparisonBlock = z.object({
  id,
  type: z.literal('comparison'),
  left: z.object({ title: z.string(), items: z.array(z.string()) }),
  right: z.object({ title: z.string(), items: z.array(z.string()) })
})

export const Block = z.discriminatedUnion('type', [
  TitleBlock,
  SubtitleBlock,
  EyebrowBlock,
  TextBlock,
  BulletsBlock,
  StatBlock,
  QuoteBlock,
  ImageBlock,
  ChartBlock,
  TimelineBlock,
  FeaturesBlock,
  ComparisonBlock
])

export const Transition = z.enum(['morph', 'fade', 'none'])

export const Slide = z.object({
  id,
  layout: z.string().default('auto'),
  blocks: z.array(Block),
  notes: z.string().default(''),
  transition: Transition.default('morph')
})

export const Deck = z.object({
  version: z.literal(1),
  title: z.string(),
  themeId: z.string(),
  slides: z.array(Slide)
})

export type Block = z.infer<typeof Block>
export type BlockType = Block['type']
export type Slide = z.infer<typeof Slide>
export type Deck = z.infer<typeof Deck>
export type ChartKind = z.infer<typeof ChartKind>
export type Transition = z.infer<typeof Transition>
export type BlockOf<T extends BlockType> = Extract<Block, { type: T }>

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let counter = 0
export function uid(prefix = 'x'): string {
  counter = (counter + 1) % 1e6
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export const BLOCK_LABELS: Record<BlockType, string> = {
  title: 'Title',
  subtitle: 'Subtitle',
  eyebrow: 'Eyebrow label',
  text: 'Paragraph',
  bullets: 'Bullet list',
  stat: 'Big number',
  quote: 'Quote',
  image: 'Image',
  chart: 'Chart',
  timeline: 'Timeline',
  features: 'Feature grid',
  comparison: 'Comparison'
}

export function newBlock(type: BlockType): Block {
  const bid = uid('b')
  switch (type) {
    case 'title':
      return { id: bid, type, text: 'A headline that *pops*' }
    case 'subtitle':
      return { id: bid, type, text: 'A supporting line' }
    case 'eyebrow':
      return { id: bid, type, text: 'Chapter one' }
    case 'text':
      return { id: bid, type, text: 'Say one thing, and say it well.' }
    case 'bullets':
      return { id: bid, type, items: ['First point', 'Second point', 'Third point'] }
    case 'stat':
      return { id: bid, type, value: '87%', label: 'of people agree' }
    case 'quote':
      return { id: bid, type, text: 'Simplicity is the ultimate sophistication.', author: 'Leonardo da Vinci' }
    case 'image':
      return { id: bid, type, src: '', width: 1600, height: 1000 }
    case 'chart':
      return {
        id: bid,
        type,
        kind: 'column',
        categories: ['Q1', 'Q2', 'Q3', 'Q4'],
        series: [{ name: 'Revenue', values: [12, 19, 27, 41] }]
      }
    case 'timeline':
      return {
        id: bid,
        type,
        items: [
          { date: '2024', title: 'Idea' },
          { date: '2025', title: 'Launch' },
          { date: '2026', title: 'Scale' }
        ]
      }
    case 'features':
      return {
        id: bid,
        type,
        items: [
          { icon: 'Zap', title: 'Fast', text: 'Built for speed' },
          { icon: 'Shield', title: 'Safe', text: 'Secure by default' },
          { icon: 'Sparkles', title: 'Delightful', text: 'Feels like magic' }
        ]
      }
    case 'comparison':
      return {
        id: bid,
        type,
        left: { title: 'Before', items: ['Slow', 'Manual'] },
        right: { title: 'After', items: ['Instant', 'Automatic'] }
      }
  }
}

export function newSlide(blocks?: Block[]): Slide {
  return {
    id: uid('s'),
    layout: 'auto',
    blocks: blocks ?? [newBlock('title')],
    notes: '',
    transition: 'morph'
  }
}

export function newDeck(themeId = 'aurora'): Deck {
  return { version: 1, title: 'Untitled deck', themeId, slides: [newSlide()] }
}

export function parseDeck(json: unknown): Deck {
  return Deck.parse(json)
}
