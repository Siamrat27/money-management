import { useState } from 'react'
import { LayoutGrid, Scale, Flame, Droplets, Plus, Minus, TrendingDown, TrendingUp } from 'lucide-react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { format, parseISO, subDays } from 'date-fns'
import { th } from 'date-fns/locale'
import { useAppStore } from '@/stores/useAppStore'
import {
  useWeightEntries, saveWeight,
  useFoodEntriesByDate, useExercisesByDate, useWaterByDate,
  useHealthSettings, setWaterGlasses, sumKcal, groupByMeal,
} from '@/apps/health/hooks/useHealth'
import { dateKey, calcBMI, bmiCategory, calcStreak, formatKcal, formatWeight, MEALS } from '@/apps/health/utils/health'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '@/db/db'
import { useAuthStore } from '@/stores/useAuthStore'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Header from '@/components/layout/Header'

const inputCls = 'w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-emerald-400'

// Streak of consecutive days with any food logged
function useFoodStreak(): number {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(async () => {
    const dates = await db.foodEntries.where('userId').equals(userId).toArray()
    return calcStreak(new Set(dates.map((f) => f.date)))
  }, [userId]) ?? 0
}

export default function HealthDashboard() {
  const { setApp, setPage } = useAppStore()
  const today = dateKey()
  const settings = useHealthSettings()
  const weights = useWeightEntries() // sorted by date asc
  const todayFood = useFoodEntriesByDate(today)
  const todayExercises = useExercisesByDate(today)
  const water = useWaterByDate(today)
  const streak = useFoodStreak()

  const kcalLimit = settings?.dailyKcalLimit ?? 0
  const countExercise = settings?.countExercise ?? true
  const consumed = sumKcal(todayFood)
  const burned = todayExercises.reduce((s, e) => s + e.kcalBurned, 0)
  const netKcal = consumed - (countExercise ? burned : 0)
  const remaining = kcalLimit > 0 ? kcalLimit - netKcal : 0
  const pct = kcalLimit > 0 ? Math.min(100, (netKcal / kcalLimit) * 100) : 0

  const latest = weights[weights.length - 1]
  const previous = weights[weights.length - 2]
  const startWeight = settings?.startWeight ?? weights[0]?.weight
  const targetWeight = settings?.targetWeight
  const delta = latest && previous ? latest.weight - previous.weight : 0
  const totalDelta = latest && startWeight ? latest.weight - startWeight : 0

  // progress toward target (only meaningful when losing from start toward target)
  const targetProgress = latest && startWeight && targetWeight && startWeight !== targetWeight
    ? Math.min(100, Math.max(0, ((startWeight - latest.weight) / (startWeight - targetWeight)) * 100))
    : null

  const bmi = latest && settings?.heightCm ? calcBMI(latest.weight, settings.heightCm) : null
  const bmiCat = bmi ? bmiCategory(bmi) : null

  // Weight trend — last 30 days of entries
  const cutoff = dateKey(subDays(new Date(), 30))
  const trendData = weights
    .filter((w) => w.date >= cutoff)
    .map((w) => ({ name: format(parseISO(w.date), 'd MMM', { locale: th }), weight: w.weight }))

  const waterGoal = settings?.waterGoal ?? 8
  const glasses = water?.glasses ?? 0

  const mealGroups = groupByMeal(todayFood)

  // Quick weight log modal
  const [weightModal, setWeightModal] = useState(false)
  const [weightInput, setWeightInput] = useState('')

  async function submitWeight() {
    const w = parseFloat(weightInput)
    if (!w || w <= 0) return
    await saveWeight(today, w)
    // first-ever entry becomes the baseline automatically
    setWeightModal(false)
    setWeightInput('')
  }

  return (
    <div className="min-h-screen pb-nav">
      <Header
        title="FitFlow 🥗"
        right={
          <button onClick={() => setApp(null)} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800" title="สลับแอป">
            <LayoutGrid size={20} />
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 stagger">
        {/* Today's calories */}
        <Card className="p-5 bg-gradient-to-br from-emerald-500 to-teal-600 text-white">
          <div className="flex items-center justify-between">
            <p className="text-emerald-100 text-sm font-medium">แคลอรี่วันนี้</p>
            {streak > 0 && <span className="text-xs font-semibold bg-white/20 rounded-full px-2.5 py-1">🔥 {streak} วันติด</span>}
          </div>
          <p className="text-4xl font-bold mt-1">{formatKcal(netKcal)} <span className="text-lg font-medium text-emerald-100">kcal</span></p>
          {kcalLimit > 0 ? (
            <>
              <div className="mt-3 h-2.5 bg-white/25 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${netKcal > kcalLimit ? 'bg-red-300' : 'bg-white'}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="mt-2 flex justify-between text-xs text-emerald-100">
                <span>เป้าหมาย {formatKcal(kcalLimit)} kcal</span>
                <span className="font-semibold">
                  {remaining >= 0 ? `เหลืออีก ${formatKcal(remaining)} kcal` : `เกิน ${formatKcal(-remaining)} kcal ⚠️`}
                </span>
              </div>
            </>
          ) : (
            <button onClick={() => setPage('settings')} className="mt-2 text-xs text-emerald-100 underline">
              ตั้งเป้าหมายแคลอรี่ต่อวัน →
            </button>
          )}
          {burned > 0 && (
            <p className="mt-2 text-xs text-emerald-100">
              กิน {formatKcal(consumed)} − เผาผลาญ {formatKcal(burned)} kcal {countExercise ? '' : '(ไม่นับรวม)'}
            </p>
          )}
        </Card>

        {/* Weight */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">น้ำหนัก</p>
            {bmi && bmiCat && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: bmiCat.color + '22', color: bmiCat.color }}>
                BMI {bmi.toFixed(1)} · {bmiCat.label}
              </span>
            )}
          </div>
          <div className="flex items-end justify-between">
            <div>
              {latest ? (
                <>
                  <p className="text-3xl font-bold">{formatWeight(latest.weight)} <span className="text-base font-medium text-gray-400">กก.</span></p>
                  <div className="flex items-center gap-2 mt-1 text-xs">
                    {previous && delta !== 0 && (
                      <span className={`flex items-center gap-0.5 font-semibold ${delta < 0 ? 'text-green-500' : 'text-red-500'}`}>
                        {delta < 0 ? <TrendingDown size={13} /> : <TrendingUp size={13} />}
                        {delta > 0 ? '+' : ''}{formatWeight(delta)} จากครั้งก่อน
                      </span>
                    )}
                    {startWeight != null && totalDelta !== 0 && (
                      <span className="text-gray-400">รวม {totalDelta > 0 ? '+' : ''}{formatWeight(totalDelta)} กก.</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-gray-400 text-sm py-2">ยังไม่มีข้อมูล — บันทึกน้ำหนักวันแรกกันเลย</p>
              )}
            </div>
            <Button size="sm" onClick={() => { setWeightInput(latest ? String(latest.weight) : ''); setWeightModal(true) }}
              className="!bg-emerald-500 active:!bg-emerald-600 flex items-center gap-1">
              <Scale size={14} /> บันทึก
            </Button>
          </div>

          {targetProgress !== null && targetWeight && (
            <div className="mt-3">
              <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${targetProgress}%` }} />
              </div>
              <div className="flex justify-between mt-1 text-xs text-gray-400">
                <span>เริ่ม {formatWeight(startWeight!)} กก.</span>
                <span className="text-emerald-500 font-medium">{targetProgress.toFixed(0)}%</span>
                <span>เป้า {formatWeight(targetWeight)} กก.</span>
              </div>
            </div>
          )}

          {trendData.length >= 2 && (
            <div className="mt-3">
              <ResponsiveContainer width="100%" height={90}>
                <AreaChart data={trendData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="weightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area type="monotone" dataKey="weight" name="น้ำหนัก" stroke="#10b981" strokeWidth={2} fill="url(#weightGrad)" dot={false} />
                  {targetWeight && <ReferenceLine y={targetWeight} stroke="#94a3b8" strokeDasharray="4 4" />}
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip formatter={(v: number) => `${formatWeight(v)} กก.`} contentStyle={{ borderRadius: 12, fontSize: 11, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        {/* Water tracker */}
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Droplets size={18} className="text-sky-500" />
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">ดื่มน้ำวันนี้</p>
            </div>
            <p className="text-sm font-bold text-sky-500">{glasses}/{waterGoal} แก้ว</p>
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={() => setWaterGlasses(today, glasses - 1)} disabled={glasses <= 0}
              className="w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center active:bg-gray-200 dark:active:bg-gray-700 disabled:opacity-40">
              <Minus size={16} />
            </button>
            <div className="flex-1 flex gap-1 flex-wrap">
              {Array.from({ length: Math.max(waterGoal, glasses) }, (_, i) => (
                <span key={i} className={`text-lg ${i < glasses ? '' : 'opacity-25 grayscale'}`}>💧</span>
              ))}
            </div>
            <button onClick={() => setWaterGlasses(today, glasses + 1)}
              className="w-9 h-9 rounded-full bg-sky-500 text-white flex items-center justify-center active:bg-sky-600">
              <Plus size={16} />
            </button>
          </div>
        </Card>

        {/* Today's meals summary */}
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="font-semibold">มื้ออาหารวันนี้</p>
            <button onClick={() => setPage('add')} className="text-sm text-emerald-500 flex items-center gap-0.5">
              <Plus size={15} /> เพิ่ม
            </button>
          </div>
          {todayFood.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">ยังไม่มีรายการ แตะ + เพื่อบันทึกมื้อแรก</p>
          ) : (
            <div>
              {MEALS.map(({ value, label, icon }) => {
                const items = mealGroups[value]
                if (items.length === 0) return null
                return (
                  <div key={value} className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 dark:border-gray-800">
                    <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center text-xl flex-shrink-0">{icon}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{label}</p>
                      <p className="text-xs text-gray-400 truncate">{items.map((i) => i.name).join(', ')}</p>
                    </div>
                    <p className="font-semibold text-sm text-emerald-600 dark:text-emerald-400">{formatKcal(sumKcal(items))} kcal</p>
                  </div>
                )
              })}
              {burned > 0 && (
                <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 dark:border-gray-800">
                  <div className="w-10 h-10 rounded-2xl bg-orange-50 dark:bg-orange-950 flex items-center justify-center flex-shrink-0">
                    <Flame size={18} className="text-orange-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">ออกกำลังกาย</p>
                    <p className="text-xs text-gray-400 truncate">{todayExercises.map((e) => e.name).join(', ')}</p>
                  </div>
                  <p className="font-semibold text-sm text-orange-500">-{formatKcal(burned)} kcal</p>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Weight log modal */}
      <Modal open={weightModal} onClose={() => setWeightModal(false)} title="บันทึกน้ำหนักวันนี้">
        <div className="space-y-4">
          <div className="relative">
            <input
              type="number" inputMode="decimal" step="0.1" autoFocus
              value={weightInput} onChange={(e) => setWeightInput(e.target.value)}
              placeholder="เช่น 65.5" className={inputCls + ' pr-12 text-lg font-semibold'}
              onKeyDown={(e) => e.key === 'Enter' && submitWeight()}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-400">กก.</span>
          </div>
          <Button fullWidth onClick={submitWeight} disabled={!parseFloat(weightInput)}
            className="!bg-emerald-500 active:!bg-emerald-600">
            บันทึก
          </Button>
        </div>
      </Modal>
    </div>
  )
}
