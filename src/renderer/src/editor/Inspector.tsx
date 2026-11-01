import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ImagePlus, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react'
import { type Block, BLOCK_LABELS, type BlockOf, type BlockType, type ChartKind } from '@core/model'
import { iconNames, iconSvg } from '@core/icons'
import { useStore } from '../store'
import { useUi } from '../ui'
import { fileToImage } from '../lib/images'

const ADDABLE: BlockType[] = ['eyebrow', 'title', 'subtitle', 'text', 'bullets', 'stat', 'image', 'chart', 'quote', 'features', 'timeline', 'comparison']

export function Inspector(): React.JSX.Element {
  const slide = useStore((s) => s.deck.slides[s.current])
  const current = useStore((s) => s.current)
  const addBlock = useStore((s) => s.addBlock)
  const updateSlide = useStore((s) => s.updateSlide)
  const focusBlock = useStore((s) => s.focusBlock)
  const [menu, setMenu] = useState(false)
  if (!slide) return <aside className="inspector" />

  return (
    <aside className="inspector">
      <div className="insp-head">
        <h3>Slide {current + 1}</h3>
        <AiSlideMenu />
      </div>
      <div className="blocks">
        {slide.blocks.map((b, i) => (
          <BlockCard key={b.id} block={b} first={i === 0} last={i === slide.blocks.length - 1} focused={focusBlock === b.id} />
        ))}
        <div className="add-block">
          <button className="btn wide ghost" onClick={() => setMenu((m) => !m)}>
            <Plus size={15} /> Add block
          </button>
          {menu && (
            <div className="popover grid" onMouseLeave={() => setMenu(false)}>
              {ADDABLE.map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    addBlock(t)
                    setMenu(false)
                  }}
                >
                  {BLOCK_LABELS[t]}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <div className="notes">
        <div className="notes-head">
          <label>Speaker notes</label>
        </div>
        <textarea
          value={slide.notes}
          placeholder="What will you say on this slide?"
          onChange={(e) => updateSlide(current, (s) => ({ ...s, notes: e.target.value }))}
        />
      </div>
    </aside>
  )
}

// ---------------------------------------------------------------------------

function AiSlideMenu(): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const run = async (instruction: string): Promise<void> => {
    setOpen(false)
    const st = useStore.getState()
    const slide = st.deck.slides[st.current]
    const idx = st.current
    const ui = useUi.getState()
    ui.setBusy('Claude is redesigning this slide…')
    const r = await window.api.ai.slide(slide, instruction, st.deck.title)
    ui.setBusy(null)
    if (!r.ok) return ui.toast({ kind: 'error', text: r.error }, 7000)
    useStore.getState().updateSlide(idx, (s) => ({ ...s, blocks: r.data.blocks, notes: s.notes || r.data.notes, layout: 'auto' }))
    ui.toast({ kind: 'success', text: 'Slide updated – Ctrl+Z to undo' })
  }
  return (
    <div className="ai-menu">
      <button className="btn sm ai" onClick={() => setOpen((o) => !o)}>
        <Sparkles size={14} /> AI
      </button>
      {open && (
        <div className="popover right" onMouseLeave={() => setOpen(false)}>
          <button onClick={() => run('make it punchier and more memorable')}>Punch it up</button>
          <button onClick={() => run('turn it into a more visual slide: prefer stats, a chart, a timeline, a feature grid or a comparison over bullets')}>
            Make it visual
          </button>
          <button onClick={() => run('make it much shorter; cut every word that is not needed')}>Shorten</button>
          <button onClick={() => run('make it sound more professional and confident')}>More professional</button>
          <input
            className="custom-ai"
            placeholder="Or tell Claude what to change… ↵"
            onKeyDown={(e) => {
              const v = e.currentTarget.value.trim()
              if (e.key === 'Enter' && v) run(v)
            }}
          />
        </div>
      )}
    </div>
  )
}

