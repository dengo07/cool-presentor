import { z } from 'zod'
import { type Block, newSlide, type Slide, uid } from './model'
import { iconExists } from './icons'

// ---------------------------------------------------------------------------
// The shape Claude fills in. Flat + nullable fields keep structured outputs
// simple; we convert to real blocks afterwards.
// ---------------------------------------------------------------------------

const nstr = z.string().nullable()

export const AiSlide = z.object({
  eyebrow: nstr.describe('Tiny kicker label above the title, 1-3 words, or null'),
  title: nstr.describe('Short punchy headline, max ~8 words. Wrap ONE key word in *asterisks* to highlight it.'),
  subtitle: nstr,
  text: nstr.describe('One short paragraph, or a single bold statement when there is no title'),
  bullets: z.array(z.string()).nullable().describe('2-6 items, each max ~8 words'),
  stats: z.array(z.object({ value: z.string(), label: z.string() })).nullable().describe('1-4 big numbers'),
  quote: z.object({ text: z.string(), author: nstr }).nullable(),
  chart: z
    .object({
      kind: z.enum(['column', 'bar', 'stacked-column', 'stacked-bar', 'line', 'area', 'pie', 'donut', 'radar']),
      categories: z.array(z.string()),
      series: z.array(z.object({ name: z.string(), values: z.array(z.number()) })),
      unit: nstr
    })
    .nullable(),
  timeline: z.array(z.object({ date: z.string(), title: z.string(), text: nstr })).nullable(),
  features: z.array(z.object({ icon: z.string(), title: z.string(), text: nstr })).nullable().describe('2-6 items with lucide icon names'),
  comparison: z
    .object({
      left: z.object({ title: z.string(), items: z.array(z.string()) }),
      right: z.object({ title: z.string(), items: z.array(z.string()) })
    })
    .nullable(),
  gantt: z
    .array(z.object({ name: z.string(), start: z.string(), end: z.string(), group: nstr, progress: z.number().nullable() }))
    .nullable()
    .describe('Project schedule: tasks with ISO dates (YYYY-MM-DD); start = end for a milestone. Use for plans and roadmaps with real dates.'),
  funnel: z
    .array(z.object({ label: z.string(), value: z.number() }))
    .nullable()
    .describe('3-6 narrowing stages with numbers, e.g. visitors → sign-ups → customers'),
  diagram: z
    .object({
      direction: z.enum(['right', 'down']),
      nodes: z.array(
        z.object({
          id: z.string().describe('short identifier, e.g. "pi"'),
          label: z.string(),
          text: nstr.describe('optional one-line detail under the label'),
          group: nstr.describe('nodes with the same group get a labelled container'),
          style: z.enum(['default', 'accent', 'dark', 'muted', 'alert']).nullable().describe('alert = warnings/alarms; accent/dark = emphasis'),
          shape: z.enum(['box', 'pill', 'circle', 'diamond']).nullable().describe('diamond = decision, pill/circle = start/end'),
          col: z.number().int().nullable().describe('optional grid column (0-based) to pin the node'),
          row: z.number().int().nullable().describe('optional grid row (0-based) to pin the node')
        })
      ),
      edges: z.array(
        z.object({
          from: z.string(),
          to: z.string(),
          label: nstr,
          style: z.enum(['solid', 'dashed', 'bold']).nullable(),
          both: z.boolean().nullable().describe('arrowheads on both ends')
        })
      )
    })
    .nullable()
    .describe('Boxes-and-arrows diagram drawn natively: system architecture, process flow, pipeline, state machine, org chart. 3-12 nodes.'),
  wantsImage: z.boolean().describe('True only if a photo would clearly make this slide stronger (the user adds it later). Use on at most 2-3 slides per deck.'),
  notes: z.string().describe('Speaker notes: 2-4 natural sentences')
})

export const AiDeck = z.object({
  title: z.string(),
  slides: z.array(AiSlide)
})

export const AiNotes = z.object({ notes: z.array(z.string()) })

/** One targeted change the assistant wants to make to the deck. */
export const AiOp = z.object({
  op: z
    .enum(['edit_block', 'add_block', 'remove_block', 'replace_slide', 'insert_slide', 'delete_slide', 'move_slide', 'set_notes', 'set_layout', 'set_deck_title'])
    .describe(
      'edit_block: replace one block (keeps its id) · add_block: add a block to slideId (after blockId, or at the end) · remove_block · ' +
        'replace_slide: rewrite slideId from `slide` (images are kept) · insert_slide: new slide from `slide` after afterSlideId (null = first) · ' +
        'delete_slide · move_slide: put slideId after afterSlideId (null = first) · set_notes: speaker notes of slideId = text · ' +
        'set_layout: layout of slideId = text ("auto" or a layout id) · set_deck_title: text'
    ),
  slideId: nstr,
  blockId: nstr,
  afterSlideId: nstr,
  block: nstr.describe('edit_block / add_block: the complete block as a JSON object WITHOUT "id", same shape as in the deck JSON (e.g. {"type":"bullets","items":["…"]})'),
  slide: AiSlide.nullable().describe('replace_slide / insert_slide'),
  text: nstr
})

