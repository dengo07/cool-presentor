import type { Deck } from '@core/model'
import { buildDeck } from '@core/layout/engine'
import { exportPptx } from '@core/export/pptx'
import { canvasMeasurer, loadFontBytes } from './fonts'
import { useUi } from '../ui'

export async function exportDeck(deck: Deck): Promise<void> {
  const ui = useUi.getState()
  ui.setBusy('Building your PowerPoint…')
  try {
    const scenes = buildDeck(deck, canvasMeasurer)
    const bytes = await exportPptx(deck, scenes, { loadFont: loadFontBytes })
    ui.setBusy(null)
    const path = await window.api.exportPptx(bytes, deck.title)
    if (path)
      ui.toast(
        {
          kind: 'success',
          text: 'Exported ' + path.split(/[\\/]/).pop(),
          actions: [
            { label: 'Open', run: () => window.api.openPath(path) },
            { label: 'Show in folder', run: () => window.api.revealPath(path) }
          ]
        },
        9000
      )
  } catch (e) {
    console.error(e)
    ui.toast({ kind: 'error', text: 'Export failed: ' + (e instanceof Error ? e.message : String(e)) })
  } finally {
    ui.setBusy(null)
  }
}
