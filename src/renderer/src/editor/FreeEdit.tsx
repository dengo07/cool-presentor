import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, Circle, Eye, EyeOff, Minus, Plus, RotateCcw, Square, Trash2, Type } from 'lucide-react'
import { bounds, clearTweaks, FREE_PREFIX, freeColor, groupOf, removeExtra, retarget, setTweak, transformGroup, upsertExtra } from '@core/freeform'
import { BLOCK_LABELS, type FreeColor, type FreeItem, type Slide, type Tweak, uid } from '@core/model'
import { type Scene, SLIDE_H, SLIDE_W } from '@core/scene'
import { MX, MY } from '@core/layout/ctx'
import { deckTheme } from '@core/themes'
import { useStore } from '../store'
import { useUi } from '../ui'

// ---------------------------------------------------------------------------
// Free edit mode: move, resize and hide blocks, and add free text, boxes and
// arrows. Changes are stored as tweaks for the current layout (see
// core/freeform.ts), so the auto-layout keeps working underneath.
// ---------------------------------------------------------------------------

type Box = { x: number; y: number; w: number; h: number }
export interface Live {
  key: string
  delta: Tweak
}
interface Group {
  key: string
  box: Box
  z: number
}

/** Moves/scales one group of a scene for the live drag preview (geometry only). */
export function previewScene(scene: Scene, slide: Slide, live: Live | null): Scene {
  if (!live) return scene
  const idx: number[] = []
  scene.elements.forEach((el, i) => groupOf(el.id, slide.blocks) === live.key && idx.push(i))
  if (!idx.length) return scene
  const moved = transformGroup(
    idx.map((i) => scene.elements[i]),
    live.delta
  )
  const elements = [...scene.elements]
  idx.forEach((i, k) => (elements[i] = moved[k]))
  return { ...scene, elements }
}

function groupsOf(scene: Scene, slide: Slide): Group[] {
  const map = new Map<string, { els: Scene['elements']; z: number }>()
  scene.elements.forEach((el, i) => {
    const key = groupOf(el.id, slide.blocks)
    if (!key) return
    const g = map.get(key) ?? { els: [], z: 0 }
    g.els.push(el)
    g.z = i
    map.set(key, g)
  })
  return [...map.entries()].map(([key, g]) => ({ key, box: bounds(g.els), z: g.z })).sort((a, b) => b.z - a.z)
}

const freeId = (key: string): string | null => (key.startsWith(FREE_PREFIX) ? key.slice(FREE_PREFIX.length) : null)

/** Writes a finished move/resize back to the slide. */
function commit(slideIndex: number, layoutId: string, key: string, shown: Box, target: Box): void {
  const st = useStore.getState()
  st.updateSlide(slideIndex, (s) => {
    const fid = freeId(key)
    if (fid) {
      const it = s.extras?.find((e) => e.id === fid)
      if (!it) return s
      const sx = shown.w > 1e-6 ? target.w / shown.w : 1
      const sy = shown.h > 1e-6 ? target.h / shown.h : 1
      return upsertExtra(s, { ...it, x: target.x + (it.x - shown.x) * sx, y: target.y + (it.y - shown.y) * sy, w: it.w * sx, h: it.h * sy })
    }
    return setTweak(s, layoutId, key, retarget(s.tweaks?.[layoutId]?.[key] ?? {}, shown, target))
  })
}

const SNAP = 0.08 // inches

