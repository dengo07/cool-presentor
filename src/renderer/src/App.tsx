import { useEffect } from 'react'
import { Loader2, X } from 'lucide-react'
import { newDeck, parseDeck } from '@core/model'
import { sampleDeck } from '@core/sample'
import { useStore } from './store'
import { useUi } from './ui'
import { installFonts, clearMeasureCache } from './lib/fonts'
import { useScenes } from './lib/scenes'
import { exportDeck } from './lib/export'
import { TopBar } from './editor/TopBar'
import { SlideStrip } from './editor/SlideStrip'
import { Stage } from './editor/Stage'
import { RightPanel } from './editor/Inspector'
import { OutlineEditor } from './editor/OutlineEditor'
import { Modals } from './editor/Modals'
import { PresentMode } from './editor/PresentMode'

async function save(as = false): Promise<void> {
  const st = useStore.getState()
  const path = await window.api.saveDeck(st.serialize(), as ? null : st.filePath, st.deck.title)
  if (path) {
    st.markSaved(path)
    useUi.getState().toast({ kind: 'success', text: 'Saved' }, 1800)
  }
}

async function open(): Promise<void> {
  const r = await window.api.openDeck()
  if (!r) return
  try {
    useStore.getState().load(parseDeck(JSON.parse(r.json)), r.path)
  } catch (e) {
    useUi.getState().toast({ kind: 'error', text: 'Could not open that file: ' + (e instanceof Error ? e.message : String(e)) })
  }
}

function runAction(action: string): void {
  const st = useStore.getState()
  const ui = useUi.getState()
  switch (action) {
    case 'new':
      st.load(newDeck(st.deck.themeId))
      break
    case 'open':
      open()
      break
    case 'save':
      save()
      break
    case 'saveAs':
      save(true)
      break
    case 'export':
      exportDeck(st.deck)
      break
    case 'newSlide':
      st.addSlide()
      break
    case 'duplicate':
      st.duplicateSlide(st.current)
      break
    case 'shuffle':
      st.shuffleLayout(st.current)
      break
    case 'present':
      ui.present(st.current)
      break
    case 'outline':
      st.setView(st.view === 'outline' ? 'edit' : 'outline')
      break
    case 'themes':
      ui.open(ui.modal === 'themes' ? null : 'themes')
      break
  }
}

const isTyping = (e: KeyboardEvent): boolean => {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable
}

// Debug/automation handle (used by the CP_SNAPSHOT dev harness).
;(window as unknown as Record<string, unknown>).__cp = {
  store: useStore,
  ui: useUi,
  exportBase64: async (): Promise<string> => {
    const { buildDeck } = await import('@core/layout/engine')
    const { exportPptx } = await import('@core/export/pptx')
    const { canvasMeasurer, loadFontBytes } = await import('./lib/fonts')
    const deck = useStore.getState().deck
    const bytes = await exportPptx(deck, buildDeck(deck, canvasMeasurer), { loadFont: loadFontBytes })
    let bin = ''
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return btoa(bin)
  }
}

export function App(): React.JSX.Element {
  const view = useStore((s) => s.view)
  const presenting = useUi((s) => s.presenting)
  const busy = useUi((s) => s.busy)
  const toasts = useUi((s) => s.toasts)
  const scenes = useScenes()

  // boot: fonts + restore last session
  useEffect(() => {
    installFonts().then(() => {
      clearMeasureCache()
      useUi.getState().setFontsReady()
    })
    window.api.restore().then((json) => {
      let deck = sampleDeck()
      try {
        if (json) deck = parseDeck(JSON.parse(json))
      } catch {
        /* fall back to the sample deck */
      }
      useStore.getState().load(deck)
    })
  }, [])

  // autosave + window title + dirty flag
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined
    return useStore.subscribe((s, prev) => {
      if (s.deck !== prev.deck || s.assistant !== prev.assistant) {
        clearTimeout(t)
        t = setTimeout(() => window.api.autosave(useStore.getState().serialize()), 800)
      }
      if (s.dirty !== prev.dirty) window.api.setDirty(s.dirty)
      if (s.filePath !== prev.filePath || s.deck.title !== prev.deck.title) window.api.setTitle(s.filePath, s.deck.title)
    })
  }, [])

  // menu + keyboard
  useEffect(() => window.api.onMenu(runAction), [])
  useEffect(() => {
    const k = (e: KeyboardEvent): void => {
      if (useUi.getState().presenting !== null) return
      const mod = e.ctrlKey || e.metaKey
      const st = useStore.getState()
      if (mod && e.key.toLowerCase() === 'z' && !isTyping(e)) {
        e.preventDefault()
        const t = useStore.temporal.getState()
        if (e.shiftKey) t.redo()
        else t.undo()
        // keep the selection valid after undo/redo
        st.select(useStore.getState().current)
      } else if (mod && e.key.toLowerCase() === 'y' && !isTyping(e)) {
        e.preventDefault()
        useStore.temporal.getState().redo()
      } else if (!isTyping(e) && !mod) {
        if (e.key === 'ArrowDown' || e.key === 'ArrowRight') st.select(st.current + 1)
        else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') st.select(st.current - 1)
        else if (e.key === 'Delete' && st.view === 'edit') st.removeSlide(st.current)
        else return
        e.preventDefault()
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [])

  return (
    <div className="app">
      <TopBar />
      <div className={'workspace mode-' + view}>
        {view === 'edit' ? <SlideStrip scenes={scenes} /> : <OutlineEditor />}
        <Stage scenes={scenes} />
        {view === 'edit' && <RightPanel />}
      </div>
      <Modals />
      {presenting !== null && scenes.length > 0 && <PresentMode scenes={scenes} start={presenting} />}
      {busy && (
        <div className="busy">
          <Loader2 className="spin" size={18} /> {busy}
        </div>
      )}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={'toast ' + (t.kind ?? 'info')}>
            <span>{t.text}</span>
            {t.actions?.map((a) => (
              <button key={a.label} className="link" onClick={a.run}>
                {a.label}
              </button>
            ))}
            <button className="icon-btn xs" onClick={() => useUi.getState().dismiss(t.id)}>
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
