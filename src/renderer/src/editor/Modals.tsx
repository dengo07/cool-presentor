import { useEffect, useMemo, useState } from 'react'
import { Check, KeyRound, Sparkles, X } from 'lucide-react'
import { THEMES } from '@core/themes'
import { buildScene, resolveLayouts } from '@core/layout/engine'
import { SceneView } from '../preview/SceneView'
import { canvasMeasurer } from '../lib/fonts'
import { useStore } from '../store'
import { useUi } from '../ui'

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }): React.JSX.Element {
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onClose])
  return (
    <div className="modal-back" onMouseDown={onClose}>
      <div className={'modal' + (wide ? ' wide' : '')} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Modals(): React.JSX.Element | null {
  const modal = useUi((s) => s.modal)
  const close = (): void => useUi.getState().open(null)
  if (modal === 'themes') return <ThemeGallery onClose={close} />
  if (modal === 'ai') return <AiDialog onClose={close} />
  if (modal === 'settings') return <SettingsDialog onClose={close} />
  return null
}

function ThemeGallery({ onClose }: { onClose: () => void }): React.JSX.Element {
  const deck = useStore((s) => s.deck)
  const setTheme = useStore((s) => s.setTheme)
  const current = useStore((s) => s.current)
  // Preview each theme on the user's own content: the title slide + current slide.
  const previews = useMemo(() => {
    const layouts = resolveLayouts(deck)
    const idx = [...new Set([0, current])]
    return THEMES.map((t) => ({
      theme: t,
      scenes: idx.map((i) => buildScene(deck.slides[i], i, deck.slides.length, layouts[i], t, canvasMeasurer))
    }))
  }, [deck, current])

  return (
    <Modal title="Choose a theme" onClose={onClose} wide>
      <div className="theme-grid">
        {previews.map(({ theme, scenes }) => (
          <button key={theme.id} className={'theme-card' + (deck.themeId === theme.id ? ' on' : '')} onClick={() => setTheme(theme.id)}>
            <div className="theme-previews">
              {scenes.map((sc, i) => (
                <SceneView key={i} scene={sc} width={i === 0 ? 256 : 112} />
              ))}
            </div>
            <div className="theme-meta">
              <strong>{theme.name}</strong>
              <span>{theme.tagline}</span>
              {deck.themeId === theme.id && <Check size={16} className="theme-check" />}
            </div>
          </button>
        ))}
      </div>
    </Modal>
  )
}

const IDEAS = [
  'A pitch for a coffee subscription startup that delivers beans from small farms',
  'Quarterly business review for an engineering team: shipped features, metrics, next quarter goals',
  'A lecture on how black holes form, for curious high-school students',
  'Why our company should adopt a 4-day work week'
]

function AiDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(10)
  const [mode, setMode] = useState<'replace' | 'append'>('replace')
  const [hasKey, setHasKey] = useState<boolean | null>(null)
  useEffect(() => {
    window.api.getSettings().then((s) => setHasKey(s.hasKey))
  }, [])

  const go = async (): Promise<void> => {
    const ui = useUi.getState()
    onClose()
    ui.setBusy(`Claude is writing ${count} slides…`)
    const r = await window.api.ai.deck(prompt, count)
    ui.setBusy(null)
    if (!r.ok) return ui.toast({ kind: 'error', text: r.error }, 8000)
    const st = useStore.getState()
    if (mode === 'replace') {
      st.setDeck({ ...st.deck, title: r.data.title, slides: r.data.slides })
      st.select(0)
    } else {
      st.setDeck({ ...st.deck, slides: [...st.deck.slides, ...r.data.slides] })
      st.select(st.deck.slides.length)
    }
    ui.toast({ kind: 'success', text: `Generated ${r.data.slides.length} slides – try a few themes!` })
  }

  return (
    <Modal title="Generate a deck with Claude" onClose={onClose}>
      {hasKey === false && (
        <div className="callout">
          <KeyRound size={16} /> Add your Anthropic API key in{' '}
          <button className="link" onClick={() => useUi.getState().open('settings')}>
            Settings
          </button>{' '}
          to use AI features.
        </div>
      )}
      <label className="field-label">What is your presentation about?</label>
      <textarea
        className="ai-prompt"
        autoFocus
        rows={6}
        value={prompt}
        placeholder="Paste notes, an outline, a document – or just describe the talk and the audience."
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && prompt.trim()) go()
        }}
      />
      <div className="ideas">
        {IDEAS.map((i) => (
          <button key={i} className="chip" onClick={() => setPrompt(i)}>
            {i.length > 52 ? i.slice(0, 50) + '…' : i}
          </button>
        ))}
      </div>
      <div className="row">
        <label className="field-label inline">Slides</label>
        <input type="range" min={4} max={20} value={count} onChange={(e) => setCount(+e.target.value)} />
        <span className="count">{count}</span>
        <div className="spacer" />
        <div className="seg small">
          <button className={mode === 'replace' ? 'on' : ''} onClick={() => setMode('replace')}>
            New deck
          </button>
          <button className={mode === 'append' ? 'on' : ''} onClick={() => setMode('append')}>
            Append
          </button>
        </div>
      </div>
      <div className="modal-foot">
        <span className="hint">Uses Claude Opus 5.5 · Ctrl+Enter</span>
        <button className="btn primary" disabled={!prompt.trim() || hasKey === false} onClick={go}>
          <Sparkles size={16} /> Generate
        </button>
      </div>
    </Modal>
  )
}

function SettingsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [key, setKey] = useState('')
  const [hint, setHint] = useState('')
  useEffect(() => {
    window.api.getSettings().then((s) => setHint(s.keyHint))
  }, [])
  const save = async (): Promise<void> => {
    await window.api.setApiKey(key)
    useUi.getState().toast({ kind: 'success', text: key ? 'API key saved' : 'API key removed' })
    onClose()
  }
  const notes = async (): Promise<void> => {
    const ui = useUi.getState()
    onClose()
    ui.setBusy('Writing speaker notes…')
    const r = await window.api.ai.notes(useStore.getState().deck)
    ui.setBusy(null)
    if (!r.ok) return ui.toast({ kind: 'error', text: r.error }, 8000)
    const st = useStore.getState()
    st.setDeck({ ...st.deck, slides: st.deck.slides.map((s, i) => ({ ...s, notes: r.data[i] ?? s.notes })) })
    ui.toast({ kind: 'success', text: 'Speaker notes written for every slide' })
  }
  return (
    <Modal title="Settings" onClose={onClose}>
      <label className="field-label">Anthropic API key {hint && <span className="hint">(current: {hint})</span>}</label>
      <input type="password" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} autoFocus />
      <p className="hint">
        Stored encrypted on this computer and only sent to the Anthropic API. Leave empty and save to remove. Without a key, the app falls back to the
        ANTHROPIC_API_KEY environment variable.
      </p>
      <div className="modal-foot">
        <button className="btn" onClick={notes}>
          <Sparkles size={15} /> Write speaker notes for whole deck
        </button>
        <div className="spacer" />
        <button className="btn primary" onClick={save}>
          Save key
        </button>
      </div>
    </Modal>
  )
}
