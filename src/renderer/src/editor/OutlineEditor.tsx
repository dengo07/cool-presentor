import { useEffect, useRef, useState } from 'react'
import { deckToOutline, OUTLINE_HELP, outlineToSlides } from '@core/outline'
import { useStore } from '../store'

/** The whole deck as text – fastest way to draft. Preview follows the cursor. */
export function OutlineEditor(): React.JSX.Element {
  const [text, setText] = useState(() => deckToOutline(useStore.getState().deck))
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const commit = (t: string): void => {
    const st = useStore.getState()
    const slides = outlineToSlides(t, st.deck)
    if (slides.length) st.setDeck({ ...st.deck, slides })
  }

  const follow = (): void => {
    const el = ref.current
    if (!el) return
    const before = el.value.slice(0, el.selectionStart)
    const n = outlineToSlides(before, useStore.getState().deck).length
    useStore.getState().select(Math.max(0, n - 1))
  }

  return (
    <aside className="outline">
      <div className="outline-help">{OUTLINE_HELP}</div>
      <textarea
        ref={ref}
        value={text}
        spellCheck
        onChange={(e) => {
          const t = e.target.value
          setText(t)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => {
            commit(t)
            follow()
          }, 350)
        }}
        onKeyUp={follow}
        onClick={follow}
      />
    </aside>
  )
}
