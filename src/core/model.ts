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
export const ChartKind = z.enum(['column', 'bar', 'stacked-column', 'stacked-bar', 'line', 'area', 'pie', 'donut', 'radar'])
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
/** Project schedule. Dates are ISO (YYYY-MM-DD); start === end is a milestone. */
export const GanttBlock = z.object({
  id,
  type: z.literal('gantt'),
  tasks: z.array(
    z.object({
      name: z.string(),
      start: z.string(),
      end: z.string(),
      group: z.string().optional(), // colour-coded workstream
      progress: z.number().min(0).max(100).optional()
    })
  )
})
/** Stages that narrow down, e.g. a sales or hiring funnel. */
export const FunnelBlock = z.object({
  id,
  type: z.literal('funnel'),
  stages: z.array(z.object({ label: z.string(), value: z.number() })),
  unit: z.string().optional()
})
/**
 * Boxes-and-arrows diagram (architecture, flow, state machine…). The app lays
 * it out on a grid; `row`/`col` pin a node, otherwise it is placed by the
 * arrows. Nodes sharing a `group` get a labelled container.
 */
export const DiagramNode = z.object({
  id: z.string(),
  label: z.string(),
  text: z.string().optional(),
  group: z.string().optional(),
  style: z.enum(['default', 'accent', 'dark', 'muted', 'alert']).optional(),
  shape: z.enum(['box', 'pill', 'circle', 'diamond']).optional(),
  row: z.number().int().min(0).optional(),
  col: z.number().int().min(0).optional()
})
export const DiagramEdge = z.object({
  from: z.string(),
  to: z.string(),
  label: z.string().optional(),
  style: z.enum(['solid', 'dashed', 'bold']).optional(),
  both: z.boolean().optional() // arrowheads on both ends
})
export const DiagramBlock = z.object({
  id,
  type: z.literal('diagram'),
  direction: z.enum(['right', 'down']).optional(),
  nodes: z.array(DiagramNode),
  edges: z.array(DiagramEdge)
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
  ComparisonBlock,
  GanttBlock,
  FunnelBlock,
  DiagramBlock
])

export const Transition = z.enum(['morph', 'fade', 'none'])

/**
 * Free editing. A tweak nudges one block away from where its layout put it:
 * offset (dx, dy in inches), scale (sx, sy) of the block's box, or hidden.
 * Tweaks are stored per layout, so they never fight the auto-layout: another
 * layout starts clean, and switching back restores them.
 */
export const Tweak = z.object({
  dx: z.number().optional(),
  dy: z.number().optional(),
  sx: z.number().positive().optional(),
  sy: z.number().positive().optional(),
  hidden: z.boolean().optional()
})

/** Theme colour of a free item – stays on-theme when the theme changes. */
export const FreeColor = z.enum(['text', 'muted', 'accent', 'accent2', 'accent3', 'alert'])

/** A free item drawn on top of the layout at a fixed position (inches). */
export const FreeItem = z.object({
  id: z.string(),
  kind: z.enum(['text', 'rect', 'ellipse', 'arrow']),
  x: z.number(),
  y: z.number(),
  w: z.number(), // arrows run from (x, y) to (x + w, y + h); w/h may be negative
  h: z.number(),
  text: z.string().optional(),
  color: FreeColor.optional(),
  filled: z.boolean().optional(), // shapes: solid instead of outline
  size: z.number().optional() // text: largest font size in pt
})

export const Slide = z.object({
  id,
  layout: z.string().default('auto'),
  blocks: z.array(Block),
  notes: z.string().default(''),
  transition: Transition.default('morph'),
  /** layout id → block id → tweak */
  tweaks: z.record(z.string(), z.record(z.string(), Tweak)).optional(),
  extras: z.array(FreeItem).optional()
})

const hex = z.string().regex(/^[0-9A-Fa-f]{6}$/)

