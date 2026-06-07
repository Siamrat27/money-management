import { useEffect, useRef } from 'react'
import { Loader2 } from 'lucide-react'
import { useAppStore } from './stores/useAppStore'
import { useAuthStore } from './stores/useAuthStore'
import { pullFromCloud } from './services/sync'
import { isSupabaseConfigured } from './lib/supabase'
import BottomNav from './components/layout/BottomNav'
import Dashboard from './pages/Dashboard'
import AddTransaction from './pages/AddTransaction'
import Calendar from './pages/Calendar'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Accounts from './pages/Accounts'
import RecurringManager from './pages/RecurringManager'
import Transactions from './pages/Transactions'
import Login from './pages/Login'

export default function App() {
  const { page, subPage } = useAppStore()
  const { user, loading, setSyncing, setSyncError } = useAuthStore()
  const lastSyncedUser = useRef<string | null>(null)

  // Pull cloud data whenever the logged-in user changes
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return
    if (lastSyncedUser.current === user.id) return
    lastSyncedUser.current = user.id

    setSyncing(true)
    pullFromCloud(user.id)
      .catch((e) => setSyncError(String(e)))
      .finally(() => setSyncing(false))
  }, [user?.id])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  // Show login only when Supabase is configured and no session
  if (isSupabaseConfigured && !user) {
    return <Login />
  }

  function renderPage() {
    if (subPage === 'transactions') return <Transactions />
    if (subPage === 'accounts') return <Accounts />
    if (subPage === 'recurring') return <RecurringManager />

    switch (page) {
      case 'dashboard': return <Dashboard />
      case 'add': return <AddTransaction />
      case 'calendar': return <Calendar />
      case 'reports': return <Reports />
      case 'settings': return <Settings />
      default: return <Dashboard />
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <SyncBanner />
      {renderPage()}
      <BottomNav />
    </div>
  )
}

function SyncBanner() {
  const { syncing, syncError, setSyncError } = useAuthStore()
  if (!syncing && !syncError) return null
  return (
    <div className={`fixed top-0 left-0 right-0 z-50 text-center text-xs py-2 px-4 font-medium ${syncing ? 'bg-indigo-500 text-white' : 'bg-red-500 text-white'}`}>
      {syncing
        ? <><Loader2 size={12} className="inline animate-spin mr-1.5" />กำลังซิงค์ข้อมูล...</>
        : <span onClick={() => setSyncError(null)}>⚠️ ซิงค์ล้มเหลว: {syncError} (แตะเพื่อปิด)</span>}
    </div>
  )
}
