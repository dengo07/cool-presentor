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
      kind: z.enum(['column', 'bar', 'line', 'area', 'pie', 'donut']),
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
  wantsImage: z.boolean().describe('True only if a photo would clearly make this slide stronger (the user adds it later). Use on at most 2-3 slides per deck.'),
  notes: z.string().describe('Speaker notes: 2-4 natural sentences')
})

export const AiDeck = z.object({
  title: z.string(),
  slides: z.array(AiSlide)
})

export const AiNotes = z.object({ notes: z.array(z.string()) })
export const AiText = z.object({ text: z.string() })

export type AiSlide = z.infer<typeof AiSlide>
export type AiDeck = z.infer<typeof AiDeck>

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
