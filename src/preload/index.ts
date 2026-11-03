import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { AssistantDoc, AssistantTurn, Deck, Slide, Block } from '../core/model'
import type { AiAssist } from '../core/ai-schema'

type Result<T> = { ok: true; data: T } | { ok: false; error: string }

export interface DocInfo {
  id: string
  name: string
  kind: 'pdf' | 'docx' | 'pptx' | 'text'
  pages?: number
  chars: number
  warning?: string
}
export type DocResult = DocInfo | { name: string; error: string }

export interface EngineStatus {
  provider: 'claude-code' | 'api'
  /** the chosen engine is usable */
  ready: boolean
  hasKey: boolean
  keyHint: string
  claude: { found: boolean; path?: string; version?: string }
  claudeModel: string
  claudePath: string
}

export interface AssistRequest {
  message: string
  deck: string
  current: number
  currentId: string
  history: AssistantTurn[]
  memory: string[]
  docs: Omit<AssistantDoc, 'id'>[]
}

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
  getSettings: (): Promise<EngineStatus> => ipcRenderer.invoke('settings:get'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('settings:setKey', key),
  setEngine: (patch: { provider?: 'claude-code' | 'api'; claudeModel?: string; claudePath?: string }): Promise<EngineStatus> =>
    ipcRenderer.invoke('settings:setEngine', patch),
  ai: {
    deck: (prompt: string, count: number, docIds: string[] = []): Promise<Result<{ title: string; slides: Slide[] }>> =>
      ipcRenderer.invoke('ai:deck', prompt, count, docIds),
    slide: (slide: Slide, instruction: string, deckTitle: string): Promise<Result<{ blocks: Block[]; notes: string }>> =>
      ipcRenderer.invoke('ai:slide', slide, instruction, deckTitle),
    notes: (deck: Deck): Promise<Result<string[]>> => ipcRenderer.invoke('ai:notes', deck),
    rewrite: (text: string, instruction: string): Promise<Result<string>> => ipcRenderer.invoke('ai:rewrite', text, instruction),
    test: (): Promise<Result<string>> => ipcRenderer.invoke('ai:test'),
    assist: (req: AssistRequest): Promise<Result<AiAssist>> => ipcRenderer.invoke('ai:assist', req)
  },
  docs: {
    pick: (): Promise<DocResult[]> => ipcRenderer.invoke('docs:pick'),
    add: (paths: string[]): Promise<DocResult[]> => ipcRenderer.invoke('docs:add', paths),
    remove: (id: string): Promise<void> => ipcRenderer.invoke('docs:remove', id),
    read: (id: string): Promise<AssistantDoc | null> => ipcRenderer.invoke('docs:read', id),
    /** Absolute path of a dropped File (needed since Electron 32). */
    pathFor: (file: File): string => webUtils.getPathForFile(file)
  },
  onMenu: (cb: (action: string) => void): (() => void) => {
    const fn = (_e: unknown, action: string): void => cb(action)
    ipcRenderer.on('menu', fn)
    return () => ipcRenderer.removeListener('menu', fn)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
