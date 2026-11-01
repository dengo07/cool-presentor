import { contextBridge, ipcRenderer } from 'electron'
import type { Deck, Slide, Block } from '../core/model'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

const api = {
  openDeck: (): Promise<{ path: string; json: string } | null> => ipcRenderer.invoke('deck:open'),
  saveDeck: (json: string, path: string | null, title: string): Promise<string | null> =>
    ipcRenderer.invoke('deck:save', json, path, title),
  autosave: (json: string): Promise<void> => ipcRenderer.invoke('deck:autosave', json),
  restore: (): Promise<string | null> => ipcRenderer.invoke('deck:restore'),
  exportPptx: (bytes: Uint8Array, title: string): Promise<string | null> => ipcRenderer.invoke('pptx:export', bytes, title),
  openPath: (path: string): Promise<string> => ipcRenderer.invoke('shell:open', path),
  revealPath: (path: string): Promise<void> => ipcRenderer.invoke('shell:reveal', path),
  setDirty: (dirty: boolean): void => ipcRenderer.send('app:dirty', dirty),
  setTitle: (path: string | null, title: string): void => ipcRenderer.send('app:title', path, title),
  getSettings: (): Promise<{ hasKey: boolean; keyHint: string }> => ipcRenderer.invoke('settings:get'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('settings:setKey', key),
  ai: {
    deck: (prompt: string, count: number): Promise<Result<{ title: string; slides: Slide[] }>> =>
      ipcRenderer.invoke('ai:deck', prompt, count),
    slide: (slide: Slide, instruction: string, deckTitle: string): Promise<Result<{ blocks: Block[]; notes: string }>> =>
      ipcRenderer.invoke('ai:slide', slide, instruction, deckTitle),
    notes: (deck: Deck): Promise<Result<string[]>> => ipcRenderer.invoke('ai:notes', deck),
    rewrite: (text: string, instruction: string): Promise<Result<string>> => ipcRenderer.invoke('ai:rewrite', text, instruction)
  },
  onMenu: (cb: (action: string) => void): (() => void) => {
    const fn = (_e: unknown, action: string): void => cb(action)
    ipcRenderer.on('menu', fn)
    return () => ipcRenderer.removeListener('menu', fn)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
