import { LayoutDashboard, Plus, CalendarDays, BarChart2, Settings } from 'lucide-react'
import { useAppStore } from '../../stores/useAppStore'
import type { Page } from '../../types'

const NAV: { icon: typeof LayoutDashboard; label: string; page: Page }[] = [
  { icon: LayoutDashboard, label: 'หน้าหลัก', page: 'dashboard' },
  { icon: CalendarDays, label: 'ปฏิทิน', page: 'calendar' },
  { icon: Plus, label: '', page: 'add' },
  { icon: BarChart2, label: 'รายงาน', page: 'reports' },
  { icon: Settings, label: 'ตั้งค่า', page: 'settings' },
]

export default function BottomNav() {
  const { page, setPage } = useAppStore()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-800 safe-bottom">
      <div className="flex items-center justify-around max-w-lg mx-auto">
        {NAV.map(({ icon: Icon, label, page: p }) =>
          p === 'add' ? (
            <button
              key={p}
              onClick={() => setPage('add')}
              className="relative -top-5 flex items-center justify-center w-14 h-14 rounded-full bg-indigo-500 text-white shadow-lg shadow-indigo-500/40 active:scale-95 transition-transform"
            >
              <Plus size={28} />
            </button>
          ) : (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`flex flex-col items-center py-2 px-4 gap-0.5 transition-colors ${
                page === p ? 'text-indigo-500' : 'text-gray-400 dark:text-gray-500'
              }`}
            >
              <Icon size={22} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          )
        )}
      </div>
    </nav>
  )
}