/** Snaps a moving box to slide margins/centre and other groups' edges; returns the box and guide lines. */
function snap(b: Box, others: Box[]): { box: Box; gx: number | null; gy: number | null } {
  const xs = [0, MX, SLIDE_W / 2, SLIDE_W - MX, SLIDE_W, ...others.flatMap((o) => [o.x, o.x + o.w / 2, o.x + o.w])]
  const ys = [0, MY, SLIDE_H / 2, SLIDE_H - MY, SLIDE_H, ...others.flatMap((o) => [o.y, o.y + o.h / 2, o.y + o.h])]
  const best = (edges: number[], lines: number[]): { d: number; at: number } | null => {
    let r: { d: number; at: number } | null = null
    for (const e of edges)
      for (const l of lines) {
        const d = l - e
        if (Math.abs(d) <= SNAP && (!r || Math.abs(d) < Math.abs(r.d))) r = { d, at: l }
      }
    return r
  }
  const sx = best([b.x, b.x + b.w / 2, b.x + b.w], xs)
  const sy = best([b.y, b.y + b.h / 2, b.y + b.h], ys)
  return { box: { ...b, x: b.x + (sx?.d ?? 0), y: b.y + (sy?.d ?? 0) }, gx: sx?.at ?? null, gy: sy?.at ?? null }
}

type Drag =
  | { mode: 'move'; key: string; box: Box; x0: number; y0: number; moved: boolean }
  | { mode: 'resize'; key: string; box: Box; corner: 'nw' | 'ne' | 'sw' | 'se'; x0: number; y0: number; moved: boolean }

