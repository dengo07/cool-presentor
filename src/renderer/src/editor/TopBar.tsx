import { Download, ListTree, MessageSquare, Palette, Play, Settings, Sparkles, Undo2, Redo2, LayoutGrid } from 'lucide-react'
import { useStore } from '../store'
import { useUi } from '../ui'
import { exportDeck } from '../lib/export'

export function TopBar(): React.JSX.Element {
  const title = useStore((s) => s.deck.title)
  const setTitle = useStore((s) => s.setTitle)
  const view = useStore((s) => s.view)
  const setView = useStore((s) => s.setView)
  const dirty = useStore((s) => s.dirty)
  const ui = useUi()
  const t = useStore.temporal.getState()

  return (
    <header className="topbar">
      <div className="brand">
        <span className="logo" />
        <span>Cool Presentor</span>
      </div>
      <input className="deck-title" value={title} onChange={(e) => setTitle(e.target.value)} spellCheck={false} />
      {dirty && <span className="dirty-dot" title="Unsaved changes" />}
      <div className="spacer" />
      <button className="icon-btn" title="Undo (Ctrl+Z)" onClick={() => t.undo()}>
        <Undo2 size={16} />
      </button>
      <button className="icon-btn" title="Redo (Ctrl+Shift+Z)" onClick={() => t.redo()}>
        <Redo2 size={16} />
      </button>
      <div className="seg">
        <button className={view === 'edit' ? 'on' : ''} onClick={() => setView('edit')} title="Visual editor">
          <LayoutGrid size={15} /> Slides
        </button>
        <button className={view === 'outline' ? 'on' : ''} onClick={() => setView('outline')} title="Write the whole deck as text (Ctrl+Shift+O)">
          <ListTree size={15} /> Outline
        </button>
      </div>
      <button className="btn" onClick={() => ui.open('themes')} title="Themes (Ctrl+T)">
        <Palette size={16} /> Theme
      </button>
      <button className="btn ai" onClick={() => ui.open('ai')}>
        <Sparkles size={16} /> Generate
      </button>
      <button
        className={'btn' + (view === 'edit' && ui.panel === 'assistant' ? ' on' : '')}
        title="Chat with Claude about this deck"
        onClick={() => {
          setView('edit')
          ui.setPanel(ui.panel === 'assistant' && view === 'edit' ? 'edit' : 'assistant')
        }}
      >
        <MessageSquare size={16} /> Assistant
      </button>
      <button className="btn" onClick={() => ui.present(useStore.getState().current)} title="Present (F5)">
        <Play size={16} /> Present
      </button>
      <button className="btn primary" onClick={() => exportDeck(useStore.getState().deck)} title="Export .pptx (Ctrl+E)">
        <Download size={16} /> Export .pptx
      </button>
      <button className="icon-btn" title="Settings" onClick={() => ui.open('settings')}>
        <Settings size={16} />
      </button>
    </header>
  )
}
