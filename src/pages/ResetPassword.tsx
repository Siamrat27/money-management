import { useState } from 'react'
import { Eye, EyeOff, Loader2, KeyRound } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import Button from '../components/ui/Button'

export default function ResetPassword() {
  const { updatePassword, signOut } = useAuthStore()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 6) { setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'); return }
    if (password !== confirm) { setError('รหัสผ่านไม่ตรงกัน'); return }
    setLoading(true)
    const err = await updatePassword(password)
    setLoading(false)
    if (err) setError(err.includes('different from the old') ? 'รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม' : err)
    // success: recoveryMode is cleared in the store → App renders normally
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-3xl bg-indigo-500 text-white mb-4 shadow-lg shadow-indigo-500/30">
            <KeyRound size={26} />
          </div>
          <h1 className="text-xl font-bold">ตั้งรหัสผ่านใหม่</h1>
          <p className="text-gray-400 text-sm mt-1">กรอกรหัสผ่านใหม่สำหรับบัญชีของคุณ</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1.5">รหัสผ่านใหม่</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร" autoComplete="new-password"
                  className="w-full px-4 py-3 pr-11 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:border-indigo-400"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-3 text-gray-400 p-0.5">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm text-gray-500 block mb-1.5">ยืนยันรหัสผ่านใหม่</label>
              <input
                type={showPw ? 'text' : 'password'} value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="พิมพ์รหัสผ่านอีกครั้ง" autoComplete="new-password"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:border-indigo-400"
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                ⚠️ {error}
              </div>
            )}

            <Button type="submit" fullWidth disabled={loading} size="lg">
              {loading
                ? <><Loader2 size={18} className="inline animate-spin mr-2" />กำลังบันทึก...</>
                : 'บันทึกรหัสผ่านใหม่'}
            </Button>
            <button
              type="button"
              onClick={signOut}
              className="w-full text-center text-sm text-gray-400 py-1"
            >
              ยกเลิกและกลับไปหน้าเข้าสู่ระบบ
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
