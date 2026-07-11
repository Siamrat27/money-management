import { useState, useEffect } from 'react'
import { LayoutGrid, LogOut, Flame, Target, User } from 'lucide-react'
import { APP_VERSION } from '../../version'
import { useHealthSettings, saveHealthSettings, useWeightEntries } from '../../hooks/useHealth'
import { calcBMR, calcTDEE, calcAge, suggestKcalTarget, ACTIVITY_LEVELS, formatKcal } from '../../utils/health'
import { useAppStore } from '../../stores/useAppStore'
import { useAuthStore } from '../../stores/useAuthStore'
import { isSupabaseConfigured } from '../../lib/supabase'
import Card from '../../components/ui/Card'
import Button from '../../components/ui/Button'
import Header from '../../components/layout/Header'
import type { ActivityLevel, Gender } from '../../types'

const inputCls = 'w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-emerald-400'

export default function HealthSettingsPage() {
  const settings = useHealthSettings()
  const weights = useWeightEntries()
  const { setApp } = useAppStore()
  const { user, signOut } = useAuthStore()

  // Local form state, hydrated from settings when they load
  const [form, setForm] = useState({
    gender: '' as Gender | '',
    birthYear: '', heightCm: '',
    activityLevel: '' as ActivityLevel | '',
    dailyKcalLimit: '', targetWeight: '', startWeight: '',
    waterGoal: '', proteinGoal: '', carbsGoal: '', fatGoal: '',
  })
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (settings === undefined || hydrated) return
    setForm({
      gender: settings?.gender ?? '',
      birthYear: settings?.birthYear ? String(settings.birthYear) : '',
      heightCm: settings?.heightCm ? String(settings.heightCm) : '',
      activityLevel: settings?.activityLevel ?? '',
      dailyKcalLimit: settings?.dailyKcalLimit ? String(settings.dailyKcalLimit) : '',
      targetWeight: settings?.targetWeight ? String(settings.targetWeight) : '',
      startWeight: settings?.startWeight ? String(settings.startWeight) : '',
      waterGoal: settings?.waterGoal ? String(settings.waterGoal) : '',
      proteinGoal: settings?.proteinGoal ? String(settings.proteinGoal) : '',
      carbsGoal: settings?.carbsGoal ? String(settings.carbsGoal) : '',
      fatGoal: settings?.fatGoal ? String(settings.fatGoal) : '',
    })
    setHydrated(true)
  }, [settings, hydrated])

  const countExercise = settings?.countExercise ?? true

  const num = (s: string) => { const n = parseFloat(s); return isNaN(n) || n <= 0 ? undefined : n }

  function persist(patch: Parameters<typeof saveHealthSettings>[0]) {
    saveHealthSettings(patch).catch(console.error)
  }

  // BMR/TDEE from the profile + latest weight
  const latestWeight = weights[weights.length - 1]?.weight
  const heightCm = num(form.heightCm)
  const birthYear = num(form.birthYear)
  const bmr = form.gender && latestWeight && heightCm && birthYear
    ? calcBMR(form.gender, latestWeight, heightCm, calcAge(birthYear))
    : null
  const tdee = bmr && form.activityLevel ? calcTDEE(bmr, form.activityLevel) : null
  const suggested = tdee && form.gender ? suggestKcalTarget(tdee, form.gender) : null

  return (
    <div className="min-h-screen pb-nav">
      <Header
        title="ตั้งค่า FitFlow"
        right={
          <button onClick={() => setApp(null)} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800" title="สลับแอป">
            <LayoutGrid size={20} />
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 stagger">
        {user && (
          <Card className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate">{user.email}</p>
              <p className="text-xs text-gray-400">{isSupabaseConfigured ? '☁️ ซิงค์ผ่าน Supabase' : '📱 โหมดใช้งานในเครื่อง'}</p>
            </div>
            <Button variant="danger" size="sm" onClick={signOut}>
              <LogOut size={14} className="inline mr-1" /> ออกจากระบบ
            </Button>
          </Card>
        )}

        {/* Profile */}
        <Card className="p-4 space-y-3">
          <p className="font-semibold text-sm"><User size={14} className="inline text-emerald-500 mr-1" />ข้อมูลส่วนตัว</p>
          <div>
            <label className="text-xs text-gray-400 block mb-1.5">เพศ</label>
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
              {([['male', 'ชาย'], ['female', 'หญิง']] as const).map(([v, label]) => (
                <button key={v}
                  onClick={() => { setForm({ ...form, gender: v }); persist({ gender: v }) }}
                  className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${form.gender === v ? 'bg-white dark:bg-gray-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">ปีเกิด (ค.ศ.)</label>
              <input type="number" inputMode="numeric" value={form.birthYear} placeholder="1995"
                onChange={(e) => setForm({ ...form, birthYear: e.target.value })}
                onBlur={() => persist({ birthYear: num(form.birthYear) })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">ส่วนสูง (ซม.)</label>
              <input type="number" inputMode="decimal" value={form.heightCm} placeholder="170"
                onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                onBlur={() => persist({ heightCm: num(form.heightCm) })} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">ระดับกิจกรรม</label>
            <select value={form.activityLevel}
              onChange={(e) => {
                const v = e.target.value as ActivityLevel | ''
                setForm({ ...form, activityLevel: v })
                if (v) persist({ activityLevel: v })
              }}
              className={inputCls}>
              <option value="">— เลือก —</option>
              {ACTIVITY_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>

          {bmr && (
            <div className="bg-emerald-50 dark:bg-emerald-950 rounded-xl p-3 text-sm space-y-1">
              <p>BMR (เผาผลาญพื้นฐาน): <b>{formatKcal(bmr)}</b> kcal/วัน</p>
              {tdee && <p>TDEE (ใช้จริงต่อวัน): <b>{formatKcal(tdee)}</b> kcal/วัน</p>}
              {suggested && (
                <div className="flex items-center justify-between pt-1">
                  <p className="text-xs text-gray-500 dark:text-gray-400">แนะนำเพื่อลดน้ำหนัก: <b className="text-emerald-600 dark:text-emerald-400">{formatKcal(suggested)}</b> kcal/วัน</p>
                  <Button size="sm" variant="secondary"
                    onClick={() => { setForm({ ...form, dailyKcalLimit: String(suggested) }); persist({ dailyKcalLimit: suggested }) }}>
                    ใช้ค่านี้
                  </Button>
                </div>
              )}
            </div>
          )}
          {!bmr && <p className="text-[11px] text-gray-400">กรอกเพศ ปีเกิด ส่วนสูง + บันทึกน้ำหนัก เพื่อคำนวณ BMR/TDEE และเป้า kcal แนะนำ</p>}
        </Card>

        {/* Goals */}
        <Card className="p-4 space-y-3">
          <p className="font-semibold text-sm"><Target size={14} className="inline text-emerald-500 mr-1" />เป้าหมาย</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">kcal ต่อวันไม่เกิน</label>
              <input type="number" inputMode="numeric" value={form.dailyKcalLimit} placeholder="1800"
                onChange={(e) => setForm({ ...form, dailyKcalLimit: e.target.value })}
                onBlur={() => persist({ dailyKcalLimit: num(form.dailyKcalLimit) })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">น้ำหนักเป้าหมาย (กก.)</label>
              <input type="number" inputMode="decimal" value={form.targetWeight} placeholder="60"
                onChange={(e) => setForm({ ...form, targetWeight: e.target.value })}
                onBlur={() => persist({ targetWeight: num(form.targetWeight) })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">น้ำหนักเริ่มต้น (กก.)</label>
              <input type="number" inputMode="decimal" value={form.startWeight}
                placeholder={weights[0] ? String(weights[0].weight) : '65'}
                onChange={(e) => setForm({ ...form, startWeight: e.target.value })}
                onBlur={() => persist({ startWeight: num(form.startWeight) })} className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">ดื่มน้ำ (แก้ว/วัน)</label>
              <input type="number" inputMode="numeric" value={form.waterGoal} placeholder="8"
                onChange={(e) => setForm({ ...form, waterGoal: e.target.value })}
                onBlur={() => persist({ waterGoal: num(form.waterGoal) })} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([['proteinGoal', 'โปรตีน (ก.)'], ['carbsGoal', 'คาร์บ (ก.)'], ['fatGoal', 'ไขมัน (ก.)']] as const).map(([k, label]) => (
              <div key={k}>
                <label className="text-[10px] text-gray-400 block mb-1">{label}</label>
                <input type="number" inputMode="numeric" value={form[k]} placeholder="-"
                  onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                  onBlur={() => persist({ [k]: num(form[k]) })} className={inputCls} />
              </div>
            ))}
          </div>

          <label className="flex items-center justify-between pt-1">
            <span className="text-sm"><Flame size={14} className="inline text-orange-500 mr-1" />หักแคลอรี่ที่ออกกำลังกายออกจากยอดรวม</span>
            <input type="checkbox" checked={countExercise}
              onChange={(e) => persist({ countExercise: e.target.checked })}
              className="w-5 h-5 accent-emerald-500" />
          </label>
        </Card>

        <Button variant="secondary" fullWidth onClick={() => setApp(null)}>
          <LayoutGrid size={15} className="inline mr-1.5" /> สลับไปแอปอื่น
        </Button>

        <p className="text-center text-xs text-gray-300 pb-4">FitFlow v{APP_VERSION} · {isSupabaseConfigured ? '☁️ ซิงค์ผ่าน Supabase' : '📱 โหมดใช้งานในเครื่อง'}</p>
      </div>
    </div>
  )
}
