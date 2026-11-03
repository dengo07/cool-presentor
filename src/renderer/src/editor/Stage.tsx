import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Copy, Move, Shuffle } from 'lucide-react'
import { candidates } from '@core/layout/engine'
import type { Scene } from '@core/scene'
import type { Transition } from '@core/model'
import { SceneView } from '../preview/SceneView'
import { useStore } from '../store'
import { useUi } from '../ui'
import { FreeEditBar, FreeEditLayer, type Live, previewScene } from './FreeEdit'

function useSize(ref: React.RefObject<HTMLElement | null>): { w: number; h: number } {
  const [size, setSize] = useState({ w: 800, h: 450 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref])
  return size
}

/** Finds the block an element id belongs to (semantic ids map to header blocks). */
function blockForElement(elId: string, blocks: { id: string; type: string }[]): string | null {
  const semantic: Record<string, string> = { title: 'title', subtitle: 'subtitle', eyebrow: 'eyebrow' }
  if (semantic[elId]) return blocks.find((b) => b.type === semantic[elId])?.id ?? null
  const hit = blocks.filter((b) => elId === b.id || elId.startsWith(b.id + '-')).sort((a, b) => b.id.length - a.id.length)[0]
  return hit?.id ?? null
}

export function Stage({ scenes }: { scenes: Scene[] }): React.JSX.Element {
  const deck = useStore((s) => s.deck)
  const current = useStore((s) => s.current)
  const setLayout = useStore((s) => s.setLayout)
  const shuffle = useStore((s) => s.shuffleLayout)
  const duplicate = useStore((s) => s.duplicateSlide)
  const updateSlide = useStore((s) => s.updateSlide)
  const setFocusBlock = useStore((s) => s.setFocusBlock)
  const wrap = useRef<HTMLDivElement>(null)
  const { w, h } = useSize(wrap)
  const freeEdit = useUi((s) => s.freeEdit)
  const [live, setLive] = useState<Live | null>(null)
  // selection belongs to one slide
  useEffect(() => useUi.getState().setFreeSel(null), [current])
  const slide = deck.slides[current]
  const scene = scenes[current]
  if (!slide || !scene) return <main className="stage" />

  const width = Math.max(200, Math.min(w - 48, ((h - 48) * 16) / 9))
  const cands = candidates(slide, current, deck.slides.length)

  return (
    <main className="stage">
      <div className="stage-canvas" ref={wrap} onMouseDown={() => !freeEdit && setFocusBlock(null)}>
        <div className="stage-frame" style={{ width, height: (width * 9) / 16 }}>
          <SceneView
            scene={freeEdit ? previewScene(scene, slide, live) : scene}
            width={width}
            animate={!freeEdit}
            className="stage-slide"
            onPick={freeEdit ? undefined : (id) => setFocusBlock(blockForElement(id, slide.blocks))}
          />
          {freeEdit && <FreeEditLayer scene={scene} slide={slide} slideIndex={current} width={width} onLive={setLive} />}
        </div>
      </div>
      {freeEdit ? (
        <div className="layoutbar">
          <FreeEditBar scene={scene} slideIndex={current} />
        </div>
      ) : (
      <div className="layoutbar">
        <span className="label">Layout</span>
        <div className="chips">
          {cands.map((c) => (
            <button
              key={c.id}
              className={'chip' + (scene.layoutId === c.id ? ' on' : '')}
              onClick={() => setLayout(current, c.id)}
              title={slide.layout === c.id ? 'Pinned' : 'Use this layout'}
            >
              {c.name}
              {slide.layout === c.id && <span className="pin">•</span>}
            </button>
          ))}
          {slide.layout !== 'auto' && (
            <button className="chip ghost" onClick={() => setLayout(current, 'auto')}>
              Auto
            </button>
          )}
        </div>
        <div className="spacer" />
        {slide.tweaks?.[scene.layoutId] && <span className="hint" title="This layout has manual adjustments">Adjusted</span>}
        <button className="btn sm" onClick={() => useUi.getState().setFreeEdit(true)} title="Move, resize or hide blocks and add free text, boxes and arrows">
          <Move size={14} /> Free edit
        </button>
        <button className="btn sm" onClick={() => shuffle(current)} title="Shuffle layout (Ctrl+L)" disabled={cands.length < 2}>
          <Shuffle size={14} /> Shuffle
        </button>
        <button className="btn sm" onClick={() => duplicate(current)} title="Duplicate this slide with a new layout – PowerPoint Morph animates between them">
          <Copy size={14} /> Duplicate & morph
        </button>
        <label className="select-wrap" title="Transition into this slide">
          <select value={slide.transition} onChange={(e) => updateSlide(current, (s) => ({ ...s, transition: e.target.value as Transition }))}>
            <option value="morph">Morph</option>
            <option value="fade">Fade</option>
            <option value="none">No transition</option>
          </select>
        </label>
      </div>
      )}
    </main>
  )
}
