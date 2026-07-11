import { create } from 'zustand'
import type { AppId, Page, SubPage } from '../types'

interface AppStore {
  app: AppId | null // which app is active; null shows the selector
  page: Page
  subPage: SubPage
  darkMode: boolean
  setApp: (app: AppId | null) => void
  setPage: (page: Page) => void
  setSubPage: (sub: SubPage) => void
  toggleDark: () => void
  editTransactionId: string | null
  setEditTransactionId: (id: string | null) => void
}

const stored = localStorage.getItem('pf-dark')
const prefersDark = stored ? stored === 'true' : window.matchMedia('(prefers-color-scheme: dark)').matches

if (prefersDark) document.documentElement.classList.add('dark')

const storedApp = localStorage.getItem('pf-app')
const initialApp: AppId | null = storedApp === 'money' || storedApp === 'health' ? storedApp : null

export const useAppStore = create<AppStore>((set) => ({
  app: initialApp,
  page: 'dashboard',
  subPage: null,
  darkMode: prefersDark,
  editTransactionId: null,
  setApp: (app) => {
    if (app) localStorage.setItem('pf-app', app)
    else localStorage.removeItem('pf-app')
    set({ app, page: 'dashboard', subPage: null })
  },
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
