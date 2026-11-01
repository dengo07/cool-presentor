import { create } from 'zustand'

export type Modal = null | 'themes' | 'ai' | 'settings'

export interface Toast {
  id: number
  text: string
  kind?: 'info' | 'error' | 'success'
  actions?: { label: string; run: () => void }[]
}

interface Ui {
  fontsReady: boolean
  modal: Modal
  presenting: number | null
  busy: string | null
  toasts: Toast[]
  setFontsReady(): void
  open(m: Modal): void
  present(from: number | null): void
  setBusy(b: string | null): void
  toast(t: Omit<Toast, 'id'>, ms?: number): void
  dismiss(id: number): void
}

let tid = 0

export const useUi = create<Ui>()((set, get) => ({
  fontsReady: false,
  modal: null,
  presenting: null,
  busy: null,
  toasts: [],
  setFontsReady: () => set({ fontsReady: true }),
  open: (modal) => set({ modal }),
  present: (presenting) => set({ presenting }),
  setBusy: (busy) => set({ busy }),
  toast: (t, ms = 4500) => {
    const id = ++tid
    set({ toasts: [...get().toasts, { ...t, id }] })
    if (ms > 0) setTimeout(() => get().dismiss(id), ms)
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) })
}))
