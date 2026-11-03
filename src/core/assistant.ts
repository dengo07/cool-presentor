import { type AiOp, aiSlideToBlocks } from './ai-schema'
import { type Assistant, Block, BLOCK_LABELS, type BlockType, type Deck, newSlide, type Slide, uid } from './model'
import { LAYOUTS } from './layout/layouts'

// ---------------------------------------------------------------------------
// The deck assistant works on the existing deck instead of regenerating it:
// Claude sees the whole deck (with ids) and answers with targeted operations,
// which are applied here. Pure – shared by the renderer and tests.
// ---------------------------------------------------------------------------

export const emptyAssistant = (): Assistant => ({ history: [], memory: [], docs: [] })

/** The deck as compact JSON for the model: ids included, image data left out. */
export function describeDeckForAi(deck: Deck): string {
  return JSON.stringify({
    title: deck.title,
    slides: deck.slides.map((s, i) => ({
      n: i + 1,
      id: s.id,
      ...(s.layout !== 'auto' ? { layout: s.layout } : {}),
      blocks: s.blocks.map((b) => (b.type === 'image' ? { id: b.id, type: 'image', alt: b.alt ?? '', hasImage: !!b.src } : b)),
      ...(s.notes ? { notes: s.notes } : {})
    }))
  })
}

export const LAYOUT_IDS = LAYOUTS.map((l) => l.id)

const HEADER: BlockType[] = ['eyebrow', 'title', 'subtitle']

/** Inserts a block: header blocks go to the top in order, others after `afterId` or at the end. */
function insertBlock(blocks: Block[], b: Block, afterId?: string | null): Block[] {
  const out = [...blocks]
  if (HEADER.includes(b.type)) {
    const idx = out.findIndex((x) => !HEADER.includes(x.type) || HEADER.indexOf(x.type) > HEADER.indexOf(b.type))
    out.splice(idx < 0 ? out.length : idx, 0, b)
    return out
  }
  const at = afterId ? out.findIndex((x) => x.id === afterId) : -1
  out.splice(at < 0 ? out.length : at + 1, 0, b)
  return out
}

function parseBlockJson(json: string | null, keepId: string, original?: Block): { block?: Block; error?: string } {
  if (!json) return { error: 'no block given' }
  let raw: unknown
  try {
    raw = JSON.parse(json)
  } catch {
    return { error: 'block is not valid JSON' }
  }
  if (!raw || typeof raw !== 'object') return { error: 'block is not an object' }
  const obj = { ...(raw as Record<string, unknown>) }
  if (!obj['type'] && original) obj['type'] = original.type
  // images: the model never sees the picture, so keep it
  if (obj['type'] === 'image') {
    const o = original?.type === 'image' ? original : undefined
    obj['src'] = o?.src ?? (typeof obj['src'] === 'string' && obj['src'].startsWith('data:') ? obj['src'] : '')
    obj['width'] = o?.width ?? 1600
    obj['height'] = o?.height ?? 1000
    if (o?.focusX !== undefined && obj['focusX'] === undefined) obj['focusX'] = o.focusX
    if (o?.focusY !== undefined && obj['focusY'] === undefined) obj['focusY'] = o.focusY
  }
  const parsed = Block.safeParse({ ...obj, id: keepId })
  if (!parsed.success) return { error: `invalid ${String(obj['type'] ?? 'block')}: ${parsed.error.issues[0]?.message ?? 'wrong shape'}` }
  return { block: parsed.data }
}

export interface ApplyResult {
  deck: Deck
  /** human-readable list of what changed */
  changes: string[]
  /** operations that could not be applied */
  errors: string[]
  /** index of the slide the user should look at afterwards */
  focus?: number
}