function BlockCard({ block, first, last, focused }: { block: Block; first: boolean; last: boolean; focused: boolean }): React.JSX.Element {
  const remove = useStore((s) => s.removeBlock)
  const move = useStore((s) => s.moveBlock)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!focused || !ref.current) return
    ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    ref.current.querySelector<HTMLElement>('textarea, input')?.focus()
  }, [focused])
  return (
    <div className={'block-card' + (focused ? ' focused' : '')} ref={ref}>
      <div className="block-head">
        <span className="block-type">{BLOCK_LABELS[block.type]}</span>
        <div className="spacer" />
        <button className="icon-btn xs" disabled={first} onClick={() => move(block.id, -1)} title="Move up">
          <ArrowUp size={13} />
        </button>
        <button className="icon-btn xs" disabled={last} onClick={() => move(block.id, 1)} title="Move down">
          <ArrowDown size={13} />
        </button>
        <button className="icon-btn xs" onClick={() => remove(block.id)} title="Remove block">
          <Trash2 size={13} />
        </button>
      </div>
      <BlockEditor block={block} />
    </div>
  )
}

function useUpdate(id: string): (patch: Partial<Block>) => void {
  const update = useStore((s) => s.updateBlock)
  return (patch) => update(id, patch)
}

/** Auto-growing textarea. */
function Area(props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { value: string }): React.JSX.Element {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 2 + 'px'
  }, [props.value])
  return <textarea ref={ref} rows={1} {...props} />
}

function RewriteButton({ text, onDone }: { text: string; onDone: (t: string) => void }): React.JSX.Element {
  const go = async (): Promise<void> => {
    const ui = useUi.getState()
    ui.setBusy('Rewriting…')
    const r = await window.api.ai.rewrite(text, 'make it punchier and more concise')
    ui.setBusy(null)
    if (r.ok) onDone(r.data)
    else ui.toast({ kind: 'error', text: r.error }, 7000)
  }
  return (
    <button className="icon-btn xs ai-ghost" title="Punch up with AI" onClick={go} disabled={!text.trim()}>
      <Wand2 size={13} />
    </button>
  )
}

function BlockEditor({ block }: { block: Block }): React.JSX.Element {
  const up = useUpdate(block.id)
  switch (block.type) {
    case 'title':
    case 'subtitle':
    case 'eyebrow':
    case 'text':
      return (
        <div className="field-row">
          <Area
            value={block.text}
            className={block.type === 'title' ? 'big' : ''}
            placeholder={block.type === 'title' ? 'Headline – wrap a *word* to highlight it' : ''}
            onChange={(e) => up({ text: e.target.value })}
          />
          <RewriteButton text={block.text} onDone={(text) => up({ text })} />
        </div>
      )
    case 'bullets':
      return (
        <div className="field-row">
          <Area
            value={block.items.join('\n')}
            placeholder="One point per line"
            onChange={(e) => up({ items: e.target.value.split('\n') })}
            onBlur={(e) => up({ items: e.target.value.split('\n').filter((x) => x.trim()) })}
          />
          <RewriteButton text={block.items.join('\n')} onDone={(t) => up({ items: t.split('\n').map((x) => x.replace(/^[-•]\s*/, '')).filter(Boolean) })} />
        </div>
      )
    case 'stat':
      return (
        <div className="grid2">
          <input value={block.value} placeholder="87%" onChange={(e) => up({ value: e.target.value })} className="big" />
          <input value={block.label} placeholder="what it measures" onChange={(e) => up({ label: e.target.value })} />
          <input
            className="span2"
            value={block.caption ?? ''}
            placeholder="Optional caption / source"
            onChange={(e) => up({ caption: e.target.value || undefined })}
          />
        </div>
      )
    case 'quote':
      return (
        <>
          <Area value={block.text} onChange={(e) => up({ text: e.target.value })} />
          <input value={block.author ?? ''} placeholder="Author" onChange={(e) => up({ author: e.target.value || undefined })} />
        </>
      )
    case 'image':
      return <ImageEditor block={block} />
    case 'chart':
      return <ChartEditor block={block} />
    case 'timeline':
      return (
        <RowsEditor
          rows={block.items.map((i) => [i.date, i.title, i.text ?? ''])}
          cols={['When', 'Milestone', 'Detail']}
          onChange={(rows) => up({ items: rows.map(([date, title, text]) => ({ date, title, text: text || undefined })) })}
        />
      )
    case 'features':
      return <FeaturesEditor block={block} />
    case 'comparison':
      return (
        <div className="grid2">
          {(['left', 'right'] as const).map((side) => (
            <div key={side} className="col">
              <input value={block[side].title} onChange={(e) => up({ [side]: { ...block[side], title: e.target.value } })} className="big" />
              <Area
                value={block[side].items.join('\n')}
                placeholder="One per line"
                onChange={(e) => up({ [side]: { ...block[side], items: e.target.value.split('\n') } })}
              />
            </div>
          ))}
        </div>
      )
  }
}

