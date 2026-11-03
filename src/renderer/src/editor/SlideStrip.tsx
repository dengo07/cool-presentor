import { useEffect, useRef, useState } from 'react'
import { Copy, Plus, Trash2 } from 'lucide-react'
import { type Block, type BlockType, newBlock } from '@core/model'
import type { Scene } from '@core/scene'
import { SceneView } from '../preview/SceneView'
import { useStore } from '../store'

const TEMPLATES: { label: string; blocks: BlockType[] }[] = [
  { label: 'Title & bullets', blocks: ['title', 'bullets'] },
  { label: 'Section', blocks: ['eyebrow', 'title'] },
  { label: 'Big numbers', blocks: ['title', 'stat', 'stat', 'stat'] },
  { label: 'Chart', blocks: ['title', 'chart', 'text'] },
  { label: 'Image + text', blocks: ['title', 'text', 'image'] },
  { label: 'Features', blocks: ['title', 'features'] },
  { label: 'Timeline', blocks: ['title', 'timeline'] },
  { label: 'Gantt chart', blocks: ['title', 'gantt'] },
  { label: 'Funnel', blocks: ['title', 'funnel'] },
  { label: 'Comparison', blocks: ['title', 'comparison'] },
  { label: 'Quote', blocks: ['quote'] },
  { label: 'Statement', blocks: ['text'] }
]

export function SlideStrip({ scenes }: { scenes: Scene[] }): React.JSX.Element {
  const current = useStore((s) => s.current)
  const slides = useStore((s) => s.deck.slides)
  const select = useStore((s) => s.select)
  const moveSlide = useStore((s) => s.moveSlide)
  const removeSlide = useStore((s) => s.removeSlide)
  const duplicateSlide = useStore((s) => s.duplicateSlide)
  const addSlide = useStore((s) => s.addSlide)
  const [drag, setDrag] = useState<number | null>(null)
  const [over, setOver] = useState<number | null>(null)
  const [menu, setMenu] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('.thumb.active')?.scrollIntoView({ block: 'nearest' })
  }, [current])

  return (
    <aside className="strip">
      <div className="strip-list" ref={listRef}>
        {scenes.map((sc, i) => (
          <div
            key={slides[i]?.id ?? i}
            className={'thumb' + (i === current ? ' active' : '') + (over === i && drag !== null ? ' over' : '')}
            draggable
            onDragStart={() => setDrag(i)}
            onDragOver={(e) => {
              e.preventDefault()
              setOver(i)
            }}
            onDragEnd={() => {
              setDrag(null)
              setOver(null)
            }}
            onDrop={() => {
              if (drag !== null) moveSlide(drag, i)
              setDrag(null)
              setOver(null)
            }}
            onClick={() => select(i)}
          >
            <span className="num">{i + 1}</span>
            <SceneView scene={sc} width={176} />
            <div className="thumb-actions">
              <button title="Duplicate for Morph (Ctrl+D)" onClick={(e) => (e.stopPropagation(), duplicateSlide(i))}>
                <Copy size={13} />
              </button>
              <button title="Delete slide" onClick={(e) => (e.stopPropagation(), removeSlide(i))}>
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="strip-add">
        <button className="btn wide" onClick={() => setMenu((m) => !m)}>
          <Plus size={16} /> New slide
        </button>
        {menu && (
          <div className="popover up" onMouseLeave={() => setMenu(false)}>
            {TEMPLATES.map((t) => (
              <button
                key={t.label}
                onClick={() => {
                  setMenu(false)
                  addSlide(current, t.blocks.map((b) => newBlock(b)) as Block[])
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
