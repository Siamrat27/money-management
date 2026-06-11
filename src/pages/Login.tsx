import { useState, useEffect, useRef } from 'react'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuthStore } from '../stores/useAuthStore'
import Button from '../components/ui/Button'
import { APP_VERSION } from '../version'

// Progressive lockout thresholds: [minFailures, lockoutSeconds]
const LOCKOUT_STEPS: [number, number][] = [
  [10, 1800], // 10+ fails → 30 min
  [7,  300],  // 7+  fails → 5 min
  [5,  60],   // 5+  fails → 1 min
  [3,  15],   // 3+  fails → 15 sec
]

function getLockoutSecs(failures: number): number {
  for (const [min, secs] of LOCKOUT_STEPS) {
    if (failures >= min) return secs
  }
  return 0
}

export default function Login() {
  const { signIn, signUp, resetPassword } = useAuthStore()
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Client-side rate limiting
  const failCount = useRef(0)
  const [lockedUntil, setLockedUntil] = useState(0)
  const [timeLeft, setTimeLeft] = useState(0)

  useEffect(() => {
    if (lockedUntil <= Date.now()) return
    setTimeLeft(Math.ceil((lockedUntil - Date.now()) / 1000))
    const id = setInterval(() => {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000)
      if (left <= 0) { clearInterval(id); setTimeLeft(0) }
      else setTimeLeft(left)
    }, 1000)
    return () => clearInterval(id)
  }, [lockedUntil])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (timeLeft > 0) return

    // Basic client-side validation
    const trimmedEmail = email.trim()
    if (!trimmedEmail) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(trimmedEmail)) {
      setError('รูปแบบอีเมลไม่ถูกต้อง')
      return
    }

    // Forgot password: only needs the email
    if (mode === 'forgot') {
      setLoading(true)
      setError(null)
      setSuccess(null)
      const err = await resetPassword(trimmedEmail)
      setLoading(false)
      if (err) setError(translateError(err))
      else setSuccess('ส่งลิงก์รีเซ็ตรหัสผ่านไปที่อีเมลแล้ว — เช็คกล่องจดหมาย (และ Junk/Spam)')
      return
    }

    if (!password) return
    if (password.length < 6) {
      setError('รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร')
      return
    }

    setLoading(true)
    setError(null)
    setSuccess(null)

    const err = mode === 'login'
      ? await signIn(trimmedEmail, password)
      : await signUp(trimmedEmail, password)

    setLoading(false)

    if (err) {
      failCount.current += 1
      const lockSecs = getLockoutSecs(failCount.current)
      if (lockSecs > 0) setLockedUntil(Date.now() + lockSecs * 1000)
      setError(translateError(err))
    } else if (mode === 'register') {
      setSuccess('สมัครสำเร็จ! กรุณาตรวจสอบอีเมลเพื่อยืนยันบัญชี')
      failCount.current = 0
    } else {
      failCount.current = 0
    }
  }

  function translateError(msg: string): string {
    if (msg.includes('Invalid login')) return 'อีเมลหรือรหัสผ่านไม่ถูกต้อง'
    if (msg.includes('already registered')) return 'อีเมลนี้มีบัญชีอยู่แล้ว'
    if (msg.includes('Password should be')) return 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร'
    if (msg.includes('valid email')) return 'กรุณากรอกอีเมลให้ถูกต้อง'
    if (msg.includes('email not confirmed')) return 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ'
    if (msg.includes('For security purposes')) return 'ขอลิงก์ถี่เกินไป กรุณารอสักครู่แล้วลองใหม่'
    if (msg.includes('rate limit')) return 'ส่งอีเมลเกินจำนวนที่กำหนด กรุณารอสักครู่'
    // Pass-through Thai messages from useAuthStore (suspended/locked)
    return msg
  }

  const lockLabel = timeLeft >= 60
    ? `${Math.ceil(timeLeft / 60)} นาที`
    : `${timeLeft} วินาที`

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
          {/* Tab / Forgot header */}
          {mode === 'forgot' ? (
            <div className="flex items-center gap-2 mb-6">
              <button
                onClick={() => { setMode('login'); setError(null); setSuccess(null) }}
                className="p-1.5 rounded-lg text-gray-400 active:bg-gray-100 dark:active:bg-gray-700"
              >
                ←
              </button>
              <p className="font-semibold">ลืมรหัสผ่าน</p>
            </div>
          ) : (
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
          )}

          {mode === 'forgot' && (
            <p className="text-xs text-gray-400 mb-4">
              กรอกอีเมลที่ใช้สมัครสมาชิก ระบบจะส่งลิงก์สำหรับตั้งรหัสผ่านใหม่ไปให้
            </p>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm text-gray-500 block mb-1.5">อีเมล</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com" autoComplete="email"
                disabled={timeLeft > 0}
                className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:opacity-50"
              />
            </div>

            {mode !== 'forgot' && (
              <div>
                <label className="text-sm text-gray-500 block mb-1.5">รหัสผ่าน</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="อย่างน้อย 6 ตัวอักษร" autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    disabled={timeLeft > 0}
                    className="w-full px-4 py-3 pr-11 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900 disabled:opacity-50"
                  />
                  <button type="button" onClick={() => setShowPw((v) => !v)}
                    className="absolute right-3 top-3 text-gray-400 p-0.5">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
                {mode === 'login' && (
                  <div className="text-right mt-1.5">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError(null); setSuccess(null) }}
                      className="text-xs text-indigo-500 active:text-indigo-600"
                    >
                      ลืมรหัสผ่าน?
                    </button>
                  </div>
                )}
              </div>
            )}

            {timeLeft > 0 && (
              <div className="flex items-center gap-2 px-3 py-2.5 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-xl text-orange-600 dark:text-orange-400 text-sm">
                🔒 มีการพยายาม login ผิดหลายครั้ง กรุณารอ {lockLabel}
              </div>
            )}
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

            <Button type="submit" fullWidth disabled={loading || timeLeft > 0} size="lg">
              {loading
                ? <><Loader2 size={18} className="inline animate-spin mr-2" />กำลังดำเนินการ...</>
                : timeLeft > 0
                  ? `🔒 รอ ${lockLabel}`
                  : mode === 'login' ? 'เข้าสู่ระบบ' : mode === 'register' ? 'สมัครสมาชิก' : '📧 ส่งลิงก์รีเซ็ตรหัสผ่าน'}
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
