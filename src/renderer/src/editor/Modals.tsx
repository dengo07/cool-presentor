import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileText, KeyRound, Loader2, Paperclip, Sparkles, Terminal, X, Zap } from 'lucide-react'
import type { DocInfo, DocResult, EngineStatus } from '../../../preload'
import { useStore } from '../store'
import { useUi } from '../ui'
import { ThemeStudio } from './ThemeStudio'

export function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }): React.JSX.Element {
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
  if (modal === 'themes') return <ThemeStudio onClose={close} />
  if (modal === 'ai') return <AiDialog onClose={close} />
  if (modal === 'settings') return <SettingsDialog onClose={close} />
  return null
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
  const [engine, setEngine] = useState<EngineStatus | null>(null)
  const [docs, setDocs] = useState<DocInfo[]>([])
  const [reading, setReading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  useEffect(() => {
    window.api.getSettings().then(setEngine)
  }, [])
  const notReady = engine !== null && !engine.ready

  const addResults = (results: DocResult[]): void => {
    const ok = results.filter((r): r is DocInfo => 'id' in r)
    setDocs((d) => [...d, ...ok])
    for (const r of results) if ('error' in r) useUi.getState().toast({ kind: 'error', text: `${r.name}: ${r.error}` }, 7000)
  }
  const pick = async (): Promise<void> => {
    setReading(true)
    addResults(await window.api.docs.pick())
    setReading(false)
  }
  const drop = async (files: FileList): Promise<void> => {
    const paths = [...files].map((f) => window.api.docs.pathFor(f)).filter(Boolean)
    if (!paths.length) return
    setReading(true)
    addResults(await window.api.docs.add(paths))
    setReading(false)
  }
  const removeDoc = (id: string): void => {
    window.api.docs.remove(id)
    setDocs((d) => d.filter((x) => x.id !== id))
  }
  // closing without generating forgets the documents
  const cancel = (): void => {
    for (const d of docs) window.api.docs.remove(d.id)
    onClose()
  }

  const go = async (): Promise<void> => {
    const ui = useUi.getState()
    onClose()
    ui.setBusy(docs.length ? `Claude is reading ${docs.length === 1 ? 'your document' : `${docs.length} documents`} and writing ${count} slides…` : `Claude is writing ${count} slides…`)
    const r = await window.api.ai.deck(prompt, count, docs.map((d) => d.id))
    ui.setBusy(null)
    for (const d of docs) window.api.docs.remove(d.id)
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
    <Modal title="Generate a deck with Claude" onClose={cancel}>
      {notReady && (
        <div className="callout">
          <KeyRound size={16} />
          {engine.provider === 'claude-code' ? 'Claude Code was not found on this computer.' : 'Add your Anthropic API key to use AI features.'}
          <button className="link" onClick={() => useUi.getState().open('settings')}>
            Open Settings
          </button>
        </div>
      )}
      <label className="field-label">What is your presentation about?</label>
      <textarea
        className="ai-prompt"
        autoFocus
        rows={docs.length ? 3 : 6}
        value={prompt}
        placeholder={
          docs.length
            ? 'Optional: who is the audience, what should the deck focus on, how long is the talk?'
            : 'Paste notes, an outline – or just describe the talk and the audience. You can also attach documents below.'
        }
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && (prompt.trim() || docs.length)) go()
        }}
      />
      <div
        className={'doc-drop' + (dragOver ? ' over' : '')}
        onDragOver={(e) => (e.preventDefault(), setDragOver(true))}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          drop(e.dataTransfer.files)
        }}
      >
        {docs.map((d) => (
          <div key={d.id} className="doc-chip" title={d.warning}>
            <FileText size={15} />
            <div>
              <strong>{d.name}</strong>
              <span>
                {d.pages ? `${d.pages} ${d.kind === 'pptx' ? 'slides' : 'pages'} · ` : ''}
                {d.chars >= 1000 ? `${Math.round(d.chars / 1000)}k` : d.chars} characters
                {d.warning && <em> · {d.warning}</em>}
              </span>
            </div>
            <button className="icon-btn xs" onClick={() => removeDoc(d.id)} title="Remove">
              <X size={12} />
            </button>
          </div>
        ))}
        <button className="btn sm ghost" onClick={pick} disabled={reading}>
          {reading ? <Loader2 size={14} className="spin" /> : <Paperclip size={14} />} {reading ? 'Reading…' : 'Attach documents'}
        </button>
        <span className="hint">PDF, Word, PowerPoint, text or Markdown – or drop files here</span>
      </div>
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
        <span className="hint">{engineLabel(engine)} · Ctrl+Enter</span>
        <div className="spacer" />
        <button className="btn primary" disabled={(!prompt.trim() && !docs.length) || notReady || reading} onClick={go}>
          <Sparkles size={16} /> Generate
        </button>
      </div>
    </Modal>
  )
}

function engineLabel(e: EngineStatus | null): string {
  if (!e) return ''
  if (e.provider === 'claude-code') return `Uses your local Claude Code${e.claudeModel ? ` (${e.claudeModel})` : ''}`
  return 'Uses the Anthropic API (Claude Opus 5.5)'
}

