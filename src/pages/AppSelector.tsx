import { Wallet, Salad, LogOut, Moon, Sun } from 'lucide-react'
import { useAppStore } from '../stores/useAppStore'
import { useAuthStore } from '../stores/useAuthStore'
import { isSupabaseConfigured } from '../lib/supabase'
import Card from '../components/ui/Card'

// Shown after login when no app has been chosen yet (or after "สลับแอป")
export default function AppSelector() {
  const { setApp, darkMode, toggleDark } = useAppStore()
  const { user, signOut } = useAuthStore()

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="flex justify-end p-4">
        <button onClick={toggleDark} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
          {darkMode ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      <div className="flex-1 flex flex-col justify-center max-w-lg w-full mx-auto px-6 pb-16 stagger">
        <div className="text-center mb-8">
          <p className="text-3xl font-bold">เลือกแอปที่ต้องการใช้</p>
          {user && <p className="text-sm text-gray-400 mt-2">{user.email}</p>}
        </div>

        <div className="space-y-4">
          <Card onClick={() => setApp('money')} className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center flex-shrink-0">
              <Wallet size={28} className="text-indigo-500" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold">PocketFlow 💰</p>
              <p className="text-sm text-gray-400">จัดการเงิน รายรับ-รายจ่าย งบประมาณ</p>
            </div>
          </Card>

          <Card onClick={() => setApp('health')} className="p-6 flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-950 flex items-center justify-center flex-shrink-0">
              <Salad size={28} className="text-emerald-500" />
            </div>
            <div className="flex-1">
              <p className="text-lg font-bold">FitFlow 🥗</p>
              <p className="text-sm text-gray-400">ลดน้ำหนัก คุมอาหาร นับแคลอรี่</p>
            </div>
          </Card>
        </div>

        {isSupabaseConfigured && user && (
          <button
            onClick={signOut}
            className="mt-10 mx-auto flex items-center gap-1.5 text-sm text-gray-400 active:text-red-500"
          >
            <LogOut size={15} /> ออกจากระบบ
          </button>
        )}
      </div>
    </div>
  )
}
