import { create } from 'zustand'
import type { Page, SubPage } from '../types'

interface AppStore {
  page: Page
  subPage: SubPage
  darkMode: boolean
  setPage: (page: Page) => void
  setSubPage: (sub: SubPage) => void
  toggleDark: () => void
  editTransactionId: string | null
  setEditTransactionId: (id: string | null) => void
}

const stored = localStorage.getItem('pf-dark')
const prefersDark = stored ? stored === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches

if (prefersDark) document.documentElement.classList.add('dark')

export const useAppStore = create<AppStore>((set) => ({
  page: 'dashboard',
  subPage: null,
  darkMode: prefersDark,
  editTransactionId: null,
  setPage: (page) => set({ page, subPage: null }),
  setSubPage: (subPage) => set({ subPage }),
  setEditTransactionId: (id) => set({ editTransactionId: id }),
  toggleDark: () =>
    set((s) => {
      const next = !s.darkMode
      if (next) document.documentElement.classList.add('dark')
      else document.documentElement.classList.remove('dark')
      localStorage.setItem('pf-dark', String(next))
      return { darkMode: next }
    }),
}))
