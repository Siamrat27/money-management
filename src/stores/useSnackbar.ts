import { create } from 'zustand'

const AUTO_DISMISS_MS = 5000

interface SnackbarStore {
  message: string | null
  undoFn: (() => void | Promise<void>) | null
  timeoutId: number | null
  show: (message: string, undoFn?: () => void | Promise<void>) => void
  dismiss: () => void
}

export const useSnackbar = create<SnackbarStore>((set, get) => ({
  message: null,
  undoFn: null,
  timeoutId: null,

  show: (message, undoFn) => {
    const prev = get().timeoutId
    if (prev) clearTimeout(prev)
    const timeoutId = window.setTimeout(
      () => set({ message: null, undoFn: null, timeoutId: null }),
      AUTO_DISMISS_MS,
    )
    set({ message, undoFn: undoFn ?? null, timeoutId })
  },

  dismiss: () => {
    const prev = get().timeoutId
    if (prev) clearTimeout(prev)
    set({ message: null, undoFn: null, timeoutId: null })
  },
}))
