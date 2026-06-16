import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { shouldLockNow, markActive } from './lib/pin'
import PinLock from './components/PinLock'
import { useAppStore } from './stores/useAppStore'
import { useAuthStore } from './stores/useAuthStore'
import { pullFromCloud } from './services/sync'
import { isSupabaseConfigured } from './lib/supabase'
import BottomNav from './components/layout/BottomNav'
import Snackbar from './components/ui/Snackbar'
import Dashboard from './pages/Dashboard'
import AddTransaction from './pages/AddTransaction'
import Calendar from './pages/Calendar'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Accounts from './pages/Accounts'
import RecurringManager from './pages/RecurringManager'
import Transactions from './pages/Transactions'
import SavingsPlanner from './pages/SavingsPlanner'
import ScheduledPayments from './pages/ScheduledPayments'
import Budgets from './pages/Budgets'
import AiChat from './pages/AiChat'
import AutoCategorize from './pages/AutoCategorize'
import Login from './pages/Login'
import ResetPassword from './pages/ResetPassword'

export default function App() {
  const { page, subPage } = useAppStore()
  const { user, loading, setSyncing, setSyncError, recoveryMode } = useAuthStore()
  const lastSyncedUser = useRef<string | null>(null)

  // PIN lock: lock only after a period of inactivity — a quick page refresh
  // within the window stays unlocked. While open & unlocked we keep a
  // "last active" timestamp fresh so reloads don't re-prompt.
  const [locked, setLocked] = useState(() => shouldLockNow())
  const lockedRef = useRef(locked)
  lockedRef.current = locked
  useEffect(() => {
    function tick() {
      if (document.visibilityState === 'visible' && !lockedRef.current) markActive()
    }
    tick()
    const id = window.setInterval(tick, 30_000)
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      if (shouldLockNow()) setLocked(true)
      else markActive()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisibility) }
  }, [])

  // Scroll back to the top whenever the page or subpage changes (SPA has no
  // router, so the scroll position would otherwise persist across screens)
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
  }, [page, subPage])

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

  if (locked) {
    return <PinLock onUnlock={() => { markActive(); setLocked(false) }} />
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <Loader2 size={32} className="animate-spin text-indigo-500" />
      </div>
    )
  }

  // Arrived via password-reset email link — force the new-password screen
  if (recoveryMode && user) {
    return <ResetPassword />
  }

  // Show login only when Supabase is configured and no session
  if (isSupabaseConfigured && !user) {
    return <Login />
  }

  function renderPage() {
    if (subPage === 'transactions') return <Transactions />
    if (subPage === 'accounts') return <Accounts />
    if (subPage === 'recurring') return <RecurringManager />
    if (subPage === 'savings-planner') return <SavingsPlanner />
    if (subPage === 'scheduled-payments') return <ScheduledPayments />
    if (subPage === 'budgets') return <Budgets />
    if (subPage === 'ai-chat') return <AiChat />
    if (subPage === 'auto-categorize') return <AutoCategorize />

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
      <Snackbar />
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
