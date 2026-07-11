import { useState } from 'react'
import { ChevronLeft, ChevronRight, Scale, Flame } from 'lucide-react'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, startOfWeek, endOfWeek, addMonths, subMonths, parseISO } from 'date-fns'
import { th } from 'date-fns/locale'
import { useFoodEntriesByRange, useExercisesByRange, useWeightEntries, useHealthSettings, sumKcal, groupByMeal } from '@/apps/health/hooks/useHealth'
import { dateKey, MEALS, formatKcal, formatWeight, mealLabel } from '@/apps/health/utils/health'
import Card from '@/components/ui/Card'
import Header from '@/components/layout/Header'

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export default function HealthCalendar() {
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState<string | null>(null)

  const fromKey = dateKey(startOfMonth(current))
  const toKey = dateKey(endOfMonth(current))

  const monthFood = useFoodEntriesByRange(fromKey, toKey)
  const monthExercises = useExercisesByRange(fromKey, toKey)
  const weights = useWeightEntries() // all, sorted asc
  const settings = useHealthSettings()
  const kcalLimit = settings?.dailyKcalLimit ?? 0

  const kcalByDay = new Map<string, number>()
  for (const f of monthFood) kcalByDay.set(f.date, (kcalByDay.get(f.date) ?? 0) + f.kcal)
  const weightByDay = new Map(weights.map((w) => [w.date, w.weight]))

  // Month weight summary: first vs last entry within the month
  const monthWeights = weights.filter((w) => w.date >= fromKey && w.date <= toKey)
  const monthDelta = monthWeights.length >= 2
    ? monthWeights[monthWeights.length - 1].weight - monthWeights[0].weight
    : null

  const loggedDays = kcalByDay.size
  const avgKcal = loggedDays > 0 ? sumKcal(monthFood) / loggedDays : 0

  const calStart = startOfWeek(startOfMonth(current), { weekStartsOn: 0 })
  const calEnd = endOfWeek(endOfMonth(current), { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  // Selected-day details
  const selectedFood = selected ? monthFood.filter((f) => f.date === selected) : []
  const selectedExercises = selected ? monthExercises.filter((e) => e.date === selected) : []
  const selectedWeight = selected ? weightByDay.get(selected) : undefined
  // change vs the closest earlier logged weight
  const prevWeight = selected
    ? [...weights].reverse().find((w) => w.date < selected)?.weight
    : undefined
  const selectedGroups = groupByMeal(selectedFood)

  return (
    <div className="min-h-screen pb-nav">
      <Header title="ปฏิทินสุขภาพ" />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Month Navigator */}
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrent((c) => subMonths(c, 1))} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
            <ChevronLeft size={20} />
          </button>
          <div className="text-center">
            <p className="font-bold text-lg">{format(current, 'MMMM', { locale: th })}</p>
            <p className="text-sm text-gray-400">{format(current, 'yyyy')}</p>
          </div>
          <button onClick={() => setCurrent((c) => addMonths(c, 1))} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Month Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-3 text-center">
            <p className="text-xs text-emerald-500 font-medium">เฉลี่ย kcal/วัน</p>
            <p className="font-bold text-emerald-500">{loggedDays > 0 ? formatKcal(avgKcal) : '-'}</p>
            <p className="text-[10px] text-gray-400">{loggedDays} วันที่บันทึก</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-400 font-medium">น้ำหนักเดือนนี้</p>
            {monthDelta !== null ? (
              <p className={`font-bold ${monthDelta <= 0 ? 'text-green-500' : 'text-red-500'}`}>
                {monthDelta > 0 ? '+' : ''}{formatWeight(monthDelta)} กก.
              </p>
            ) : (
              <p className="font-bold text-gray-300">-</p>
            )}
            <p className="text-[10px] text-gray-400">{monthWeights.length} ครั้งที่ชั่ง</p>
          </Card>
        </div>

        {/* Calendar Grid */}
        <Card className="p-4">
          <div className="grid grid-cols-7 mb-2">
            {WEEKDAYS.map((d) => (
              <div key={d} className="text-center text-xs text-gray-400 font-medium py-1">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {days.map((day) => {
              const key = dateKey(day)
              const kcal = kcalByDay.get(key)
              const hasWeight = weightByDay.has(key)
              const isCurrentMonth = isSameMonth(day, current)
              const isSelected = selected === key
              const isToday = isSameDay(day, new Date())
              const overLimit = kcal !== undefined && kcalLimit > 0 && kcal > kcalLimit

              return (
                <button
                  key={key}
                  onClick={() => setSelected(isSelected ? null : key)}
                  className={`relative flex flex-col items-center py-1.5 rounded-xl transition-colors ${
                    isSelected ? 'bg-emerald-500 text-white' : isToday ? 'bg-emerald-50 dark:bg-emerald-950' : 'active:bg-gray-100 dark:active:bg-gray-800'
                  } ${!isCurrentMonth ? 'opacity-25' : ''}`}
                >
                  {hasWeight && (
                    <span className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-sky-500'}`} />
                  )}
                  <span className={`text-sm font-medium ${isToday && !isSelected ? 'text-emerald-500' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  {kcal !== undefined && (
                    <span className={`text-[9px] font-bold leading-tight ${
                      isSelected ? 'text-white/90' : overLimit ? 'text-red-500' : 'text-emerald-500'
                    }`}>
                      {formatKcal(kcal)}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <div className="flex gap-4 mt-3 text-[10px] text-gray-400">
            <span><span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-500 mr-1" />ชั่งน้ำหนัก</span>
            {kcalLimit > 0 && <span><span className="text-red-500 font-bold mr-1">123</span>เกินเป้า kcal</span>}
          </div>
        </Card>

        {/* Selected Day Details */}
        {selected && (
          <div className="space-y-3">
            <p className="font-semibold text-sm text-gray-500">{format(parseISO(selected), 'd MMMM yyyy', { locale: th })}</p>

            {selectedWeight !== undefined && (
              <Card className="p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-sky-50 dark:bg-sky-950 flex items-center justify-center flex-shrink-0">
                  <Scale size={18} className="text-sky-500" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-medium">น้ำหนัก {formatWeight(selectedWeight)} กก.</p>
                  {prevWeight !== undefined && (
                    <p className={`text-xs font-semibold ${selectedWeight - prevWeight <= 0 ? 'text-green-500' : 'text-red-500'}`}>
                      {selectedWeight - prevWeight > 0 ? '+' : ''}{formatWeight(selectedWeight - prevWeight)} กก. จากครั้งก่อน
                    </p>
                  )}
                </div>
              </Card>
            )}

            {selectedFood.length === 0 && selectedExercises.length === 0 ? (
              <Card className="p-4 text-center text-gray-400 text-sm">ไม่มีบันทึกอาหาร</Card>
            ) : (
              <Card>
                {MEALS.map(({ value, icon }) => {
                  const items = selectedGroups[value]
                  if (items.length === 0) return null
                  return (
                    <div key={value} className="px-4 py-3 border-b border-gray-50 dark:border-gray-800 last:border-b-0">
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-xs font-semibold text-gray-400">{icon} {mealLabel(value)}</p>
                        <p className="text-xs font-semibold text-emerald-500">{formatKcal(sumKcal(items))} kcal</p>
                      </div>
                      {items.map((f) => (
                        <div key={f.id} className="flex justify-between text-sm py-0.5">
                          <span className="truncate">{f.name}</span>
                          <span className="text-gray-400 flex-shrink-0 ml-2">{formatKcal(f.kcal)}</span>
                        </div>
                      ))}
                    </div>
                  )
                })}
                {selectedExercises.length > 0 && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold text-gray-400 mb-1"><Flame size={11} className="inline text-orange-500" /> ออกกำลังกาย</p>
                    {selectedExercises.map((e) => (
                      <div key={e.id} className="flex justify-between text-sm py-0.5">
                        <span className="truncate">{e.name}{e.minutes ? ` · ${e.minutes} นาที` : ''}</span>
                        <span className="text-orange-500 flex-shrink-0 ml-2">-{formatKcal(e.kcalBurned)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
