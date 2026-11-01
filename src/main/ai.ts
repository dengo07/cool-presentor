import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import type { z } from 'zod'
import { AiDeck, AiNotes, AiSlide, AiText, SUGGESTED_ICONS } from '../core/ai-schema'

// Claude Opus 5.5. Server-side fallbacks ("default") let the API re-route a
// request automatically if the primary model declines it.
const MODEL = 'claude-opus-5-5'

const SYSTEM = `You are a world-class presentation designer and storyteller working inside "Cool Presentor", an app that turns content into beautifully designed slides automatically.

You only write CONTENT; the app handles all layout and visual design. Your job is to make each slide punchy, scannable and visually varied.

Rules:
- Titles: short and vivid (max ~8 words). Wrap exactly ONE key word or short phrase in *asterisks* to highlight it in the accent colour.
- Use **double asterisks** sparingly for bold emphasis in body text.
- Bullets: 2-6 items, each max ~8 words. Never write paragraphs in bullets.
- Prefer visual structures over bullets whenever the content allows: stats (big numbers), charts, timelines, feature grids (with icons), comparisons, quotes.
- One idea per slide. Vary slide types across the deck so it never feels repetitive.
- Start with a strong title slide (eyebrow + title + subtitle) and end with a memorable closing slide.
- Section divider slides (eyebrow + title only) help longer decks breathe.
- Only use numbers the user provided or clearly illustrative round numbers; if a number is illustrative, say so in the speaker notes.
- Feature icons must be lucide icon names in PascalCase, ideally one of: ${SUGGESTED_ICONS.join(', ')}.
- Set every field you do not use to null.`

let apiKey: string | undefined

export function setApiKey(key: string | undefined): void {
  apiKey = key || undefined
}

function client(): Anthropic {
  // Without an explicit key the SDK falls back to ANTHROPIC_API_KEY / `ant auth login`.
  return apiKey ? new Anthropic({ apiKey }) : new Anthropic()
}

async function ask<T extends z.ZodType>(schema: T, user: string, effort: 'low' | 'medium' | 'high', maxTokens = 16000): Promise<z.infer<T>> {
  const res = await client().beta.messages.parse({
    model: MODEL,
    max_tokens: maxTokens,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: SYSTEM,
    output_config: { effort, format: betaZodOutputFormat(schema) },
    messages: [{ role: 'user', content: user }]
  })
  if (res.stop_reason === 'refusal') throw new Error('Claude declined this request. Try rephrasing it.')
  if (res.stop_reason === 'max_tokens') throw new Error('The response was too long. Try asking for fewer slides.')
  if (!res.parsed_output) throw new Error('Claude returned an unexpected response. Please try again.')
  return res.parsed_output as z.infer<T>
}

export function friendlyError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) return 'Invalid API key. Add a valid Anthropic API key in Settings.'
  if (e instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and try again.'
  if (e instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API. Check your connection.'
  if (e instanceof Anthropic.APIError) return `API error ${e.status}: ${e.message}`
  if (e instanceof Error) {
    if (/api key|apiKey|authentication/i.test(e.message)) return 'No Anthropic API key found. Add one in Settings.'
    return e.message
  }
  return String(e)
}

export async function generateDeck(prompt: string, slideCount: number): Promise<AiDeck> {
  return ask(
    AiDeck,
    `Create a presentation of about ${slideCount} slides.\n\nBrief from the user:\n"""\n${prompt}\n"""`,
    'medium',
    32000
  )
}

export async function improveSlide(slideJson: string, instruction: string, deckTitle: string): Promise<AiSlide> {
  return ask(
    AiSlide,
    `Deck: "${deckTitle}".\nHere is one slide's current content as JSON blocks:\n${slideJson}\n\nRewrite this slide: ${instruction}\nKeep the meaning; respond with the improved slide.`,
    'low'
  )
}

export async function speakerNotes(outline: string): Promise<string[]> {
  const r = await ask(
    AiNotes,
    `Write speaker notes for every slide of this deck (same order, one entry per slide). Conversational, 2-4 sentences each, adding context that is NOT on the slide.\n\n${outline}`,
    'low'
  )
  return r.notes
}

export async function rewriteText(text: string, instruction: string): Promise<string> {
  const r = await ask(AiText, `Rewrite this slide text (${instruction}). Keep any *highlight* markup style.\n\n"""${text}"""`, 'low', 4000)
  return r.text
}