export function FreeEditLayer({ scene, slide, slideIndex, width, onLive }: { scene: Scene; slide: Slide; slideIndex: number; width: number; onLive: (l: Live | null) => void }): React.JSX.Element {
  const ppi = width / SLIDE_W
  const sel = useUi((s) => s.freeSel)
  const setSel = useUi((s) => s.setFreeSel)
  const groups = useMemo(() => groupsOf(scene, slide), [scene, slide])
  const [hover, setHover] = useState<string | null>(null)
  // drag state lives in refs (pointer events can arrive before React re-renders) and is mirrored to state for drawing
  const [drag, setDragState] = useState<Drag | null>(null)
  const [target, setTargetState] = useState<Box | null>(null)
  const dragRef = useRef<Drag | null>(null)
  const targetRef = useRef<Box | null>(null)
  const setDrag = (d: Drag | null): void => {
    dragRef.current = d
    setDragState(d)
  }
  const setTarget = (t: Box | null): void => {
    targetRef.current = t
    setTargetState(t)
  }
  const [guides, setGuides] = useState<{ gx: number | null; gy: number | null }>({ gx: null, gy: null })
  const [editing, setEditing] = useState<string | null>(null) // free text item id
  const layer = useRef<HTMLDivElement>(null)
  const layoutId = scene.layoutId

  const at = (e: React.PointerEvent | React.MouseEvent): { x: number; y: number } => {
    const r = layer.current!.getBoundingClientRect()
    return { x: (e.clientX - r.left) / ppi, y: (e.clientY - r.top) / ppi }
  }
  const hit = (p: { x: number; y: number }): Group | undefined =>
    groups.find((g) => p.x >= g.box.x - 0.04 && p.x <= g.box.x + g.box.w + 0.04 && p.y >= g.box.y - 0.04 && p.y <= g.box.y + g.box.h + 0.04)
  const selected = groups.find((g) => g.key === sel)

  const down = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    const p = at(e)
    const handle = (e.target as HTMLElement).dataset['corner'] as 'nw' | 'ne' | 'sw' | 'se' | undefined
    try {
      layer.current!.setPointerCapture(e.pointerId) // keep receiving moves outside the slide
    } catch {
      /* synthetic events have no capturable pointer */
    }
    if (handle && selected) {
      setDrag({ mode: 'resize', key: selected.key, box: selected.box, corner: handle, x0: p.x, y0: p.y, moved: false })
      return
    }
    const g = hit(p)
    setSel(g?.key ?? null)
    if (g && !freeId(g.key)) useStore.getState().setFocusBlock(g.key)
    if (g) setDrag({ mode: 'move', key: g.key, box: g.box, x0: p.x, y0: p.y, moved: false })
  }

  const move = (e: React.PointerEvent): void => {
    const p = at(e)
    const drag = dragRef.current
    if (!drag) {
      setHover(hit(p)?.key ?? null)
      return
    }
    const dx = p.x - drag.x0
    const dy = p.y - drag.y0
    if (!drag.moved && Math.hypot(dx, dy) < 0.04) return
    let t: Box
    if (drag.mode === 'move') {
      const s = snap({ ...drag.box, x: drag.box.x + dx, y: drag.box.y + dy }, groups.filter((g) => g.key !== drag.key).map((g) => g.box))
      t = s.box
      setGuides({ gx: s.gx, gy: s.gy })
    } else {
      const b = drag.box
      let x0 = b.x
      let y0 = b.y
      let x1 = b.x + b.w
      let y1 = b.y + b.h
      if (drag.corner.includes('w')) x0 = Math.min(x1 - 0.2, b.x + dx)
      else x1 = Math.max(x0 + 0.2, b.x + b.w + dx)
      if (drag.corner.includes('n')) y0 = Math.min(y1 - 0.2, b.y + dy)
      else y1 = Math.max(y0 + 0.2, b.y + b.h + dy)
      if (e.shiftKey && b.w > 0 && b.h > 0) {
        // keep the aspect ratio
        const k = Math.max((x1 - x0) / b.w, (y1 - y0) / b.h)
        if (drag.corner.includes('w')) x0 = x1 - b.w * k
        else x1 = x0 + b.w * k
        if (drag.corner.includes('n')) y0 = y1 - b.h * k
        else y1 = y0 + b.h * k
      }
      t = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
      setGuides({ gx: null, gy: null })
    }
    if (!drag.moved) setDrag({ ...drag, moved: true })
    setTarget(t)
    const b = drag.box
    onLive({ key: drag.key, delta: { dx: t.x - b.x, dy: t.y - b.y, sx: b.w > 1e-6 ? t.w / b.w : 1, sy: b.h > 1e-6 ? t.h / b.h : 1 } })
  }

  const up = (): void => {
    const drag = dragRef.current
    const target = targetRef.current
    if (drag?.moved && target) commit(slideIndex, layoutId, drag.key, drag.box, target)
    setDrag(null)
    setTarget(null)
    setGuides({ gx: null, gy: null })
    onLive(null)
  }

  // keyboard: nudge, hide/delete, deselect
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      const t = e.target as HTMLElement
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return
      const g = groups.find((x) => x.key === useUi.getState().freeSel)
      if (e.key === 'Escape') return useUi.getState().setFreeSel(null)
      if (!g) return
      const step = e.shiftKey ? 0.25 : 0.05
      const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key]
      if (d) {
        e.preventDefault()
        commit(slideIndex, layoutId, g.key, g.box, { ...g.box, x: g.box.x + d[0], y: g.box.y + d[1] })
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault()
        hideOrDelete(slideIndex, layoutId, g.key)
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [groups, slideIndex, layoutId])

  const px = (b: Box): React.CSSProperties => ({ left: b.x * ppi, top: b.y * ppi, width: b.w * ppi, height: b.h * ppi })
  const shownSel = drag && target && sel === drag.key ? target : selected?.box
  // warn while dragging onto other content (a little touching is fine)
  const overlapping =
    drag?.moved && target
      ? groups.filter((g) => {
          if (g.key === drag.key) return false
          const w = Math.min(target.x + target.w, g.box.x + g.box.w) - Math.max(target.x, g.box.x)
          const h = Math.min(target.y + target.h, g.box.y + g.box.h) - Math.max(target.y, g.box.y)
          return w > 0.1 && h > 0.1
        })
      : []
  const editItem = editing ? slide.extras?.find((x) => x.id === editing) : undefined

  return (
    <div
      ref={layer}
      className={'free-layer' + (drag?.mode === 'move' && drag.moved ? ' moving' : '')}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={() => !dragRef.current && setHover(null)}
      onDoubleClick={(e) => {
        const g = hit(at(e))
        const fid = g && freeId(g.key)
        if (fid && slide.extras?.find((x) => x.id === fid)?.kind === 'text') setEditing(fid)
      }}
    >
      {hover && hover !== sel && groups.find((g) => g.key === hover) && <div className="free-box hover" style={px(groups.find((g) => g.key === hover)!.box)} />}
      {shownSel && (
        <div className="free-box sel" style={px(shownSel)}>
          {(['nw', 'ne', 'sw', 'se'] as const).map((c) => (
            <span key={c} className={'free-handle ' + c} data-corner={c} />
          ))}
        </div>
      )}
      {overlapping.map((g) => (
        <div key={g.key} className="free-box warn" style={px(g.box)} />
      ))}
      {overlapping.length > 0 && target && (
        <div className="free-warn" style={{ left: target.x * ppi, top: (target.y + target.h) * ppi + 8 }}>
          Overlaps other content
        </div>
      )}
      {guides.gx !== null && <div className="free-guide v" style={{ left: guides.gx * ppi }} />}
      {guides.gy !== null && <div className="free-guide h" style={{ top: guides.gy * ppi }} />}
      {editItem && (
        <textarea
          className="free-text-edit"
          autoFocus
          style={px({ x: Math.min(editItem.x, editItem.x + editItem.w), y: Math.min(editItem.y, editItem.y + editItem.h), w: Math.abs(editItem.w), h: Math.abs(editItem.h) })}
          defaultValue={editItem.text ?? ''}
          onPointerDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(null)}
          onBlur={(e) => {
            const text = e.target.value
            useStore.getState().updateSlide(slideIndex, (s) => upsertExtra(s, { ...editItem, text }))
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

function hideOrDelete(slideIndex: number, layoutId: string, key: string): void {
  const st = useStore.getState()
  const fid = freeId(key)
  st.updateSlide(slideIndex, (s) => (fid ? removeExtra(s, fid) : setTweak(s, layoutId, key, { ...(s.tweaks?.[layoutId]?.[key] ?? {}), hidden: true })))
  useUi.getState().setFreeSel(null)
}

const NEW_ITEMS: { kind: FreeItem['kind']; label: string; icon: React.ReactNode; make: () => Omit<FreeItem, 'id' | 'kind'> }[] = [
  { kind: 'text', label: 'Text', icon: <Type size={14} />, make: () => ({ x: SLIDE_W / 2 - 2, y: SLIDE_H / 2 - 0.45, w: 4, h: 0.9, text: 'Double-click to edit', size: 24 }) },
  { kind: 'rect', label: 'Box', icon: <Square size={14} />, make: () => ({ x: SLIDE_W / 2 - 1.5, y: SLIDE_H / 2 - 1, w: 3, h: 2 }) },
  { kind: 'ellipse', label: 'Circle', icon: <Circle size={14} />, make: () => ({ x: SLIDE_W / 2 - 1, y: SLIDE_H / 2 - 1, w: 2, h: 2 }) },
  { kind: 'arrow', label: 'Arrow', icon: <ArrowRight size={14} />, make: () => ({ x: SLIDE_W / 2 - 1.5, y: SLIDE_H / 2, w: 3, h: 0 }) }
]
const COLORS: FreeColor[] = ['text', 'muted', 'accent', 'accent2', 'accent3', 'alert']

/** The layout bar while free editing: add items, style the selection, reset. */
export function FreeEditBar({ scene, slideIndex }: { scene: Scene; slideIndex: number }): React.JSX.Element {
  const slide = useStore((s) => s.deck.slides[slideIndex])
  const deck = useStore((s) => s.deck)
  const update = useStore((s) => s.updateSlide)
  const sel = useUi((s) => s.freeSel)
  const setSel = useUi((s) => s.setFreeSel)
  const theme = useMemo(() => deckTheme(deck), [deck])
  const layoutId = scene.layoutId
  const tweaks = slide.tweaks?.[layoutId] ?? {}
  const hidden = Object.entries(tweaks).filter(([, t]) => t.hidden)
  const fid = sel ? freeId(sel) : null
  const item = fid ? slide.extras?.find((x) => x.id === fid) : undefined
  const block = sel && !fid ? slide.blocks.find((b) => b.id === sel) : undefined
  const setItem = (patch: Partial<FreeItem>): void => item && update(slideIndex, (s) => upsertExtra(s, { ...item, ...patch }))

  return (
    <div className="free-bar">
        {NEW_ITEMS.map((n) => (
          <button
            key={n.kind}
            className="btn sm"
            title={`Add a free ${n.label.toLowerCase()} on top of the layout`}
            onClick={() => {
              const id = uid('f')
              update(slideIndex, (s) => upsertExtra(s, { id, kind: n.kind, ...n.make() }))
              setSel(FREE_PREFIX + id)
            }}
          >
            {n.icon} {n.label}
          </button>
        ))}
        <span className="free-sep" />
        {item && (
          <>
            {COLORS.map((c) => (
              <button
                key={c}
                className={'swatch' + ((item.color ?? (item.kind === 'text' ? 'text' : 'accent')) === c ? ' on' : '')}
                title={c}
                style={{ background: '#' + freeColor(theme, c, c) }}
                onClick={() => setItem({ color: c })}
              />
            ))}
            {(item.kind === 'rect' || item.kind === 'ellipse') && (
              <button className={'btn sm' + (item.filled ? ' on' : '')} onClick={() => setItem({ filled: !item.filled })}>
                Filled
              </button>
            )}
            {item.kind === 'text' && (
              <>
                <button className="icon-btn" title="Smaller text" onClick={() => setItem({ size: Math.max(8, (item.size ?? 20) - 2) })}>
                  <Minus size={14} />
                </button>
                <span className="hint">{item.size ?? 20}pt</span>
                <button className="icon-btn" title="Larger text" onClick={() => setItem({ size: Math.min(96, (item.size ?? 20) + 2) })}>
                  <Plus size={14} />
                </button>
              </>
            )}
            <button className="btn sm danger" onClick={() => hideOrDelete(slideIndex, layoutId, sel!)}>
              <Trash2 size={14} /> Delete
            </button>
          </>
        )}
        {block && (
          <>
            <span className="hint">{BLOCK_LABELS[block.type]}</span>
            <button className="btn sm" title="Hide this block in this layout (Delete)" onClick={() => hideOrDelete(slideIndex, layoutId, block.id)}>
              <EyeOff size={14} /> Hide
            </button>
            {tweaks[block.id] && (
              <button className="btn sm" title="Back to where the layout puts it" onClick={() => update(slideIndex, (s) => setTweak(s, layoutId, block.id, null))}>
                <RotateCcw size={14} /> Reset
              </button>
            )}
          </>
        )}
        {!sel && <span className="hint">Drag to move · corners resize (Shift keeps shape) · arrows nudge · Delete hides</span>}
        <div className="spacer" />
        {hidden.length > 0 && (
          <button
            className="btn sm"
            onClick={() => update(slideIndex, (s) => hidden.reduce((acc, [k, t]) => setTweak(acc, layoutId, k, { ...t, hidden: undefined }), s))}
          >
            <Eye size={14} /> Show hidden ({hidden.length})
          </button>
        )}
        {Object.keys(tweaks).length > 0 && (
          <button className="btn sm" title="Remove all manual moves for this layout" onClick={() => update(slideIndex, (s) => clearTweaks(s, layoutId))}>
            <RotateCcw size={14} /> Reset layout
          </button>
        )}
      <button className="btn sm primary" onClick={() => useUi.getState().setFreeEdit(false)}>
        Done
      </button>
    </div>
  )
}
