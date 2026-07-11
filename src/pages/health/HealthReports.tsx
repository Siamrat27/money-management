import { useState } from 'react'
import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, CartesianGrid, Cell } from 'recharts'
import { format, parseISO, subDays, startOfMonth, startOfYear } from 'date-fns'
import { th } from 'date-fns/locale'
import { useWeightEntries, useFoodEntriesByRange, useExercisesByRange, useHealthSettings, sumKcal } from '../../hooks/useHealth'
import { dateKey, formatKcal, formatWeight } from '../../utils/health'
import Card from '../../components/ui/Card'
import Header from '../../components/layout/Header'

type Range = 30 | 90 | 365 | 0 // 0 = all

const RANGES: { value: Range; label: string }[] = [
  { value: 30, label: '30 วัน' },
  { value: 90, label: '90 วัน' },
  { value: 365, label: '1 ปี' },
  { value: 0, label: 'ทั้งหมด' },
]

const tooltipStyle = { borderRadius: 12, fontSize: 11, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }

export default function HealthReports() {
  const [range, setRange] = useState<Range>(30)
  const weights = useWeightEntries() // sorted asc
  const settings = useHealthSettings()

  const today = dateKey()
  const cutoff = range === 0 ? '' : dateKey(subDays(new Date(), range))

  // ── Weight trend ──
  const rangeWeights = weights.filter((w) => w.date >= cutoff)
  const weightData = rangeWeights.map((w) => ({
    name: format(parseISO(w.date), range > 90 || range === 0 ? 'MMM yy' : 'd MMM', { locale: th }),
    weight: w.weight,
  }))
  const rangeDelta = rangeWeights.length >= 2
    ? rangeWeights[rangeWeights.length - 1].weight - rangeWeights[0].weight
    : null

  // Weight deltas per period
  const latest = weights[weights.length - 1]
  function deltaSince(fromKey: string): number | null {
    if (!latest) return null
    const baseline = [...weights].reverse().find((w) => w.date <= fromKey) ?? weights[0]
    if (!baseline || baseline.date > latest.date || baseline === latest) return null
    return latest.weight - baseline.weight
  }
  const monthDelta = deltaSince(dateKey(startOfMonth(new Date())))
  const yearDelta = deltaSince(dateKey(startOfYear(new Date())))
  const startWeight = settings?.startWeight ?? weights[0]?.weight
  const totalDelta = latest && startWeight != null ? latest.weight - startWeight : null

  // ── Calories: last 14 days ──
  const kcalFrom = dateKey(subDays(new Date(), 13))
  const food14 = useFoodEntriesByRange(kcalFrom, today)
  const exercises14 = useExercisesByRange(kcalFrom, today)
  const kcalLimit = settings?.dailyKcalLimit ?? 0

  const kcalByDay = new Map<string, number>()
  for (const f of food14) kcalByDay.set(f.date, (kcalByDay.get(f.date) ?? 0) + f.kcal)
  const kcalData = Array.from({ length: 14 }, (_, i) => {
    const d = subDays(new Date(), 13 - i)
    const key = dateKey(d)
    return { name: format(d, 'd/M'), kcal: kcalByDay.get(key) ?? 0 }
  })

  const loggedDays = kcalByDay.size
  const avgKcal = loggedDays > 0 ? sumKcal(food14) / loggedDays : 0
  const withinDays = kcalLimit > 0
    ? [...kcalByDay.values()].filter((k) => k <= kcalLimit).length
    : 0
  const totalBurned = exercises14.reduce((s, e) => s + e.kcalBurned, 0)

  // Macro averages over logged days
  const macro = food14.reduce(
    (acc, f) => ({ protein: acc.protein + (f.protein ?? 0), carbs: acc.carbs + (f.carbs ?? 0), fat: acc.fat + (f.fat ?? 0) }),
    { protein: 0, carbs: 0, fat: 0 }
  )

  return (
    <div className="min-h-screen pb-nav">
      <Header title="รายงานสุขภาพ" />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 stagger">
        {/* Weight change summary */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'เดือนนี้', v: monthDelta },
            { label: 'ปีนี้', v: yearDelta },
            { label: 'ตั้งแต่เริ่ม', v: totalDelta },
          ].map(({ label, v }) => (
            <Card key={label} className="p-3 text-center">
              <p className="text-xs text-gray-400 font-medium">{label}</p>
              {v !== null ? (
                <p className={`font-bold ${v <= 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {v > 0 ? '+' : ''}{formatWeight(v)}
                </p>
              ) : (
                <p className="font-bold text-gray-300">-</p>
              )}
              <p className="text-[10px] text-gray-400">กก.</p>
            </Card>
          ))}
        </div>

        {/* Weight trend chart */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">กราฟน้ำหนัก</p>
            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 gap-0.5">
              {RANGES.map(({ value, label }) => (
                <button key={value} onClick={() => setRange(value)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold ${range === value ? 'bg-white dark:bg-gray-700 shadow-sm text-emerald-600 dark:text-emerald-400' : 'text-gray-500'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          {weightData.length >= 2 ? (
            <>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={weightData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="repWeightGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <Area type="monotone" dataKey="weight" name="น้ำหนัก" stroke="#10b981" strokeWidth={2} fill="url(#repWeightGrad)" dot={false} />
                  {settings?.targetWeight && <ReferenceLine y={settings.targetWeight} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: 'เป้า', fontSize: 9, fill: '#94a3b8', position: 'insideTopRight' }} />}
                  <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip formatter={(v: number) => `${formatWeight(v)} กก.`} contentStyle={tooltipStyle} />
                </AreaChart>
              </ResponsiveContainer>
              {rangeDelta !== null && (
                <p className="text-xs text-gray-400 mt-1">
                  ช่วงนี้เปลี่ยน{' '}
                  <span className={`font-semibold ${rangeDelta <= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {rangeDelta > 0 ? '+' : ''}{formatWeight(rangeDelta)} กก.
                  </span>
                  {' '}(เฉลี่ย {formatWeight(rangeDelta / Math.max(1, rangeWeights.length - 1))} กก./ครั้งที่ชั่ง)
                </p>
              )}
            </>
          ) : (
            <p className="text-center text-gray-400 py-8 text-sm">ต้องมีข้อมูลน้ำหนักอย่างน้อย 2 วัน</p>
          )}
        </Card>

        {/* Kcal stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-400 font-medium">เฉลี่ย/วัน</p>
            <p className="font-bold text-emerald-500">{loggedDays > 0 ? formatKcal(avgKcal) : '-'}</p>
            <p className="text-[10px] text-gray-400">kcal (14 วัน)</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-400 font-medium">อยู่ในเป้า</p>
            <p className="font-bold text-emerald-500">{kcalLimit > 0 && loggedDays > 0 ? `${withinDays}/${loggedDays}` : '-'}</p>
            <p className="text-[10px] text-gray-400">วัน</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-400 font-medium">เผาผลาญ</p>
            <p className="font-bold text-orange-500">{totalBurned > 0 ? formatKcal(totalBurned) : '-'}</p>
            <p className="text-[10px] text-gray-400">kcal (14 วัน)</p>
          </Card>
        </div>

        {/* Kcal daily chart */}
        <Card className="p-4">
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">แคลอรี่ 14 วันล่าสุด</p>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={kcalData} barCategoryGap="25%" margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval={1} />
              <YAxis hide />
              <Tooltip formatter={(v: number) => `${formatKcal(v)} kcal`} contentStyle={tooltipStyle} />
              <Bar dataKey="kcal" name="kcal" radius={[4, 4, 0, 0]}>
                {kcalData.map((d, i) => (
                  <Cell key={i} fill={kcalLimit > 0 && d.kcal > kcalLimit ? '#ef4444' : '#10b981'} />
                ))}
              </Bar>
              {kcalLimit > 0 && <ReferenceLine y={kcalLimit} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: `เป้า ${formatKcal(kcalLimit)}`, fontSize: 9, fill: '#94a3b8', position: 'insideTopRight' }} />}
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {/* Macro averages */}
        {(macro.protein > 0 || macro.carbs > 0 || macro.fat > 0) && loggedDays > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">สารอาหารเฉลี่ยต่อวัน (14 วัน)</p>
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'โปรตีน', v: macro.protein / loggedDays, goal: settings?.proteinGoal, color: 'text-rose-500' },
                { label: 'คาร์บ', v: macro.carbs / loggedDays, goal: settings?.carbsGoal, color: 'text-amber-500' },
                { label: 'ไขมัน', v: macro.fat / loggedDays, goal: settings?.fatGoal, color: 'text-sky-500' },
              ].map(({ label, v, goal, color }) => (
                <div key={label}>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className={`font-bold ${color}`}>{Math.round(v)} ก.</p>
                  {goal ? <p className="text-[10px] text-gray-400">เป้า {goal} ก.</p> : null}
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