function ImageEditor({ block }: { block: BlockOf<'image'> }): React.JSX.Element {
  const up = useUpdate(block.id)
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const load = async (f: File | undefined): Promise<void> => {
    if (!f) return
    try {
      const img = await fileToImage(f)
      up({ src: img.src, width: img.width, height: img.height, focusX: 0.5, focusY: 0.5, alt: block.alt || f.name.replace(/\.\w+$/, '') })
    } catch (e) {
      useUi.getState().toast({ kind: 'error', text: String(e) })
    }
  }
  return (
    <div
      className={'image-drop' + (over ? ' over' : '')}
      onDragOver={(e) => (e.preventDefault(), setOver(true))}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setOver(false)
        load(e.dataTransfer.files[0])
      }}
    >
      {block.src ? (
        <div
          className="image-preview"
          title="Click to set the focus point"
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect()
            up({ focusX: (e.clientX - r.left) / r.width, focusY: (e.clientY - r.top) / r.height })
          }}
        >
          <img src={block.src} />
          <span className="focus-dot" style={{ left: `${(block.focusX ?? 0.5) * 100}%`, top: `${(block.focusY ?? 0.5) * 100}%` }} />
        </div>
      ) : (
        <button className="btn wide ghost" onClick={() => input.current?.click()}>
          <ImagePlus size={16} /> Choose or drop an image
        </button>
      )}
      {block.src && (
        <div className="row">
          <button className="btn sm" onClick={() => input.current?.click()}>
            Replace
          </button>
          <span className="hint">Click the photo to set the crop focus</span>
        </div>
      )}
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => load(e.target.files?.[0])} />
    </div>
  )
}