/** Per-deck tweaks on top of the chosen theme. Everything optional. */
export const ThemeCustom = z.object({
  bg: hex.optional(),
  bgGradient: z.boolean().optional(),
  text: hex.optional(),
  accents: z.tuple([hex, hex, hex]).optional(),
  headingFont: z.string().optional(),
  headingBold: z.boolean().optional(),
  bodyFont: z.string().optional(),
  radius: z.number().min(0).max(0.6).optional(),
  deco: z.enum(['aurora', 'orbs', 'grid', 'lines', 'blocks', 'none']).optional()
})

/**
 * The AI assistant's memory for one deck: the conversation, durable facts it
 * chose to remember and the source documents the user attached. Stored inside
 * the .cpres file, so every deck has its own memory.
 */
export const AssistantTurn = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  at: z.string(), // ISO time
  changes: z.array(z.string()).optional() // what the assistant changed in the deck
})
export const AssistantDoc = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(['pdf', 'docx', 'pptx', 'text']),
  pages: z.number().optional(),
  text: z.string()
})
export const Assistant = z.object({
  history: z.array(AssistantTurn).default([]),
  memory: z.array(z.string()).default([]),
  docs: z.array(AssistantDoc).default([])
})

export const Deck = z.object({
  version: z.literal(1),
  title: z.string(),
  themeId: z.string(),
  custom: ThemeCustom.optional(),
  slides: z.array(Slide),
  assistant: Assistant.optional()
})

export type Block = z.infer<typeof Block>
export type BlockType = Block['type']
export type Slide = z.infer<typeof Slide>
export type Deck = z.infer<typeof Deck>
export type ChartKind = z.infer<typeof ChartKind>
export type Transition = z.infer<typeof Transition>
export type ThemeCustom = z.infer<typeof ThemeCustom>
export type Assistant = z.infer<typeof Assistant>
export type AssistantTurn = z.infer<typeof AssistantTurn>
export type AssistantDoc = z.infer<typeof AssistantDoc>
export type Tweak = z.infer<typeof Tweak>
export type FreeItem = z.infer<typeof FreeItem>
export type FreeColor = z.infer<typeof FreeColor>
export type DiagramNode = z.infer<typeof DiagramNode>
export type DiagramEdge = z.infer<typeof DiagramEdge>
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
  comparison: 'Comparison',
  gantt: 'Gantt chart',
  funnel: 'Funnel',
  diagram: 'Diagram'
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
    case 'gantt':
      return {
        id: bid,
        type,
        tasks: [
          { name: 'Research', start: '2026-01-05', end: '2026-02-13', group: 'Discovery', progress: 100 },
          { name: 'Design', start: '2026-02-02', end: '2026-03-20', group: 'Build', progress: 60 },
          { name: 'Development', start: '2026-03-02', end: '2026-05-15', group: 'Build', progress: 20 },
          { name: 'Testing', start: '2026-05-04', end: '2026-06-05', group: 'Launch' },
          { name: 'Launch', start: '2026-06-08', end: '2026-06-08', group: 'Launch' }
        ]
      }
    case 'funnel':
      return {
        id: bid,
        type,
        stages: [
          { label: 'Visitors', value: 12000 },
          { label: 'Sign-ups', value: 3400 },
          { label: 'Trials', value: 1100 },
          { label: 'Customers', value: 380 }
        ]
      }
    case 'diagram':
      return {
        id: bid,
        type,
        direction: 'right',
        nodes: [
          { id: 'idea', label: 'Idea', text: 'What we want to build' },
          { id: 'build', label: 'Build', text: 'Ship the first version', style: 'accent' },
          { id: 'learn', label: 'Learn', text: 'Measure what users do' }
        ],
        edges: [
          { from: 'idea', to: 'build' },
          { from: 'build', to: 'learn' },
          { from: 'learn', to: 'idea', label: 'iterate', style: 'dashed' }
        ]
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