/** Applies the assistant's operations in order. Never throws; bad operations are skipped and reported. */
export function applyOps(deck: Deck, ops: AiOp[]): ApplyResult {
  let slides: Slide[] = [...deck.slides] // untouched slides keep their identity (scene caches)
  let title = deck.title
  const changes: string[] = []
  const errors: string[] = []
  let focus: number | undefined
  const num = (id: string): number => slides.findIndex((s) => s.id === id) + 1
  const slideOf = (op: AiOp): number => {
    if (op.slideId) return slides.findIndex((s) => s.id === op.slideId)
    if (op.blockId) return slides.findIndex((s) => s.blocks.some((b) => b.id === op.blockId))
    return -1
  }
  const touch = (i: number, what: string): void => {
    changes.push(`Slide ${i + 1}: ${what}`)
    focus ??= i
  }

  for (const op of ops) {
    const fail = (why: string): void => void errors.push(`${op.op}: ${why}`)
    switch (op.op) {
      case 'edit_block': {
        const i = slideOf(op)
        const orig = i >= 0 ? slides[i].blocks.find((b) => b.id === op.blockId) : undefined
        if (!orig) {
          fail(`block ${op.blockId} not found`)
          break
        }
        const r = parseBlockJson(op.block, orig.id, orig)
        if (!r.block) {
          fail(r.error!)
          break
        }
        slides[i] = { ...slides[i], blocks: slides[i].blocks.map((b) => (b.id === orig.id ? r.block! : b)) }
        touch(i, `edited ${BLOCK_LABELS[r.block.type].toLowerCase()}`)
        break
      }
      case 'add_block': {
        const i = slideOf({ ...op, blockId: op.slideId ? null : op.blockId })
        if (i < 0) {
          fail(`slide ${op.slideId} not found`)
          break
        }
        const r = parseBlockJson(op.block, uid('b'))
        if (!r.block) {
          fail(r.error!)
          break
        }
        slides[i] = { ...slides[i], blocks: insertBlock(slides[i].blocks, r.block, op.blockId) }
        touch(i, `added ${BLOCK_LABELS[r.block.type].toLowerCase()}`)
        break
      }
      case 'remove_block': {
        const i = slideOf(op)
        const b = i >= 0 ? slides[i].blocks.find((x) => x.id === op.blockId) : undefined
        if (!b) {
          fail(`block ${op.blockId} not found`)
          break
        }
        if (slides[i].blocks.length <= 1) {
          fail('a slide needs at least one block')
          break
        }
        slides[i] = { ...slides[i], blocks: slides[i].blocks.filter((x) => x.id !== b.id) }
        touch(i, `removed ${BLOCK_LABELS[b.type].toLowerCase()}`)
        break
      }
      case 'replace_slide': {
        const i = slideOf({ ...op, blockId: null })
        if (i < 0 || !op.slide) {
          fail(i < 0 ? `slide ${op.slideId} not found` : 'no slide content given')
          break
        }
        const old = slides[i]
        // keep header ids so the change morphs smoothly
        const blocks = aiSlideToBlocks(op.slide, old.blocks).map((b) => {
          const same = HEADER.includes(b.type) ? old.blocks.find((x) => x.type === b.type) : undefined
          return same ? { ...b, id: same.id } : b
        })
        slides[i] = { ...old, blocks, layout: 'auto', notes: op.slide.notes?.trim() ? op.slide.notes : old.notes }
        touch(i, 'rewritten')
        break
      }
      case 'insert_slide': {
        if (!op.slide) {
          fail('no slide content given')
          break
        }
        const at = op.afterSlideId ? num(op.afterSlideId) : 0
        if (op.afterSlideId && at === 0) {
          fail(`slide ${op.afterSlideId} not found`)
          break
        }
        const s: Slide = { ...newSlide(aiSlideToBlocks(op.slide)), notes: op.slide.notes ?? '' }
        slides = [...slides.slice(0, at), s, ...slides.slice(at)]
        touch(at, 'new slide')
        break
      }
      case 'delete_slide': {
        const i = slideOf({ ...op, blockId: null })
        if (i < 0) {
          fail(`slide ${op.slideId} not found`)
          break
        }
        if (slides.length <= 1) {
          fail('cannot delete the last slide')
          break
        }
        changes.push(`Slide ${i + 1}: deleted`)
        slides = slides.filter((_, j) => j !== i)
        break
      }
      case 'move_slide': {
        const i = slideOf({ ...op, blockId: null })
        if (i < 0) {
          fail(`slide ${op.slideId} not found`)
          break
        }
        const [s] = slides.splice(i, 1)
        const at = op.afterSlideId ? slides.findIndex((x) => x.id === op.afterSlideId) + 1 : 0
        if (op.afterSlideId && at === 0) {
          slides.splice(i, 0, s)
          fail(`slide ${op.afterSlideId} not found`)
          break
        }
        slides.splice(at, 0, s)
        changes.push(`Slide ${i + 1} moved to position ${at + 1}`)
        focus ??= at
        break
      }
      case 'set_notes': {
        const i = slideOf(op)
        if (i < 0) {
          fail(`slide ${op.slideId} not found`)
          break
        }
        slides[i] = { ...slides[i], notes: op.text ?? '' }
        touch(i, 'speaker notes')
        break
      }
      case 'set_layout': {
        const i = slideOf(op)
        const layout = op.text ?? 'auto'
        if (i < 0 || (layout !== 'auto' && !LAYOUT_IDS.includes(layout))) {
          fail(i < 0 ? `slide ${op.slideId} not found` : `unknown layout ${layout}`)
          break
        }
        slides[i] = { ...slides[i], layout }
        touch(i, `layout ${layout}`)
        break
      }
      case 'set_deck_title': {
        if (!op.text?.trim()) {
          fail('empty title')
          break
        }
        title = op.text.replace(/\*/g, '').trim()
        changes.push(`Deck title: ${title}`)
        break
      }
    }
  }
  return { deck: { ...deck, title, slides }, changes, errors, focus: focus === undefined ? undefined : Math.min(focus, slides.length - 1) }
}