export const AiAssist = z.object({
  reply: z.string().describe('Short answer to the user, in their language: what you did or your answer to their question'),
  operations: z.array(AiOp).describe('Changes to apply, in order. Empty when the user only asked a question.'),
  remember: z
    .array(z.string())
    .nullable()
    .describe('New lasting facts about this deck or the user worth remembering in future conversations (preferences, decisions, names, dates). Null if none.')
})
export const AiText = z.object({ text: z.string() })

export type AiSlide = z.infer<typeof AiSlide>
export type AiDeck = z.infer<typeof AiDeck>
export type AiOp = z.infer<typeof AiOp>
export type AiAssist = z.infer<typeof AiAssist>

export const SUGGESTED_ICONS = [
  'Zap', 'Shield', 'Sparkles', 'Rocket', 'Target', 'TrendingUp', 'Users', 'Heart', 'Globe', 'Lock', 'Clock', 'Cloud',
  'Cpu', 'Database', 'Layers', 'Lightbulb', 'MessageCircle', 'Palette', 'PieChart', 'Puzzle', 'Search', 'Settings',
  'Smile', 'Star', 'ThumbsUp', 'Trophy', 'Wand2', 'Wallet', 'Leaf', 'Brain', 'Code', 'Compass', 'Gauge', 'Gift',
  'Handshake', 'Infinity', 'Key', 'Map', 'Megaphone', 'Mountain', 'Award', 'BookOpen', 'Briefcase', 'Calendar',
  'Camera', 'ChartColumn', 'CircleCheck', 'Coffee', 'DollarSign', 'Eye', 'Flag', 'Flame', 'GraduationCap', 'Hammer'
]

const icon = (name: string): string => (iconExists(name) ? name : 'Sparkles')

/** Converts Claude's slide description into real blocks. */
export function aiSlideToBlocks(s: AiSlide, keep: Block[] = []): Block[] {
  const out: Block[] = []
  const id = (): string => uid('b')
  if (s.eyebrow) out.push({ id: id(), type: 'eyebrow', text: s.eyebrow })
  if (s.title) out.push({ id: id(), type: 'title', text: s.title })
  if (s.subtitle) out.push({ id: id(), type: 'subtitle', text: s.subtitle })
  if (s.stats?.length) for (const st of s.stats.slice(0, 4)) out.push({ id: id(), type: 'stat', value: st.value, label: st.label })
  if (s.chart && s.chart.categories.length && s.chart.series.length)
    out.push({ id: id(), type: 'chart', kind: s.chart.kind, categories: s.chart.categories, series: s.chart.series, unit: s.chart.unit ?? undefined })
  if (s.timeline?.length)
    out.push({ id: id(), type: 'timeline', items: s.timeline.slice(0, 6).map((t) => ({ date: t.date, title: t.title, text: t.text ?? undefined })) })
  if (s.features?.length)
    out.push({ id: id(), type: 'features', items: s.features.slice(0, 6).map((f) => ({ icon: icon(f.icon), title: f.title, text: f.text ?? undefined })) })
  if (s.gantt?.length)
    out.push({
      id: id(),
      type: 'gantt',
      tasks: s.gantt.slice(0, 12).map((g) => ({
        name: g.name,
        start: g.start,
        end: g.end,
        group: g.group ?? undefined,
        progress: g.progress === null ? undefined : Math.max(0, Math.min(100, g.progress))
      }))
    })
  if (s.funnel?.length) out.push({ id: id(), type: 'funnel', stages: s.funnel.slice(0, 7) })
  if (s.diagram?.nodes.length)
    out.push({
      id: id(),
      type: 'diagram',
      direction: s.diagram.direction,
      nodes: s.diagram.nodes.slice(0, 16).map((n) => ({
        id: n.id,
        label: n.label,
        text: n.text ?? undefined,
        group: n.group ?? undefined,
        style: n.style ?? undefined,
        shape: n.shape ?? undefined,
        col: n.col !== null && n.col >= 0 ? n.col : undefined,
        row: n.row !== null && n.row >= 0 ? n.row : undefined
      })),
      edges: s.diagram.edges.map((e) => ({ from: e.from, to: e.to, label: e.label ?? undefined, style: e.style ?? undefined, both: e.both ?? undefined }))
    })
  if (s.comparison) out.push({ id: id(), type: 'comparison', left: s.comparison.left, right: s.comparison.right })
  if (s.quote) out.push({ id: id(), type: 'quote', text: s.quote.text, author: s.quote.author ?? undefined })
  if (s.text) out.push({ id: id(), type: 'text', text: s.text })
  if (s.bullets?.length) out.push({ id: id(), type: 'bullets', items: s.bullets })
  // keep user images; add an empty image slot if Claude asked for one
  const images = keep.filter((b) => b.type === 'image')
  if (images.length) out.push(...images)
  else if (s.wantsImage) out.push({ id: id(), type: 'image', src: '', width: 1600, height: 1200 })
  if (!out.length) out.push({ id: id(), type: 'title', text: 'Untitled' })
  return out
}

export function aiDeckToSlides(d: AiDeck): Slide[] {
  return d.slides.map((s) => ({ ...newSlide(aiSlideToBlocks(s)), notes: s.notes }))
}

/** Compact, model-friendly description of a slide. */
export function describeSlide(slide: Slide): string {
  return JSON.stringify(
    slide.blocks.map((b) => {
      if (b.type === 'image') return { type: 'image', alt: b.alt ?? '' }
      const { id: _id, ...rest } = b
      return rest
    })
  )
}
