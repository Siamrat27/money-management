import { useEffect, useRef, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { shouldLockNow, markActive } from '@/lib/pin'
import PinLock from '@/components/PinLock'
import { useAppStore } from '@/stores/useAppStore'
import { useAuthStore } from '@/stores/useAuthStore'
import { pullFromCloud } from '@/services/sync'
import { isSupabaseConfigured } from '@/lib/supabase'
import BottomNav from '@/components/layout/BottomNav'
import Snackbar from '@/components/ui/Snackbar'
// Shared pages (login / recovery / app menu)
import Login from '@/pages/Login'
import ResetPassword from '@/pages/ResetPassword'
import AppSelector from '@/pages/AppSelector'
// PocketFlow (money app)
import Dashboard from '@/apps/money/pages/Dashboard'
import AddTransaction from '@/apps/money/pages/AddTransaction'
import Calendar from '@/apps/money/pages/Calendar'
import Reports from '@/apps/money/pages/Reports'
import Settings from '@/apps/money/pages/Settings'
import Accounts from '@/apps/money/pages/Accounts'
import RecurringManager from '@/apps/money/pages/RecurringManager'
import Transactions from '@/apps/money/pages/Transactions'
import SavingsPlanner from '@/apps/money/pages/SavingsPlanner'
import ScheduledPayments from '@/apps/money/pages/ScheduledPayments'
import Budgets from '@/apps/money/pages/Budgets'
import AiChat from '@/apps/money/pages/AiChat'
import AutoCategorize from '@/apps/money/pages/AutoCategorize'
// FitFlow (health app)
import HealthDashboard from '@/apps/health/pages/HealthDashboard'
import FoodLog from '@/apps/health/pages/FoodLog'
import HealthCalendar from '@/apps/health/pages/HealthCalendar'
import HealthReports from '@/apps/health/pages/HealthReports'
import HealthSettingsPage from '@/apps/health/pages/HealthSettingsPage'

export default function App() {
  const { page, subPage, app } = useAppStore()
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

  // Logged in but no app chosen yet — show the app menu
  if (!app) {
    return <AppSelector />
  }

  function renderPage() {
    if (app === 'health') {
      switch (page) {
        case 'dashboard': return <HealthDashboard />
        case 'add': return <FoodLog />
        case 'calendar': return <HealthCalendar />
        case 'reports': return <HealthReports />
        case 'settings': return <HealthSettingsPage />
        default: return <HealthDashboard />
      }
    }

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
