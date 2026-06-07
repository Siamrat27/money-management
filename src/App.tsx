import { useAppStore } from './stores/useAppStore'
import BottomNav from './components/layout/BottomNav'
import Dashboard from './pages/Dashboard'
import AddTransaction from './pages/AddTransaction'
import Calendar from './pages/Calendar'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import Accounts from './pages/Accounts'
import RecurringManager from './pages/RecurringManager'
import Transactions from './pages/Transactions'

export default function App() {
  const { page, subPage } = useAppStore()

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
      {renderPage()}
      <BottomNav />
    </div>
  )
}
