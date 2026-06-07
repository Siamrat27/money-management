import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { db } from '../db/db'

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

    const trimmed = email.trim().toLowerCase()
    const { data, error } = await supabase.auth.signInWithPassword({ email: trimmed, password })

    if (error) {
      // Fire-and-forget: record the failure server-side for lockout tracking
      void Promise.resolve(supabase.rpc('record_failed_login', { p_email: trimmed }))
      return error.message
    }

    if (data.user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('active, locked_until')
        .eq('user_id', data.user.id)
        .maybeSingle()

      if (profile) {
        if (profile.locked_until && new Date(profile.locked_until) > new Date()) {
          await supabase.auth.signOut()
          const secsLeft = Math.ceil((new Date(profile.locked_until).getTime() - Date.now()) / 1000)
          const label = secsLeft >= 60 ? `${Math.ceil(secsLeft / 60)} นาที` : `${secsLeft} วินาที`
          return `บัญชีถูกล็อคชั่วคราว กรุณารออีก ${label}`
        }

        if (!profile.active) {
          await supabase.auth.signOut()
          return 'บัญชีถูกระงับ กรุณาติดต่อผู้ดูแลระบบ'
        }
      }

      void Promise.resolve(supabase.rpc('reset_failed_login', { p_user_id: data.user.id }))
    }

    return null
  },

  signUp: async (email, password) => {
    if (!isSupabaseConfigured) return 'Supabase ยังไม่ได้ตั้งค่า'

    const trimmed = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmed)) return 'รูปแบบอีเมลไม่ถูกต้อง'
    if (password.length < 6) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'

    const { error } = await supabase.auth.signUp({ email: trimmed, password })
    return error?.message ?? null
  },

  signOut: async () => {
    const userId = useAuthStore.getState().user?.id
    if (isSupabaseConfigured) await supabase.auth.signOut()
    if (userId) {
      await db.transaction('rw', [db.accounts, db.tags, db.transactions, db.recurring, db.userSettings], async () => {
        await db.accounts.where('userId').equals(userId).delete()
        await db.tags.where('userId').equals(userId).delete()
        await db.transactions.where('userId').equals(userId).delete()
        await db.recurring.where('userId').equals(userId).delete()
        await db.userSettings.where('userId').equals(userId).delete()
      })
    }
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
