import { useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, Trash2, Sparkles, Loader2, Flame, ChevronDown, ChevronUp } from 'lucide-react'
import { format, parseISO, addDays, subDays } from 'date-fns'
import { th } from 'date-fns/locale'
import {
  useFoodEntriesByDate, addFoodEntry, deleteFoodEntry, restoreFoodEntry,
  useExercisesByDate, addExercise, deleteExercise,
  useHealthSettings, sumKcal, groupByMeal,
} from '../../hooks/useHealth'
import { useUserSettings } from '../../hooks/useSettings'
import { estimateFood, DEFAULT_GROQ_MODEL } from '../../lib/groq'
import type { ParsedFood } from '../../lib/groq'
import { dateKey, MEALS, formatKcal } from '../../utils/health'
import { useSnackbar } from '../../stores/useSnackbar'
import Card from '../../components/ui/Card'
import Modal from '../../components/ui/Modal'
import Button from '../../components/ui/Button'
import Header from '../../components/layout/Header'
import type { FoodEntry, MealType } from '../../types'

const inputCls = 'w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-emerald-400'

export default function FoodLog() {
  const [date, setDate] = useState(dateKey())
  const settings = useHealthSettings()
  const userSettings = useUserSettings() // groq key lives in PocketFlow settings
  const entries = useFoodEntriesByDate(date)
  const exercises = useExercisesByDate(date)
  const { show } = useSnackbar()

  const kcalLimit = settings?.dailyKcalLimit ?? 0
  const countExercise = settings?.countExercise ?? true
  const consumed = sumKcal(entries)
  const burned = exercises.reduce((s, e) => s + e.kcalBurned, 0)
  const netKcal = consumed - (countExercise ? burned : 0)
  const pct = kcalLimit > 0 ? Math.min(100, (netKcal / kcalLimit) * 100) : 0
  const over = kcalLimit > 0 && netKcal > kcalLimit

  const totals = entries.reduce(
    (acc, e) => ({ protein: acc.protein + (e.protein ?? 0), carbs: acc.carbs + (e.carbs ?? 0), fat: acc.fat + (e.fat ?? 0) }),
    { protein: 0, carbs: 0, fat: 0 }
  )
  const mealGroups = groupByMeal(entries)
  const isToday = date === dateKey()

  // ── Add food modal ──
  const [foodModal, setFoodModal] = useState<MealType | null>(null)
  const [foodForm, setFoodForm] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' })
  const [showMacros, setShowMacros] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [aiItems, setAiItems] = useState<ParsedFood[]>([]) // AI can return multiple menus

  function openFoodModal(meal: MealType) {
    setFoodForm({ name: '', kcal: '', protein: '', carbs: '', fat: '' })
    setAiItems([]); setAiError(''); setShowMacros(false)
    setFoodModal(meal)
  }

  async function runAiEstimate() {
    if (!userSettings?.groqApiKey || !foodForm.name.trim()) return
    setAiLoading(true); setAiError(''); setAiItems([])
    try {
      const items = await estimateFood(userSettings.groqApiKey, userSettings.groqModel || DEFAULT_GROQ_MODEL, foodForm.name.trim())
      if (items.length === 0) {
        setAiError('AI ประมาณไม่ได้ ลองพิมพ์ชื่อเมนูให้ชัดขึ้น')
      } else if (items.length === 1) {
        const it = items[0]
        setFoodForm({
          name: it.name, kcal: String(it.kcal),
          protein: it.protein ? String(it.protein) : '',
          carbs: it.carbs ? String(it.carbs) : '',
          fat: it.fat ? String(it.fat) : '',
        })
        if (it.protein || it.carbs || it.fat) setShowMacros(true)
      } else {
        setAiItems(items) // let the user save all at once
      }
    } catch (e) {
      setAiError(String(e))
    } finally {
      setAiLoading(false)
    }
  }

  async function saveFood() {
    if (!foodModal) return
    if (aiItems.length > 0) {
      for (const it of aiItems) {
        await addFoodEntry({
          date, meal: foodModal, name: it.name, kcal: it.kcal,
          protein: it.protein, carbs: it.carbs, fat: it.fat, aiEstimated: true,
        })
      }
    } else {
      const kcal = parseFloat(foodForm.kcal)
      if (!foodForm.name.trim() || isNaN(kcal) || kcal < 0) return
      await addFoodEntry({
        date, meal: foodModal, name: foodForm.name.trim(), kcal: Math.round(kcal),
        protein: parseFloat(foodForm.protein) > 0 ? parseFloat(foodForm.protein) : undefined,
        carbs: parseFloat(foodForm.carbs) > 0 ? parseFloat(foodForm.carbs) : undefined,
        fat: parseFloat(foodForm.fat) > 0 ? parseFloat(foodForm.fat) : undefined,
      })
    }
    setFoodModal(null)
  }

  async function removeFood(f: FoodEntry) {
    await deleteFoodEntry(f.id)
    show(`ลบ "${f.name}" แล้ว`, () => restoreFoodEntry(f))
  }

  // ── Exercise modal ──
  const [exModal, setExModal] = useState(false)
  const [exForm, setExForm] = useState({ name: '', minutes: '', kcal: '' })

  async function saveExercise() {
    const kcal = parseFloat(exForm.kcal)
    if (!exForm.name.trim() || isNaN(kcal) || kcal <= 0) return
    await addExercise({
      date, name: exForm.name.trim(), kcalBurned: Math.round(kcal),
      minutes: parseFloat(exForm.minutes) > 0 ? parseFloat(exForm.minutes) : undefined,
    })
    setExModal(false)
  }

  const canSaveFood = aiItems.length > 0 || (foodForm.name.trim() && parseFloat(foodForm.kcal) >= 0)

  return (
    <div className="min-h-screen pb-nav">
      <Header title="บันทึกอาหาร" />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 stagger">
        {/* Date navigator */}
        <div className="flex items-center justify-between">
          <button onClick={() => setDate(dateKey(subDays(parseISO(date), 1)))} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
            <ChevronLeft size={20} />
          </button>
          <button onClick={() => setDate(dateKey())} className="text-center">
            <p className="font-bold">{isToday ? 'วันนี้' : format(parseISO(date), 'EEEE', { locale: th })}</p>
            <p className="text-xs text-gray-400">{format(parseISO(date), 'd MMMM yyyy', { locale: th })}</p>
          </button>
          <button onClick={() => setDate(dateKey(addDays(parseISO(date), 1)))} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
            <ChevronRight size={20} />
          </button>
        </div>

        {/* Daily summary */}
        <Card className="p-4">
          <div className="flex items-end justify-between mb-2">
            <div>
              <p className="text-xs text-gray-400">รวมทั้งวัน{burned > 0 && countExercise ? ' (หักออกกำลังกาย)' : ''}</p>
              <p className={`text-2xl font-bold ${over ? 'text-red-500' : 'text-emerald-500'}`}>
                {formatKcal(netKcal)} <span className="text-sm font-medium text-gray-400">kcal</span>
              </p>
            </div>
            {kcalLimit > 0 && (
              <p className={`text-xs font-semibold ${over ? 'text-red-500' : 'text-gray-400'}`}>
                {over ? `เกินเป้า ${formatKcal(netKcal - kcalLimit)}` : `เหลือ ${formatKcal(kcalLimit - netKcal)}`} / เป้า {formatKcal(kcalLimit)}
              </p>
            )}
          </div>
          {kcalLimit > 0 && (
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${over ? 'bg-red-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
            </div>
          )}
          {(totals.protein > 0 || totals.carbs > 0 || totals.fat > 0) && (
            <div className="flex gap-2 mt-3">
              {[
                { label: 'โปรตีน', v: totals.protein, goal: settings?.proteinGoal, color: 'text-rose-500 bg-rose-50 dark:bg-rose-950' },
                { label: 'คาร์บ', v: totals.carbs, goal: settings?.carbsGoal, color: 'text-amber-500 bg-amber-50 dark:bg-amber-950' },
                { label: 'ไขมัน', v: totals.fat, goal: settings?.fatGoal, color: 'text-sky-500 bg-sky-50 dark:bg-sky-950' },
              ].map(({ label, v, goal, color }) => (
                <span key={label} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${color}`}>
                  {label} {Math.round(v)}{goal ? `/${goal}` : ''} ก.
                </span>
              ))}
            </div>
          )}
        </Card>

        {/* Meal sections */}
        {MEALS.map(({ value, label, icon }) => {
          const items = mealGroups[value]
          return (
            <Card key={value}>
              <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
                <p className="font-semibold text-sm">{icon} {label}
                  {items.length > 0 && <span className="ml-2 text-xs font-semibold text-emerald-500">{formatKcal(sumKcal(items))} kcal</span>}
                </p>
                <button onClick={() => openFoodModal(value)} className="p-1.5 rounded-full text-emerald-500 active:bg-emerald-50 dark:active:bg-emerald-950">
                  <Plus size={18} />
                </button>
              </div>
              {items.length === 0 ? (
                <p className="text-xs text-gray-300 dark:text-gray-600 px-4 pb-3.5">ยังไม่มีรายการ</p>
              ) : (
                <div className="pb-1">
                  {items.map((f) => (
                    <div key={f.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-50 dark:border-gray-800">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-sm font-medium truncate">{f.name}</p>
                          {f.aiEstimated && <Sparkles size={11} className="flex-shrink-0 text-purple-400" />}
                        </div>
                        {(f.protein || f.carbs || f.fat) ? (
                          <p className="text-[10px] text-gray-400">
                            {[f.protein && `P ${f.protein}`, f.carbs && `C ${f.carbs}`, f.fat && `F ${f.fat}`].filter(Boolean).join(' · ')} ก.
                          </p>
                        ) : null}
                      </div>
                      <p className="text-sm font-semibold">{formatKcal(f.kcal)}</p>
                      <button onClick={() => removeFood(f)} className="p-1 text-gray-300 active:text-red-500">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          )
        })}

        {/* Exercise */}
        <Card>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-1">
            <p className="font-semibold text-sm"><Flame size={14} className="inline text-orange-500 mr-1" />ออกกำลังกาย
              {burned > 0 && <span className="ml-2 text-xs font-semibold text-orange-500">-{formatKcal(burned)} kcal</span>}
            </p>
            <button onClick={() => { setExForm({ name: '', minutes: '', kcal: '' }); setExModal(true) }}
              className="p-1.5 rounded-full text-orange-500 active:bg-orange-50 dark:active:bg-orange-950">
              <Plus size={18} />
            </button>
          </div>
          {exercises.length === 0 ? (
            <p className="text-xs text-gray-300 dark:text-gray-600 px-4 pb-3.5">ยังไม่มีรายการ</p>
          ) : (
            <div className="pb-1">
              {exercises.map((e) => (
                <div key={e.id} className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-50 dark:border-gray-800">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{e.name}</p>
                    {e.minutes ? <p className="text-[10px] text-gray-400">{e.minutes} นาที</p> : null}
                  </div>
                  <p className="text-sm font-semibold text-orange-500">-{formatKcal(e.kcalBurned)}</p>
                  <button onClick={() => deleteExercise(e.id)} className="p-1 text-gray-300 active:text-red-500">
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Add food modal */}
      <Modal open={foodModal !== null} onClose={() => setFoodModal(null)}
        title={`เพิ่ม${MEALS.find((m) => m.value === foodModal)?.label ?? ''}`}>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">เมนู</label>
            <input autoFocus value={foodForm.name}
              onChange={(e) => { setFoodForm({ ...foodForm, name: e.target.value }); setAiItems([]) }}
              placeholder="เช่น ข้าวมันไก่ 1 จาน กับชาเย็น" className={inputCls} />
          </div>

          {userSettings?.groqApiKey ? (
            <Button variant="secondary" fullWidth size="sm" onClick={runAiEstimate}
              disabled={aiLoading || !foodForm.name.trim()} className="flex items-center justify-center gap-1.5">
              {aiLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} className="text-purple-500" />}
              ให้ AI ประมาณ kcal จากเมนู
            </Button>
          ) : (
            <p className="text-[11px] text-gray-400">💡 ตั้งค่า Groq API key ในแอป PocketFlow → ตั้งค่า เพื่อให้ AI ประมาณ kcal ให้อัตโนมัติ</p>
          )}
          {aiError && <p className="text-xs text-red-500">{aiError}</p>}

          {aiItems.length > 0 ? (
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400">AI พบ {aiItems.length} เมนู — จะบันทึกทั้งหมด:</p>
              {aiItems.map((it, i) => (
                <div key={i} className="flex items-center justify-between bg-purple-50 dark:bg-purple-950 rounded-xl px-3 py-2">
                  <span className="text-sm">{it.name}</span>
                  <span className="text-sm font-semibold">{formatKcal(it.kcal)} kcal</span>
                </div>
              ))}
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs text-gray-400 block mb-1">แคลอรี่ (kcal)</label>
                <input type="number" inputMode="numeric" value={foodForm.kcal}
                  onChange={(e) => setFoodForm({ ...foodForm, kcal: e.target.value })}
                  placeholder="0" className={inputCls} />
              </div>
              <button onClick={() => setShowMacros(!showMacros)} className="flex items-center gap-1 text-xs text-gray-400">
                {showMacros ? <ChevronUp size={13} /> : <ChevronDown size={13} />} สารอาหาร (ไม่บังคับ)
              </button>
              {showMacros && (
                <div className="grid grid-cols-3 gap-2">
                  {([['protein', 'โปรตีน'], ['carbs', 'คาร์บ'], ['fat', 'ไขมัน']] as const).map(([k, label]) => (
                    <div key={k}>
                      <label className="text-[10px] text-gray-400 block mb-1">{label} (ก.)</label>
                      <input type="number" inputMode="decimal" value={foodForm[k]}
                        onChange={(e) => setFoodForm({ ...foodForm, [k]: e.target.value })}
                        placeholder="0" className={inputCls} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          <Button fullWidth onClick={saveFood} disabled={!canSaveFood} className="!bg-emerald-500 active:!bg-emerald-600">
            บันทึก{aiItems.length > 1 ? ` ${aiItems.length} รายการ` : ''}
          </Button>
        </div>
      </Modal>

      {/* Add exercise modal */}
      <Modal open={exModal} onClose={() => setExModal(false)} title="เพิ่มการออกกำลังกาย">
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-400 block mb-1">กิจกรรม</label>
            <input autoFocus value={exForm.name} onChange={(e) => setExForm({ ...exForm, name: e.target.value })}
              placeholder="เช่น วิ่ง, เดินเร็ว, เวทเทรนนิ่ง" className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-gray-400 block mb-1">เวลา (นาที)</label>
              <input type="number" inputMode="numeric" value={exForm.minutes}
                onChange={(e) => setExForm({ ...exForm, minutes: e.target.value })} placeholder="30" className={inputCls} />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">เผาผลาญ (kcal)</label>
              <input type="number" inputMode="numeric" value={exForm.kcal}
                onChange={(e) => setExForm({ ...exForm, kcal: e.target.value })} placeholder="200" className={inputCls} />
            </div>
          </div>
          <Button fullWidth onClick={saveExercise} disabled={!exForm.name.trim() || !(parseFloat(exForm.kcal) > 0)}
            className="!bg-orange-500 active:!bg-orange-600">
            บันทึก
          </Button>
        </div>
      </Modal>
    </div>
  )
}