function ChartEditor({ block }: { block: BlockOf<'chart'> }): React.JSX.Element {
  const up = useUpdate(block.id)
  const toCsv = (): string =>
    [['', ...block.series.map((s) => s.name)].join(', '), ...block.categories.map((c, i) => [c, ...block.series.map((s) => s.values[i] ?? 0)].join(', '))].join('\n')
  const [csv, setCsv] = useState(toCsv)
  const [err, setErr] = useState('')
  useEffect(() => setCsv(toCsv()), [block.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = (text: string): void => {
    setCsv(text)
    const rows = text
      .split('\n')
      .map((r) => r.split(/[,\t;]/).map((c) => c.trim()))
      .filter((r) => r.some(Boolean))
    if (rows.length < 2 || rows[0].length < 2) return setErr('Need a header row and at least one data row')
    const names = rows[0].slice(1)
    const data = rows.slice(1)
    const series = names.map((name, k) => ({ name: name || `Series ${k + 1}`, values: data.map((r) => parseFloat((r[k + 1] ?? '').replace(/[^\d.-]/g, '')) || 0) }))
    setErr('')
    up({ categories: data.map((r) => r[0]), series })
  }

  return (
    <>
      <div className="seg small">
        {(['column', 'bar', 'line', 'area', 'pie', 'donut'] as ChartKind[]).map((k) => (
          <button key={k} className={block.kind === k ? 'on' : ''} onClick={() => up({ kind: k })}>
            {k}
          </button>
        ))}
      </div>
      <textarea className="mono" rows={Math.min(10, csv.split('\n').length + 1)} value={csv} onChange={(e) => apply(e.target.value)} spellCheck={false} />
      <div className="row">
        <input value={block.unit ?? ''} placeholder="Unit (e.g. %)" onChange={(e) => up({ unit: e.target.value || undefined })} style={{ width: 110 }} />
        <span className="hint">{err || 'CSV: first column = labels, header = series names'}</span>
      </div>
    </>
  )
}

function RowsEditor({ rows, cols, onChange }: { rows: string[][]; cols: string[]; onChange: (rows: string[][]) => void }): React.JSX.Element {
  const set = (i: number, j: number, v: string): void => onChange(rows.map((r, a) => (a === i ? r.map((c, b) => (b === j ? v : c)) : r)))
  return (
    <div className="rows">
      {rows.map((r, i) => (
        <div className="rows-row" key={i}>
          {r.map((c, j) => (
            <input key={j} value={c} placeholder={cols[j]} onChange={(e) => set(i, j, e.target.value)} className={j === 0 ? 'narrow' : ''} />
          ))}
          <button className="icon-btn xs" onClick={() => onChange(rows.filter((_, a) => a !== i))}>
            <X size={12} />
          </button>
        </div>
      ))}
      {rows.length < 8 && (
        <button className="btn sm ghost" onClick={() => onChange([...rows, cols.map(() => '')])}>
          <Plus size={13} /> Add
        </button>
      )}
    </div>
  )
}

function FeaturesEditor({ block }: { block: BlockOf<'features'> }): React.JSX.Element {
  const up = useUpdate(block.id)
  const [picker, setPicker] = useState<number | null>(null)
  const set = (i: number, patch: Partial<BlockOf<'features'>['items'][number]>): void =>
    up({ items: block.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) })
  return (
    <div className="rows">
      {block.items.map((it, i) => (
        <div className="rows-row" key={i}>
          <button
            className="icon-pick"
            title="Change icon"
            onClick={() => setPicker(picker === i ? null : i)}
            dangerouslySetInnerHTML={{ __html: iconSvg(it.icon, 'C9CCF5', 2, 18) }}
          />
          <input value={it.title} placeholder="Title" onChange={(e) => set(i, { title: e.target.value })} />
          <input value={it.text ?? ''} placeholder="Detail" onChange={(e) => set(i, { text: e.target.value || undefined })} />
          <button className="icon-btn xs" onClick={() => up({ items: block.items.filter((_, j) => j !== i) })}>
            <X size={12} />
          </button>
          {picker === i && <IconPicker onPick={(icon) => (set(i, { icon }), setPicker(null))} onClose={() => setPicker(null)} />}
        </div>
      ))}
      {block.items.length < 6 && (
        <button className="btn sm ghost" onClick={() => up({ items: [...block.items, { icon: 'Star', title: 'New feature' }] })}>
          <Plus size={13} /> Add
        </button>
      )}
    </div>
  )
}

const ALL_ICONS = iconNames()

function IconPicker({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }): React.JSX.Element {
  const [q, setQ] = useState('')
  const list = ALL_ICONS.filter((n) => n.toLowerCase().includes(q.toLowerCase())).slice(0, 96)
  return (
    <div className="icon-picker" onMouseLeave={onClose}>
      <input autoFocus placeholder="Search icons…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="icon-grid">
        {list.map((n) => (
          <button key={n} title={n} onClick={() => onPick(n)} dangerouslySetInnerHTML={{ __html: iconSvg(n, 'C9CCF5', 2, 20) }} />
        ))}
      </div>
    </div>
  )
}
