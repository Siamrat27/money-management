import { useState } from 'react'
import { Wallet, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import Button from '../components/ui/Button'
import { APP_VERSION } from '../version'

export default function Login() {
  const { signIn, signUp } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true)
    setError(null)
    setSuccess(null)

    const err = mode === 'login'
      ? await signIn(email, password)
      : await signUp(email, password)

    setLoading(false)
    if (err) {
      setError(translateError(err))
    } else if (mode === 'register') {
      setSuccess('สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี')
    }
  }

  function translateError(msg: string): string {
    if (msg.includes('Invalid login')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
    if (msg.includes('already registered')) return 'อีเมลนี้มีบัญชีอยู่แล้ว'
    if (msg.includes('Password should be')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
    if (msg.includes('valid email')) return 'กรุณากรอกอีเมลให้ถูกต้อง'
    return msg
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-gray-50 dark:bg-gray-900">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-indigo-500 text-white text-4xl mb-4 shadow-lg shadow-indigo-500/30">
            💰
          </div>
          <h1 className="text-2xl font-bold">PocketFlow</h1>
          <p className="text-gray-400 text-sm mt-1">บันทึกรายรับรายจ่ายส่วนตัว</p>
          <p className="text-gray-300 dark:text-gray-600 text-xs mt-0.5">v{APP_VERSION}</p>
        </div>

        {/* Card */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 shadow-sm">
          {/* Tab */}
          <div className="flex bg-gray-100 dark:bg-gray-700 rounded-2xl p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(null); setSuccess(null) }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${mode === 'login' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600' : 'text-gray-500'}`}
            >
              เข้าสู่ระบบ
            </button>
            <button
              onClick={() => { setMode('register'); setError(null); setSuccess(null) }}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${mode === 'register' ? 'bg-white dark:bg-gray-600 shadow-sm text-indigo-600' : 'text-gray-500'}`}
            >
              สมัครสมาชิก
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1.5">อีเมล</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" autoComplete="email"
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
              />
            </div>

            <div>
              <label className="text-sm text-gray-500 block mb-1.5">รหัสผ่าน</label>
              <div className="relative">
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="อย่างน้อย 6 ตัวอักษร" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className="w-full px-4 py-3 pr-11 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900"
                />
                <button type="button" onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3 top-3 text-gray-400 p-0.5">
                  {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-xl text-red-600 dark:text-red-400 text-sm">
                ⚠️ {error}
              </div>
            )}
            {success && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-xl text-green-600 dark:text-green-400 text-sm">
                ✓ {success}
              </div>
            )}

            <Button type="submit" fullWidth disabled={loading} size="lg">
              {loading
                ? <><Loader2 size={18} className="inline animate-spin mr-2" />กำลังดำเนินการ...</>
                : mode === 'login' ? 'เข้าสู่ระบบ' : 'สมัครสมาชิก'}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          ข้อมูลของคุณจะถูกซิงค์ผ่าน Supabase ปลอดภัยด้วย RLS
        </p>
      </div>
    </div>
  )
}
