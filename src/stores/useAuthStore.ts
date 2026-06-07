import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'

interface AuthStore {
  user: User | null
  session: Session | null
  loading: boolean
  syncing: boolean
  syncError: string | null
  setUser: (user: User | null) => void
  setSession: (session: Session | null) => void
  setSyncing: (v: boolean) => void
  setSyncError: (e: string | null) => void
  signIn: (email: string, password: string) => Promise<string | null>
  signUp: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  session: null,
  loading: true,
  syncing: false,
  syncError: null,
  setUser: (user) => set({ user }),
  setSession: (session) => set({ session, user: session?.user ?? null }),
  setSyncing: (syncing) => set({ syncing }),
  setSyncError: (syncError) => set({ syncError }),

  signIn: async (email, password) => {
    if (!isSupabaseConfigured) return 'Supabase ยังไม่ได้ตั้งค่า'
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  },

  signUp: async (email, password) => {
    if (!isSupabaseConfigured) return 'Supabase ยังไม่ได้ตั้งค่า'
    const { error } = await supabase.auth.signUp({ email, password })
    return error?.message ?? null
  },

  signOut: async () => {
    if (isSupabaseConfigured) await supabase.auth.signOut()
    set({ user: null, session: null })
  },
}))

// Bootstrap: restore session from Supabase on load
if (isSupabaseConfigured) {
  supabase.auth.getSession().then(({ data }) => {
    useAuthStore.setState({ session: data.session, user: data.session?.user ?? null, loading: false })
  })

  supabase.auth.onAuthStateChange((_event, session) => {
    useAuthStore.setState({ session, user: session?.user ?? null, loading: false })
  })
} else {
  useAuthStore.setState({ loading: false })
}
