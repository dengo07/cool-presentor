import { useEffect, useRef, useState } from 'react'
import { Brain, FileText, Loader2, Paperclip, Send, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import type { DocInfo, DocResult } from '../../../preload'
import { applyOps, describeDeckForAi } from '@core/assistant'
import type { Deck } from '@core/model'
import { useStore } from '../store'
import { useUi } from '../ui'

// ---------------------------------------------------------------------------
// Chat with Claude about this deck. It sees the whole deck, the current slide,
// earlier messages, remembered facts and attached documents, and answers with
// targeted edits (one undo step) instead of regenerating content.
// ---------------------------------------------------------------------------

const SUGGESTIONS = [
  'Make this slide more visual',
  'Check the whole deck for inconsistencies and fix them',
  'Turn this slide into a diagram',
  'Shorten every slide title, keep the meaning'
]

export function AssistantPanel(): React.JSX.Element {
  const assistant = useStore((s) => s.assistant)
  const current = useStore((s) => s.current)
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<DocInfo[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  // the deck right after the latest AI edit – "Undo" only while nothing changed since
  const [applied, setApplied] = useState<{ deck: Deck; turn: number } | null>(null)
  const deck = useStore((s) => s.deck)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' })
  }, [assistant.history.length, busy])

  const addResults = (results: DocResult[]): void => {
    setPending((p) => [...p, ...results.filter((r): r is DocInfo => 'id' in r)])
    for (const r of results) if ('error' in r) useUi.getState().toast({ kind: 'error', text: `${r.name}: ${r.error}` }, 7000)
  }
  const attach = async (): Promise<void> => addResults(await window.api.docs.pick())
  const drop = async (files: FileList): Promise<void> => {
    const paths = [...files].map((f) => window.api.docs.pathFor(f)).filter(Boolean)
    if (paths.length) addResults(await window.api.docs.add(paths))
  }

  const send = async (text = input): Promise<void> => {
    const message = text.trim()
    if (!message || busy) return
    const st = useStore.getState()
    setInput('')
    setError(null)
    setBusy(true)

    // attached files become part of this deck's memory
    const docs = (await Promise.all(pending.map((d) => window.api.docs.read(d.id)))).filter((d) => d !== null)
    for (const d of pending) window.api.docs.remove(d.id)
    setPending([])
    const before = st.assistant
    const at = new Date().toISOString()
    st.setAssistant((a) => ({
      ...a,
      docs: [...a.docs.filter((x) => !docs.some((d) => d.name === x.name)), ...docs],
      history: [...a.history, { role: 'user', at, text: message + (docs.length ? `\n📎 ${docs.map((d) => d.name).join(', ')}` : '') }]
    }))

    const a = useStore.getState().assistant
    const slide = st.deck.slides[st.current]
    const r = await window.api.ai.assist({
      message,
      deck: describeDeckForAi(st.deck),
      current: st.current,
      currentId: slide.id,
      history: before.history,
      memory: a.memory,
      docs: a.docs.map(({ id: _id, ...d }) => d)
    })
    setBusy(false)
    if (!r.ok) {
      setError(r.error)
      return
    }

    // apply to the latest deck (the user may have kept editing while Claude worked)
    const now = useStore.getState()
    const res = applyOps(now.deck, r.data.operations)
    if (res.changes.length) {
      now.setDeck(res.deck)
      if (res.focus !== undefined) now.select(res.focus)
    }
    const changes = [...res.changes, ...res.errors.map((e) => `⚠ skipped ${e}`)]
    now.setAssistant((x) => ({
      ...x,
      memory: [...x.memory, ...(r.data.remember ?? []).filter((m) => m.trim() && !x.memory.includes(m.trim())).map((m) => m.trim())],
      history: [...x.history, { role: 'assistant', at: new Date().toISOString(), text: r.data.reply, changes: changes.length ? changes : undefined }]
    }))
    setApplied(res.changes.length ? { deck: useStore.getState().deck, turn: useStore.getState().assistant.history.length - 1 } : null)
  }

  const undo = (): void => {
    if (!applied || useStore.getState().deck !== applied.deck) return
    useStore.temporal.getState().undo()
    useStore.getState().select(useStore.getState().current)
    setApplied(null)
    useUi.getState().toast({ kind: 'info', text: 'Reverted the assistant’s changes' }, 2500)
  }

  const history = assistant.history
  return (
    <div
      className={'assistant' + (dragOver ? ' over' : '')}
      onDragOver={(e) => (e.preventDefault(), setDragOver(true))}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        drop(e.dataTransfer.files)
      }}
    >
      <div className="asst-memory-bar">
        <button className="link" onClick={() => setMemoryOpen((o) => !o)} title="What the assistant remembers about this deck">
          <Brain size={13} /> Memory · {history.length} messages · {assistant.memory.length} facts · {assistant.docs.length} files
        </button>
      </div>
      {memoryOpen && <MemoryView onClose={() => setMemoryOpen(false)} />}

      <div className="asst-list" ref={list}>
        {history.length === 0 && (
          <div className="asst-empty">
            <Sparkles size={20} />
            <p>
              Ask for changes to this slide or the whole deck. The assistant edits what is there instead of starting over, and remembers this
              conversation and your files with the deck.
            </p>
            {SUGGESTIONS.map((s) => (
              <button key={s} className="chip" onClick={() => send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}
        {history.map((t, i) => (
          <div key={i} className={'msg ' + t.role}>
            <div className="bubble">{t.text}</div>
            {t.changes && (
              <details className="changes" open={i === history.length - 1}>
                <summary>
                  {t.changes.filter((c) => !c.startsWith('⚠')).length} changes
                  {applied?.turn === i && deck === applied.deck && (
                    <button className="btn xs ghost" onClick={(e) => (e.preventDefault(), undo())}>
                      <Undo2 size={12} /> Undo
                    </button>
                  )}
                </summary>
                <ul>
                  {t.changes.map((c, j) => (
                    <li key={j} className={c.startsWith('⚠') ? 'warn' : ''}>
                      {c}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ))}
        {busy && (
          <div className="msg assistant">
            <div className="bubble thinking">
              <Loader2 size={14} className="spin" /> Reading the deck…
            </div>
          </div>
        )}
        {error && <div className="asst-error">{error}</div>}
      </div>

      <div className="asst-compose">
        {pending.length > 0 && (
          <div className="asst-pending">
            {pending.map((d) => (
              <span key={d.id} className="doc-pill" title={d.warning}>
                <FileText size={12} /> {d.name}
                <button
                  className="icon-btn xs"
                  onClick={() => {
                    window.api.docs.remove(d.id)
                    setPending((p) => p.filter((x) => x.id !== d.id))
                  }}
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea
          rows={3}
          value={input}
          placeholder={`Ask about slide ${current + 1} or the whole deck…`}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              send()
            }
          }}
        />
        <div className="row tight">
          <button className="icon-btn" title="Attach documents (kept with this deck)" onClick={attach}>
            <Paperclip size={15} />
          </button>
          <span className="hint">Enter to send</span>
          <div className="spacer" />
          <button className="btn sm ai" disabled={!input.trim() || busy} onClick={() => send()}>
            <Send size={14} /> Send
          </button>
        </div>
      </div>
    </div>
  )
}

function MemoryView({ onClose }: { onClose: () => void }): React.JSX.Element {
  const a = useStore((s) => s.assistant)
  const setAssistant = useStore((s) => s.setAssistant)
  return (
    <div className="asst-memory">
      <div className="row tight">
        <strong>Remembered for this deck</strong>
        <div className="spacer" />
        <button className="icon-btn xs" onClick={onClose}>
          <X size={12} />
        </button>
      </div>
      {a.memory.length === 0 && a.docs.length === 0 && <p className="hint">Nothing yet. Facts and files you share are kept here, inside the .cpres file.</p>}
      {a.memory.map((m, i) => (
        <div key={i} className="mem-item">
          <span>{m}</span>
          <button className="icon-btn xs" title="Forget" onClick={() => setAssistant((x) => ({ ...x, memory: x.memory.filter((_, j) => j !== i) }))}>
            <X size={11} />
          </button>
        </div>
      ))}
      {a.docs.map((d) => (
        <div key={d.id} className="mem-item">
          <span>
            <FileText size={12} /> {d.name} <em>{Math.round(d.text.length / 1000)}k characters</em>
          </span>
          <button className="icon-btn xs" title="Remove file" onClick={() => setAssistant((x) => ({ ...x, docs: x.docs.filter((y) => y.id !== d.id) }))}>
            <X size={11} />
          </button>
        </div>
      ))}
      <div className="row tight">
        <button className="btn xs ghost" disabled={!a.history.length} onClick={() => setAssistant((x) => ({ ...x, history: [] }))}>
          Clear conversation
        </button>
        <button
          className="btn xs ghost danger"
          onClick={() => {
            if (window.confirm('Forget the conversation, remembered facts and files for this deck?')) setAssistant(() => ({ history: [], memory: [], docs: [] }))
          }}
        >
          <Trash2 size={12} /> Forget everything
        </button>
      </div>
    </div>
  )
}
