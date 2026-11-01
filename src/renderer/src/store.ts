import { create } from 'zustand'
import { temporal } from 'zundo'
import { type Block, type BlockType, type Deck, newBlock, newDeck, newSlide, type Slide, uid } from '@core/model'
import { candidates, resolveLayouts } from '@core/layout/engine'

export type View = 'edit' | 'outline'

interface State {
  deck: Deck
  current: number
  filePath: string | null
  dirty: boolean
  view: View
  focusBlock: string | null

  load(deck: Deck, path?: string | null): void
  setDeck(deck: Deck): void
  setTitle(title: string): void
  setTheme(id: string): void
  select(i: number): void
  setView(v: View): void
  setFocusBlock(id: string | null): void
  markSaved(path: string): void

  updateSlide(i: number, fn: (s: Slide) => Slide): void
  updateBlock(blockId: string, patch: Partial<Block>): void
  addBlock(type: BlockType, at?: number): void
  removeBlock(blockId: string): void
  moveBlock(blockId: string, dir: -1 | 1): void

  addSlide(after?: number, blocks?: Block[]): void
  duplicateSlide(i: number): void
  removeSlide(i: number): void
  moveSlide(from: number, to: number): void
  shuffleLayout(i: number): void
  setLayout(i: number, layout: string): void
}

/** Groups rapid edits (typing) into one undo step. */
function leadingDebounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: ReturnType<typeof setTimeout> | undefined
  return (...a: A) => {
    if (!t) fn(...a)
    clearTimeout(t)
    t = setTimeout(() => (t = undefined), ms)
  }
}

export const useStore = create<State>()(
  temporal(
    (set, get) => {
      const edit = (deck: Deck, extra: Partial<State> = {}): void => set({ deck, dirty: true, ...extra })
      const slides = (fn: (s: Slide[]) => Slide[], extra: Partial<State> = {}): void => edit({ ...get().deck, slides: fn(get().deck.slides) }, extra)

      return {
        deck: newDeck(),
        current: 0,
        filePath: null,
        dirty: false,
        view: 'edit',
        focusBlock: null,

        load: (deck, path = null) => {
          set({ deck, current: 0, filePath: path, dirty: false, focusBlock: null })
          useStore.temporal.getState().clear()
        },
        setDeck: (deck) => edit(deck, { current: Math.min(get().current, Math.max(0, deck.slides.length - 1)) }),
        setTitle: (title) => edit({ ...get().deck, title }),
        setTheme: (themeId) => edit({ ...get().deck, themeId }),
        select: (i) => set({ current: Math.max(0, Math.min(get().deck.slides.length - 1, i)), focusBlock: null }),
        setView: (view) => set({ view }),
        setFocusBlock: (focusBlock) => set({ focusBlock }),
        markSaved: (path) => set({ filePath: path, dirty: false }),

        updateSlide: (i, fn) => slides((ss) => ss.map((s, j) => (j === i ? fn(s) : s))),
        updateBlock: (blockId, patch) =>
          slides((ss) =>
            ss.map((s, j) =>
              j === get().current ? { ...s, blocks: s.blocks.map((b) => (b.id === blockId ? ({ ...b, ...patch } as Block) : b)) } : s
            )
          ),
        addBlock: (type, at) => {
          const b = newBlock(type)
          slides(
            (ss) =>
              ss.map((s, j) => {
                if (j !== get().current) return s
                const blocks = [...s.blocks]
                // header blocks go first, in a sensible order
                const order: BlockType[] = ['eyebrow', 'title', 'subtitle']
                if (order.includes(type)) {
                  const idx = blocks.findIndex((x) => order.indexOf(x.type as BlockType) > order.indexOf(type) || !order.includes(x.type))
                  blocks.splice(idx < 0 ? blocks.length : idx, 0, b)
                } else blocks.splice(at ?? blocks.length, 0, b)
                return { ...s, blocks }
              }),
            { focusBlock: b.id }
          )
        },
        removeBlock: (blockId) => get().updateSlide(get().current, (s) => ({ ...s, blocks: s.blocks.filter((b) => b.id !== blockId) })),
        moveBlock: (blockId, dir) =>
          get().updateSlide(get().current, (s) => {
            const i = s.blocks.findIndex((b) => b.id === blockId)
            const j = i + dir
            if (i < 0 || j < 0 || j >= s.blocks.length) return s
            const blocks = [...s.blocks]
            ;[blocks[i], blocks[j]] = [blocks[j], blocks[i]]
            return { ...s, blocks }
          }),

        addSlide: (after, blocks) => {
          const at = (after ?? get().current) + 1
          const s = newSlide(blocks ?? [{ ...newBlock('title'), text: 'New slide' } as Block, newBlock('bullets')])
          slides((ss) => [...ss.slice(0, at), s, ...ss.slice(at)], { current: at })
        },
        // Keeps block ids so the copy morphs from the original – the PowerPoint Morph workflow.
        duplicateSlide: (i) => {
          const src = get().deck.slides[i]
          const copy: Slide = { ...src, id: uid('s'), blocks: src.blocks.map((b) => ({ ...b })), layout: 'auto' }
          slides((ss) => [...ss.slice(0, i + 1), copy, ...ss.slice(i + 1)], { current: i + 1 })
          // nudge the copy to a different layout so morph has something to animate
          get().shuffleLayout(i + 1)
        },
        removeSlide: (i) => {
          if (get().deck.slides.length <= 1) return
          slides((ss) => ss.filter((_, j) => j !== i), { current: Math.max(0, Math.min(i, get().deck.slides.length - 2)) })
        },
        moveSlide: (from, to) => {
          if (from === to) return
          slides(
            (ss) => {
              const out = [...ss]
              const [s] = out.splice(from, 1)
              out.splice(to, 0, s)
              return out
            },
            { current: to }
          )
        },
        shuffleLayout: (i) => {
          const deck = get().deck
          const resolved = resolveLayouts(deck)[i]
          const cands = candidates(deck.slides[i], i, deck.slides.length)
          if (cands.length < 2) return
          const k = cands.findIndex((c) => c.id === resolved)
          const next = cands[(k + 1) % cands.length]
          get().updateSlide(i, (s) => ({ ...s, layout: next.id }))
        },
        setLayout: (i, layout) => get().updateSlide(i, (s) => ({ ...s, layout })),
      }
    },
    {
      partialize: (s) => ({ deck: s.deck }),
      limit: 200,
      equality: (a, b) => a.deck === b.deck,
      handleSet: (handleSet) => leadingDebounce(handleSet, 600)
    }
  )
)

export const currentSlide = (s: State): Slide => s.deck.slides[s.current]
