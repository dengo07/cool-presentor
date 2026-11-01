import { app, BrowserWindow, dialog, ipcMain, Menu, safeStorage, shell } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describeSlide, aiDeckToSlides, aiSlideToBlocks } from '../core/ai-schema'
import type { Deck, Slide } from '../core/model'
import { friendlyError, generateDeck, improveSlide, rewriteText, setApiKey, speakerNotes } from './ai'

const here = fileURLToPath(new URL('.', import.meta.url))
let win: BrowserWindow | null = null
let dirty = false

// ---------------------------------------------------------------- settings
interface Settings {
  apiKey?: string // encrypted (base64) when safeStorage is available
  apiKeyPlain?: boolean
}
const settingsPath = (): string => join(app.getPath('userData'), 'settings.json')

function loadSettings(): Settings {
  try {
    return existsSync(settingsPath()) ? JSON.parse(readFileSync(settingsPath(), 'utf8')) : {}
  } catch {
    return {}
  }
}
function storedKey(): string | undefined {
  const s = loadSettings()
  if (!s.apiKey) return undefined
  if (s.apiKeyPlain) return s.apiKey
  try {
    return safeStorage.decryptString(Buffer.from(s.apiKey, 'base64'))
  } catch {
    return undefined
  }
}
function saveKey(key: string): void {
  const s: Settings = {}
  if (key) {
    if (safeStorage.isEncryptionAvailable()) s.apiKey = safeStorage.encryptString(key).toString('base64')
    else {
      s.apiKey = key
      s.apiKeyPlain = true
    }
  }
  writeFileSync(settingsPath(), JSON.stringify(s), { mode: 0o600 })
  setApiKey(key)
}

// ---------------------------------------------------------------- window
function createWindow(): void {
  win = new BrowserWindow({
    width: 1480,
    height: 920,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    backgroundColor: '#0d0e12',
    title: 'Cool Presentor',
    webPreferences: {
      preload: join(here, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true
    }
  })
  win.on('ready-to-show', () => win?.show())
  win.on('close', (e) => {
    if (!dirty || !win) return
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Discard changes', 'Cancel'],
      defaultId: 1,
      message: 'You have unsaved changes.',
      detail: 'Your work is also autosaved and will be restored next time.'
    })
    if (choice === 1) e.preventDefault()
  })
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  if (process.env['ELECTRON_RENDERER_URL']) win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  else win.loadFile(join(here, '../renderer/index.html'))
  if (process.env['CP_SNAPSHOT']) snapshotMode(win)
}

/**
 * Dev tool: CP_SNAPSHOT=out.png [CP_SNAPSHOT_STEPS=steps.json] runs scripted
 * steps in the page ([{ js, wait, shot }]), captures screenshots, then quits.
 */
function snapshotMode(w: BrowserWindow): void {
  w.webContents.once('did-finish-load', async () => {
    const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))
    await sleep(2500)
    const stepsFile = process.env['CP_SNAPSHOT_STEPS']
    const steps: { js?: string; wait?: number; shot?: string; saveTo?: string }[] = stepsFile ? JSON.parse(readFileSync(stepsFile, 'utf8')) : []
    steps.push({ shot: process.env['CP_SNAPSHOT'] })
    for (const s of steps) {
      if (s.js) {
        try {
          const r = await w.webContents.executeJavaScript(s.js, true)
          if (s.saveTo && typeof r === 'string') writeFileSync(s.saveTo, Buffer.from(r, 'base64'))
          else if (r !== undefined) console.log('[snapshot]', JSON.stringify(r).slice(0, 2000))
        } catch (e) {
          console.log('[snapshot] error', e)
        }
      }
      await sleep(s.wait ?? 400)
      if (s.shot) writeFileSync(s.shot, (await w.webContents.capturePage()).toPNG())
    }
    dirty = false
    app.quit()
  })
}

function send(action: string): void {
  win?.webContents.send('menu', action)
}