const CLAUDE_MODELS = [
  { id: '', label: 'Default' },
  { id: 'opus', label: 'Opus' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'haiku', label: 'Haiku' }
]

function SettingsDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const [st, setSt] = useState<EngineStatus | null>(null)
  const [key, setKey] = useState('')
  const [path, setPath] = useState('')
  const [testing, setTesting] = useState<string | null>(null)
  useEffect(() => {
    window.api.getSettings().then((s) => {
      setSt(s)
      setPath(s.claudePath)
    })
  }, [])
  const update = async (patch: Parameters<typeof window.api.setEngine>[0]): Promise<void> => {
    setTesting(null)
    setSt(await window.api.setEngine(patch))
  }
  const saveKey = async (): Promise<void> => {
    await window.api.setApiKey(key)
    setKey('')
    setSt(await window.api.getSettings())
    useUi.getState().toast({ kind: 'success', text: key ? 'API key saved' : 'API key removed' })
  }
  const test = async (): Promise<void> => {
    setTesting('Testing…')
    const r = await window.api.ai.test()
    setTesting(r.ok ? `✓ Works – Claude answered: “${r.data}”` : `✗ ${r.error}`)
  }
  const notes = async (): Promise<void> => {
    const ui = useUi.getState()
    onClose()
    ui.setBusy('Writing speaker notes…')
    const r = await window.api.ai.notes(useStore.getState().deck)
    ui.setBusy(null)
    if (!r.ok) return ui.toast({ kind: 'error', text: r.error }, 8000)
    const s = useStore.getState()
    s.setDeck({ ...s.deck, slides: s.deck.slides.map((sl, i) => ({ ...sl, notes: r.data[i] ?? sl.notes })) })
    ui.toast({ kind: 'success', text: 'Speaker notes written for every slide' })
  }
  if (!st) return <Modal title="Settings" onClose={onClose}>{null}</Modal>

  return (
    <Modal title="Settings" onClose={onClose}>
      <label className="field-label">AI engine</label>
      <div className="engine-options">
        <button className={'engine' + (st.provider === 'claude-code' ? ' on' : '')} onClick={() => update({ provider: 'claude-code' })}>
          <Terminal size={18} />
          <div>
            <strong>Claude Code (local)</strong>
            <span>Uses your Claude Code login – no API key needed</span>
          </div>
        </button>
        <button className={'engine' + (st.provider === 'api' ? ' on' : '')} onClick={() => update({ provider: 'api' })}>
          <KeyRound size={18} />
          <div>
            <strong>Anthropic API key</strong>
            <span>Pay-as-you-go via the Claude API</span>
          </div>
        </button>
      </div>

      {st.provider === 'claude-code' ? (
        <div className="engine-panel">
          {st.claude.found ? (
            <p className="status ok">
              <CheckCircle2 size={15} /> Found {st.claude.version} <code>{st.claude.path}</code>
            </p>
          ) : (
            <p className="status bad">
              <AlertTriangle size={15} /> Claude Code was not found. Install it from claude.com/claude-code, or enter its path below.
            </p>
          )}
          <label className="field-label">Model</label>
          <div className="seg small">
            {CLAUDE_MODELS.map((m) => (
              <button key={m.id} className={st.claudeModel === m.id ? 'on' : ''} onClick={() => update({ claudeModel: m.id })}>
                {m.label}
              </button>
            ))}
          </div>
          <label className="field-label">Custom path to the claude executable (optional)</label>
          <div className="row tight">
            <input value={path} placeholder="Auto-detect" onChange={(e) => setPath(e.target.value)} spellCheck={false} />
            <button className="btn sm" onClick={() => update({ claudePath: path.trim() })}>
              Apply
            </button>
          </div>
          <p className="hint">
            Claude Code runs with all tools, plugins and MCP servers disabled, in an empty folder – it can only write slide text. Usage counts toward your
            Claude plan.
          </p>
        </div>
      ) : (
        <div className="engine-panel">
          <label className="field-label">Anthropic API key {st.keyHint && <span className="hint">(current: {st.keyHint})</span>}</label>
          <div className="row tight">
            <input type="password" value={key} placeholder="sk-ant-…" onChange={(e) => setKey(e.target.value)} />
            <button className="btn sm" onClick={saveKey}>
              Save key
            </button>
          </div>
          <p className="hint">
            Stored encrypted on this computer and only sent to the Anthropic API. Save an empty field to remove it. Without a key, the app falls back to
            the ANTHROPIC_API_KEY environment variable.
          </p>
        </div>
      )}

      <div className="row">
        <button className="btn sm" onClick={test} disabled={!st.ready || testing === 'Testing…'}>
          {testing === 'Testing…' ? <Loader2 size={14} className="spin" /> : <Zap size={14} />} Test connection
        </button>
        {testing && <span className={'hint' + (testing.startsWith('✗') ? ' err' : '')}>{testing}</span>}
      </div>

      <div className="modal-foot">
        <button className="btn" onClick={notes} disabled={!st.ready}>
          <Sparkles size={15} /> Write speaker notes for whole deck
        </button>
        <div className="spacer" />
        <button className="btn primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  )
}
