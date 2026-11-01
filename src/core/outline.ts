import { type Block, type Deck, newSlide, type Slide, uid } from './model'

// ---------------------------------------------------------------------------
// Outline mode: the whole deck as plain text.
//
//   # Title            starts a new slide (or use --- for a slide without title)
//   ## Subtitle
//   ^ Eyebrow
//   - bullet
//   = 87% | label      big number (stat)
//   " Quote text — Author
//   // speaker notes
//   [[chart b123]]     rich blocks (charts, images…) are kept as references
//   anything else      paragraph
// ---------------------------------------------------------------------------

export const OUTLINE_HELP = `# Title  ·  ## Subtitle  ·  ^ Eyebrow  ·  - Bullet  ·  = 42% | label  ·  " Quote — Author  ·  // notes  ·  --- new slide`

export function deckToOutline(deck: Deck): string {
  return deck.slides.map(slideToOutline).join('\n\n')
}

function slideToOutline(s: Slide, i: number): string {
  const lines: string[] = []
  const hasTitle = s.blocks.some((b) => b.type === 'title')
  if (!hasTitle && i > 0) lines.push('---')
  for (const b of s.blocks) {
    switch (b.type) {
      case 'title':
        lines.push(`# ${b.text}`)
        break
      case 'subtitle':
        lines.push(`## ${b.text}`)
        break
      case 'eyebrow':
        lines.push(`^ ${b.text}`)
        break
      case 'bullets':
        lines.push(...b.items.map((it) => `- ${it}`))
        break
      case 'stat':
        lines.push(`= ${b.value} | ${b.label}${b.caption ? ` | ${b.caption}` : ''}`)
        break
      case 'quote':
        lines.push(`" ${b.text}${b.author ? ` — ${b.author}` : ''}`)
        break
      case 'text':
        lines.push(...b.text.split('\n'))
        break
      default:
        lines.push(`[[${b.type} ${b.id}]]`)
    }
  }
  if (s.notes) lines.push(...s.notes.split('\n').map((n) => `// ${n}`))
  // Title-first ordering keeps eyebrows above titles when re-parsed
  return lines.join('\n')
}

/** Parses outline text back into slides, reusing ids/blocks from the previous deck. */
export function outlineToSlides(text: string, prev: Deck): Slide[] {
  const blockIndex = new Map<string, Block>()
  const slideOfBlock = new Map<string, Slide>()
  for (const s of prev.slides)
    for (const b of s.blocks) {
      blockIndex.set(b.id, b)
      slideOfBlock.set(b.id, s)
    }

  const slides: { blocks: Block[]; notes: string[] }[] = []
  let cur: { blocks: Block[]; notes: string[] } | null = null
  const start = (): { blocks: Block[]; notes: string[] } => {
    cur = { blocks: [], notes: [] }
    slides.push(cur)
    return cur
  }
  const ensure = (): { blocks: Block[]; notes: string[] } => cur ?? start()
  const last = (): Block | undefined => cur?.blocks[cur.blocks.length - 1]

  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const t = line.trim()
    if (!t) {
      continue
    }
    if (t === '---') {
      start()
      continue
    }
    let m: RegExpMatchArray | null
    if ((m = t.match(/^#\s+(.*)$/))) {
      // a title starts a new slide unless the current slide only has an eyebrow so far
      const c = cur as { blocks: Block[] } | null
      const onlyEyebrow = c && c.blocks.length > 0 && c.blocks.every((b) => b.type === 'eyebrow')
      const s = onlyEyebrow ? ensure() : start()
      s.blocks.push({ id: uid('b'), type: 'title', text: m[1] })
    } else if ((m = t.match(/^##\s+(.*)$/))) ensure().blocks.push({ id: uid('b'), type: 'subtitle', text: m[1] })
    else if ((m = t.match(/^\^\s*(.*)$/))) {
      // an eyebrow after content begins a new slide
      const c = cur as { blocks: Block[] } | null
      const s = c && c.blocks.some((b) => b.type !== 'eyebrow') ? start() : ensure()
      s.blocks.push({ id: uid('b'), type: 'eyebrow', text: m[1] })
    } else if ((m = t.match(/^[-*•]\s+(.*)$/))) {
      const l = last()
      if (l?.type === 'bullets') l.items.push(m[1])
      else ensure().blocks.push({ id: uid('b'), type: 'bullets', items: [m[1]] })
    } else if ((m = t.match(/^=\s*(.*)$/))) {
      const [value, label, caption] = m[1].split('|').map((x) => x.trim())
      ensure().blocks.push({ id: uid('b'), type: 'stat', value: value ?? '', label: label ?? '', caption: caption || undefined })
    } else if ((m = t.match(/^["“]\s*(.*)$/))) {
      const [q, author] = m[1].split(/\s+[—–]\s+/)
      ensure().blocks.push({ id: uid('b'), type: 'quote', text: q.replace(/["”]$/, ''), author: author || undefined })
    } else if ((m = t.match(/^\/\/\s?(.*)$/))) ensure().notes.push(m[1])
    else if ((m = t.match(/^\[\[(\w+)\s+([\w-]+)\]\]$/))) {
      const b = blockIndex.get(m[2])
      if (b) ensure().blocks.push(b)
    } else {
      const l = last()
      if (l?.type === 'text') l.text += '\n' + t
      else ensure().blocks.push({ id: uid('b'), type: 'text', text: t })
    }
  }

  // Preserve slide identity/settings where the slide's first rich block or position matches.
  return slides
    .filter((s) => s.blocks.length || s.notes.length)
    .map((s, i) => {
      const anchor = s.blocks.map((b) => slideOfBlock.get(b.id)).find(Boolean) ?? prev.slides[i]
      const base = anchor ?? newSlide([])
      // keep block ids stable for same-type blocks at same position (smooth morph in preview)
      const blocks = s.blocks.map((b, j) => {
        const old = prev.slides[i]?.blocks[j]
        return old && old.type === b.type && !blockIndex.has(b.id) ? { ...b, id: old.id } : b
      })
      return { ...base, id: anchor ? base.id : uid('s'), blocks, notes: s.notes.join('\n') }
    })
}