function buildMenu(): void {
  const isMac = process.platform === 'darwin'
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'New Deck', accelerator: 'CmdOrCtrl+N', click: () => send('new') },
        { label: 'Open…', accelerator: 'CmdOrCtrl+O', click: () => send('open') },
        { type: 'separator' },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => send('save') },
        { label: 'Save As…', accelerator: 'CmdOrCtrl+Shift+S', click: () => send('saveAs') },
        { type: 'separator' },
        { label: 'Export PowerPoint…', accelerator: 'CmdOrCtrl+E', click: () => send('export') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    { role: 'editMenu' },
    {
      label: 'Slide',
      submenu: [
        { label: 'New Slide', accelerator: 'CmdOrCtrl+Enter', click: () => send('newSlide') },
        { label: 'Duplicate Slide (for Morph)', accelerator: 'CmdOrCtrl+D', click: () => send('duplicate') },
        { label: 'Shuffle Layout', accelerator: 'CmdOrCtrl+L', click: () => send('shuffle') },
        { type: 'separator' },
        { label: 'Present', accelerator: 'F5', click: () => send('present') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle Outline Mode', accelerator: 'CmdOrCtrl+Shift+O', click: () => send('outline') },
        { label: 'Themes…', accelerator: 'CmdOrCtrl+T', click: () => send('themes') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { role: 'togglefullscreen' }
      ]
    }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

// ---------------------------------------------------------------- IPC
type Result<T> = { ok: true; data: T } | { ok: false; error: string }
async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (e) {
    console.error(e)
    return { ok: false, error: friendlyError(e) }
  }
}

function registerIpc(): void {
  ipcMain.handle('deck:open', async () => {
    const r = await dialog.showOpenDialog(win!, {
      filters: [{ name: 'Cool Presentor deck', extensions: ['cpres', 'json'] }],
      properties: ['openFile']
    })
    if (r.canceled || !r.filePaths[0]) return null
    return { path: r.filePaths[0], json: await readFile(r.filePaths[0], 'utf8') }
  })

  ipcMain.handle('deck:save', async (_e, json: string, path: string | null, title: string) => {
    let target = path
    if (!target) {
      const r = await dialog.showSaveDialog(win!, {
        defaultPath: `${title.replace(/[\\/:*?"<>|]/g, '-') || 'deck'}.cpres`,
        filters: [{ name: 'Cool Presentor deck', extensions: ['cpres'] }]
      })
      if (r.canceled || !r.filePath) return null
      target = r.filePath
    }
    await writeFile(target, json, 'utf8')
    return target
  })

  ipcMain.handle('pptx:export', async (_e, bytes: Uint8Array, title: string) => {
    const r = await dialog.showSaveDialog(win!, {
      defaultPath: `${title.replace(/[\\/:*?"<>|]/g, '-') || 'deck'}.pptx`,
      filters: [{ name: 'PowerPoint', extensions: ['pptx'] }]
    })
    if (r.canceled || !r.filePath) return null
    await writeFile(r.filePath, Buffer.from(bytes))
    return r.filePath
  })

  const autosavePath = (): string => join(app.getPath('userData'), 'autosave.cpres')
  ipcMain.handle('deck:autosave', (_e, json: string) => writeFile(autosavePath(), json, 'utf8'))
  ipcMain.handle('deck:restore', async () => (existsSync(autosavePath()) ? readFile(autosavePath(), 'utf8') : null))

  ipcMain.handle('shell:open', (_e, path: string) => shell.openPath(path))
  ipcMain.handle('shell:reveal', (_e, path: string) => shell.showItemInFolder(path))
  ipcMain.on('app:dirty', (_e, d: boolean) => (dirty = d))
  ipcMain.on('app:title', (_e, path: string | null, title: string) => {
    win?.setTitle(`${path ? basename(path) : title} — Cool Presentor`)
  })

  ipcMain.handle('settings:get', () => {
    const k = storedKey() ?? ''
    return { hasKey: !!k || !!process.env['ANTHROPIC_API_KEY'], keyHint: k ? `…${k.slice(-4)}` : process.env['ANTHROPIC_API_KEY'] ? 'from environment' : '' }
  })
  ipcMain.handle('settings:setKey', (_e, key: string) => saveKey(key.trim()))

  ipcMain.handle('ai:deck', (_e, prompt: string, count: number) =>
    wrap(async () => {
      const d = await generateDeck(prompt, count)
      return { title: d.title.replace(/\*/g, ''), slides: aiDeckToSlides(d) }
    })
  )
  ipcMain.handle('ai:slide', (_e, slide: Slide, instruction: string, deckTitle: string) =>
    wrap(async () => {
      const s = await improveSlide(describeSlide(slide), instruction, deckTitle)
      return { blocks: aiSlideToBlocks(s, slide.blocks), notes: s.notes }
    })
  )
  ipcMain.handle('ai:notes', (_e, deck: Deck) =>
    wrap(async () => {
      const outline = deck.slides.map((s, i) => `Slide ${i + 1}: ${describeSlide(s)}`).join('\n')
      return speakerNotes(outline)
    })
  )
  ipcMain.handle('ai:rewrite', (_e, text: string, instruction: string) => wrap(() => rewriteText(text, instruction)))
}

app.whenReady().then(() => {
  setApiKey(storedKey())
  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
