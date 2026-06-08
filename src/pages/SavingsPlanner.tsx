import { useState, useMemo } from 'react'
import { Plus, Trash2, Edit2, ChevronRight } from 'lucide-react'
import { format, differenceInDays, differenceInMonths, addMonths, startOfDay } from 'date-fns'
import { th } from 'date-fns/locale'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import {
  useSavingsPlans, useSavingsCashFlows,
  addSavingsPlan, updateSavingsPlan, deleteSavingsPlan,
  addSavingsCashFlow, updateSavingsCashFlow, deleteSavingsCashFlow,
} from '../hooks/useSavingsPlans'
import { useAppStore } from '../stores/useAppStore'
import Header from '../components/layout/Header'
import Card from '../components/ui/Card'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import { formatAmount } from '../utils/formatters'
import type { SavingsPlan, SavingsCashFlow } from '../types'

const CF_FREQ_LABELS: Record<SavingsCashFlow['frequency'], string> = {
  daily: 'รายวัน',
  weekly: 'รายสัปดาห์',
  monthly: 'รายเดือน',
}

function abbr(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return String(Math.round(n))
}

function countWeekdays(from: Date, totalDays: number): number {
  const fullWeeks = Math.floor(totalDays / 7)
  const remainder = totalDays % 7
  let days = fullWeeks * 5
  const startDay = from.getDay()
  for (let i = 1; i <= remainder; i++) {
    const d = (startDay + i) % 7
    if (d !== 0 && d !== 6) days++
  }
  return days
}

function projectBalanceAt(plan: SavingsPlan, cashFlows: SavingsCashFlow[], checkDate: Date): number {
  const today = startOfDay(new Date())
  const to = startOfDay(checkDate)
  if (to <= today) return plan.initialAmount
  const totalDays = differenceInDays(to, today)
  let balance = plan.initialAmount
  for (const cf of cashFlows) {
    let units = 0
    if (cf.frequency === 'monthly') units = differenceInMonths(to, today)
    else if (cf.frequency === 'weekly') units = Math.floor(totalDays / 7)
    else units = cf.countWeekends ? totalDays : countWeekdays(today, totalDays)
    const contribution = cf.amount * units
    if (cf.type === 'income') balance += contribution
    else balance -= contribution
  }
  return balance
}

function generateChartData(plan: SavingsPlan, cashFlows: SavingsCashFlow[]) {
  const today = startOfDay(new Date())
  const target = startOfDay(plan.targetDate)
  if (target <= today) return []
  const totalMonths = Math.max(1, differenceInMonths(target, today) + 1)
  const step = Math.max(1, Math.ceil(totalMonths / 24))
  const points: { label: string; balance: number }[] = [
    { label: 'วันนี้', balance: Math.round(plan.initialAmount) },
  ]
  let d = addMonths(today, step)
  while (differenceInDays(target, d) > 0) {
    points.push({
      label: format(d, 'MMM yy', { locale: th }),
      balance: Math.round(projectBalanceAt(plan, cashFlows, d)),
    })
    d = addMonths(d, step)
  }
  const lastLabel = format(target, 'd MMM yy', { locale: th })
  const targetBalance = Math.round(projectBalanceAt(plan, cashFlows, target))
  if (points[points.length - 1]?.label !== lastLabel) {
    points.push({ label: lastLabel, balance: targetBalance })
  }
  return points
}

const EMPTY_PLAN_FORM = {
  name: '',
  targetAmount: '',
  targetDate: format(addMonths(new Date(), 12), 'yyyy-MM-dd'),
  initialAmount: '',
  note: '',
}

const EMPTY_CF_FORM = {
  name: '',
  type: 'income' as 'income' | 'expense',
  amount: '',
  frequency: 'monthly' as SavingsCashFlow['frequency'],
  countWeekends: true,
}

export default function SavingsPlanner() {
  const plans = useSavingsPlans()
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const cashFlows = useSavingsCashFlows(selectedPlanId ?? '')
  const { setSubPage } = useAppStore()

  const [planModal, setPlanModal] = useState(false)
  const [editingPlan, setEditingPlan] = useState<SavingsPlan | null>(null)
  const [planForm, setPlanForm] = useState(EMPTY_PLAN_FORM)

  const [cfModal, setCfModal] = useState(false)
  const [editingCf, setEditingCf] = useState<SavingsCashFlow | null>(null)
  const [cfForm, setCfForm] = useState(EMPTY_CF_FORM)

  const [deletePlanConfirm, setDeletePlanConfirm] = useState<SavingsPlan | null>(null)
  const [deleteCfConfirm, setDeleteCfConfirm] = useState<SavingsCashFlow | null>(null)
  const [checkDate, setCheckDate] = useState('')

  const selectedPlan = plans.find((p) => p.id === selectedPlanId)
  const isDetailView = !!selectedPlanId && !!selectedPlan

  const chartData = useMemo(
    () => (selectedPlan ? generateChartData(selectedPlan, cashFlows) : []),
    [selectedPlan, cashFlows]
  )
  const projectedOnTarget = useMemo(
    () => (selectedPlan ? projectBalanceAt(selectedPlan, cashFlows, selectedPlan.targetDate) : 0),
    [selectedPlan, cashFlows]
  )
  const projectedOnCheckDate = useMemo(() => {
    if (!selectedPlan || !checkDate) return null
    return projectBalanceAt(selectedPlan, cashFlows, new Date(checkDate + 'T00:00:00'))
  }, [selectedPlan, cashFlows, checkDate])

  function openAddPlan() {
    setEditingPlan(null)
    setPlanForm(EMPTY_PLAN_FORM)
    setPlanModal(true)
  }

  function openEditPlan(plan: SavingsPlan) {
    setEditingPlan(plan)
    setPlanForm({
      name: plan.name,
      targetAmount: String(plan.targetAmount),
      targetDate: format(plan.targetDate, 'yyyy-MM-dd'),
      initialAmount: String(plan.initialAmount),
      note: plan.note ?? '',
    })
    setPlanModal(true)
  }

  async function handleSavePlan() {
    const target = parseFloat(planForm.targetAmount)
    const initial = parseFloat(planForm.initialAmount) || 0
    if (!planForm.name.trim() || !target || !planForm.targetDate) return
    const data = {
      name: planForm.name.trim(),
      targetAmount: target,
      targetDate: new Date(planForm.targetDate + 'T00:00:00'),
      initialAmount: initial,
      note: planForm.note.trim() || undefined,
    }
    if (editingPlan) await updateSavingsPlan(editingPlan.id, data)
    else await addSavingsPlan(data)
    setPlanModal(false)
  }

  function openAddCf() {
    setEditingCf(null)
    setCfForm(EMPTY_CF_FORM)
    setCfModal(true)
  }

  function openEditCf(cf: SavingsCashFlow) {
    setEditingCf(cf)
    setCfForm({
      name: cf.name,
      type: cf.type,
      amount: String(cf.amount),
      frequency: cf.frequency,
      countWeekends: cf.countWeekends,
    })
    setCfModal(true)
  }

  async function handleSaveCf() {
    const amt = parseFloat(cfForm.amount)
    if (!cfForm.name.trim() || !amt || !selectedPlanId) return
    const data = { planId: selectedPlanId, name: cfForm.name.trim(), type: cfForm.type, amount: amt, frequency: cfForm.frequency, countWeekends: cfForm.countWeekends }
    if (editingCf) await updateSavingsCashFlow(editingCf.id, data)
    else await addSavingsCashFlow(data)
    setCfModal(false)
  }

  const netMonthly = cashFlows.reduce((sum, cf) => {
    const monthly = cf.frequency === 'daily' ? cf.amount * (cf.countWeekends ? 30 : 22)
      : cf.frequency === 'weekly' ? cf.amount * 4.33
      : cf.amount
    return cf.type === 'income' ? sum + monthly : sum - monthly
  }, 0)

  return (
    <div className="min-h-screen pb-nav">
      {isDetailView ? (
        <Header
          title={selectedPlan.name}
          showBack
          onBack={() => setSelectedPlanId(null)}
          right={
            <div className="flex items-center">
              <button onClick={() => openEditPlan(selectedPlan)} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
                <Edit2 size={18} />
              </button>
              <button onClick={() => setDeletePlanConfirm(selectedPlan)} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
                <Trash2 size={18} />
              </button>
            </div>
          }
        />
      ) : (
        <Header
          title="วางแผนการออม"
          showBack
          right={
            <button onClick={openAddPlan} className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800">
              <Plus size={20} />
            </button>
          }
        />
      )}

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* ── LIST VIEW ── */}
        {!isDetailView && (
          plans.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-5xl mb-3">🎯</p>
              <p className="text-gray-400 mb-4">ยังไม่มีแผนออมเงิน</p>
              <Button onClick={openAddPlan}>สร้างแผนแรก</Button>
            </div>
          ) : (
            plans.map((plan) => {
              const progress = Math.min(100, Math.round((plan.initialAmount / plan.targetAmount) * 100))
              const daysLeft = differenceInDays(startOfDay(plan.targetDate), startOfDay(new Date()))
              return (
                <Card
                  key={plan.id}
                  className="p-4 cursor-pointer active:scale-[0.99] transition-transform"
                  onClick={() => { setSelectedPlanId(plan.id); setCheckDate(format(plan.targetDate, 'yyyy-MM-dd')) }}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-950 flex items-center justify-center text-xl flex-shrink-0">
                      🎯
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold truncate">{plan.name}</p>
                        <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                      </div>
                      <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">
                        ฿{formatAmount(plan.initialAmount)} / ฿{formatAmount(plan.targetAmount)}
                      </p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {format(plan.targetDate, 'd MMM yyyy', { locale: th })}
                        {daysLeft > 0 ? ` · อีก ${daysLeft} วัน` : daysLeft === 0 ? ' · วันนี้!' : ' · เกินกำหนด'}
                      </p>
                      <div className="mt-2 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full bg-indigo-500 transition-all"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </Card>
              )
            })
          )
        )}

        {/* ── DETAIL VIEW ── */}
        {isDetailView && (
          <>
            {/* Summary */}
            <Card className="p-4">
              <div className="grid grid-cols-2 gap-y-3 gap-x-4">
                <div>
                  <p className="text-xs text-gray-400">เป้าหมาย</p>
                  <p className="font-bold text-indigo-600 dark:text-indigo-400">฿{formatAmount(selectedPlan.targetAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">วันเป้าหมาย</p>
                  <p className="font-semibold text-sm">{format(selectedPlan.targetDate, 'd MMM yyyy', { locale: th })}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">ยอดเริ่มต้น</p>
                  <p className="font-semibold text-sm">฿{formatAmount(selectedPlan.initialAmount)}</p>
                </div>
                <div>
                  <p className="text-xs text-gray-400">คาดการณ์ถึงเป้า</p>
                  <p className={`font-bold text-sm ${projectedOnTarget >= selectedPlan.targetAmount ? 'text-green-500' : 'text-red-500'}`}>
                    ฿{formatAmount(Math.round(projectedOnTarget))}
                    {projectedOnTarget >= selectedPlan.targetAmount ? ' ✓' : ' ✗'}
                  </p>
                </div>
              </div>
              {cashFlows.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <p className="text-xs text-gray-400">กระแสสุทธิ/เดือน (ประมาณ)</p>
                  <p className={`text-sm font-semibold ${netMonthly >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                    {netMonthly >= 0 ? '+' : ''}฿{formatAmount(Math.round(netMonthly))}
                  </p>
                </div>
              )}
              {selectedPlan.note && (
                <p className="text-sm text-gray-400 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">{selectedPlan.note}</p>
              )}
            </Card>

            {/* Chart */}
            {chartData.length > 1 && (
              <Card className="p-4">
                <p className="text-sm font-semibold mb-3">แนวโน้มยอดเงิน</p>
                <ResponsiveContainer width="100%" height={180}>
                  <AreaChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                    <YAxis
                      tickFormatter={(v) => `฿${abbr(v)}`}
                      tick={{ fontSize: 10 }}
                      width={58}
                    />
                    <Tooltip
                      formatter={(v: number) => [`฿${formatAmount(v)}`, 'ยอดเงิน']}
                      labelStyle={{ fontSize: 12 }}
                      contentStyle={{ borderRadius: 12, fontSize: 12 }}
                    />
                    <ReferenceLine
                      y={selectedPlan.targetAmount}
                      stroke="#22c55e"
                      strokeDasharray="5 3"
                      strokeWidth={1.5}
                      label={{ value: '🎯', position: 'right', fontSize: 12 }}
                    />
                    <Area
                      type="monotone"
                      dataKey="balance"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#savingsGrad)"
                      dot={false}
                      activeDot={{ r: 4 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Card>
            )}

            {/* Check date */}
            <Card className="p-4">
              <p className="text-sm font-semibold mb-3">ตรวจสอบยอดคาดการณ์ ณ วันที่</p>
              <div className="flex items-center gap-3">
                <input
                  type="date"
                  value={checkDate}
                  onChange={(e) => setCheckDate(e.target.value)}
                  className="flex-1 px-3 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
                />
                {projectedOnCheckDate !== null && (
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-gray-400">คาดการณ์</p>
                    <p className={`text-base font-bold ${projectedOnCheckDate >= selectedPlan.targetAmount ? 'text-green-500' : 'text-indigo-600'}`}>
                      ฿{formatAmount(Math.round(projectedOnCheckDate))}
                    </p>
                  </div>
                )}
              </div>
            </Card>

            {/* Cash flows */}
            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold">กระแสเงินสดต่อเนื่อง</p>
                <button onClick={openAddCf} className="flex items-center gap-1 text-sm text-indigo-500">
                  <Plus size={14} /> เพิ่ม
                </button>
              </div>
              {cashFlows.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">ยังไม่มีรายการ — เพิ่มรายรับ/รายจ่ายที่ต้องการ</p>
              ) : (
                <div className="space-y-2">
                  {cashFlows.map((cf) => (
                    <div key={cf.id} className="flex items-center gap-3 p-2.5 rounded-xl bg-gray-50 dark:bg-gray-800">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${cf.type === 'income' ? 'bg-green-100 dark:bg-green-950 text-green-600' : 'bg-red-100 dark:bg-red-950 text-red-600'}`}>
                        {cf.type === 'income' ? '+' : '−'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{cf.name}</p>
                        <p className="text-xs text-gray-400">
                          ฿{formatAmount(cf.amount)} · {CF_FREQ_LABELS[cf.frequency]}
                          {cf.frequency === 'daily' && !cf.countWeekends ? ' (ไม่นับวันหยุด)' : ''}
                        </p>
                      </div>
                      <button onClick={() => openEditCf(cf)} className="p-1.5 rounded-lg text-gray-400 active:bg-gray-200 dark:active:bg-gray-700">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => setDeleteCfConfirm(cf)} className="p-1.5 rounded-lg text-gray-400 active:bg-gray-200 dark:active:bg-gray-700">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </>
        )}
      </div>

      {/* ── PLAN MODAL ── */}
      <Modal open={planModal} onClose={() => setPlanModal(false)} title={editingPlan ? 'แก้ไขแผน' : 'สร้างแผนออมเงิน'}>
        <div className="space-y-4">
          <input
            type="text"
            value={planForm.name}
            onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อแผน เช่น ซื้อรถ, เที่ยวญี่ปุ่น..."
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
          />
          <div>
            <label className="text-xs text-gray-500 block mb-1">เป้าหมาย (฿)</label>
            <input
              type="number"
              value={planForm.targetAmount}
              onChange={(e) => setPlanForm((f) => ({ ...f, targetAmount: e.target.value }))}
              placeholder="จำนวนเงิน"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">วันเป้าหมาย</label>
            <input
              type="date"
              value={planForm.targetDate}
              onChange={(e) => setPlanForm((f) => ({ ...f, targetDate: e.target.value }))}
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">ยอดเริ่มต้น (฿)</label>
            <input
              type="number"
              value={planForm.initialAmount}
              onChange={(e) => setPlanForm((f) => ({ ...f, initialAmount: e.target.value }))}
              placeholder="0"
              className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
            />
          </div>
          <input
            type="text"
            value={planForm.note}
            onChange={(e) => setPlanForm((f) => ({ ...f, note: e.target.value }))}
            placeholder="บันทึก (ไม่บังคับ)..."
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
          />
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setPlanModal(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSavePlan}>บันทึก</Button>
          </div>
        </div>
      </Modal>

      {/* ── CASHFLOW MODAL ── */}
      <Modal open={cfModal} onClose={() => setCfModal(false)} title={editingCf ? 'แก้ไขรายการ' : 'เพิ่มกระแสเงินสด'}>
        <div className="space-y-4">
          <input
            type="text"
            value={cfForm.name}
            onChange={(e) => setCfForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="ชื่อ เช่น เงินเดือน, ค่าเช่า..."
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
          />
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1 gap-1">
            {(['income', 'expense'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setCfForm((f) => ({ ...f, type: t }))}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold ${cfForm.type === t ? (t === 'income' ? 'bg-green-500 text-white' : 'bg-red-500 text-white') : 'text-gray-500'}`}
              >
                {t === 'income' ? 'รายรับ' : 'รายจ่าย'}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={cfForm.amount}
            onChange={(e) => setCfForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="จำนวนเงิน"
            className="w-full px-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
          />
          <div>
            <label className="text-xs text-gray-500 block mb-1">ความถี่</label>
            <div className="flex gap-2">
              {(['daily', 'weekly', 'monthly'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setCfForm((frm) => ({ ...frm, frequency: f }))}
                  className={`flex-1 py-1.5 rounded-xl text-sm border-2 ${cfForm.frequency === f ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  {CF_FREQ_LABELS[f]}
                </button>
              ))}
            </div>
          </div>
          {cfForm.frequency === 'daily' && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={cfForm.countWeekends}
                onChange={(e) => setCfForm((f) => ({ ...f, countWeekends: e.target.checked }))}
                className="w-4 h-4 accent-indigo-500"
              />
              <span className="text-sm">นับวันเสาร์-อาทิตย์ด้วย</span>
            </label>
          )}
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setCfModal(false)}>ยกเลิก</Button>
            <Button fullWidth onClick={handleSaveCf}>บันทึก</Button>
          </div>
        </div>
      </Modal>

      {/* ── DELETE PLAN CONFIRM ── */}
      <Modal open={!!deletePlanConfirm} onClose={() => setDeletePlanConfirm(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ลบแผน <span className="font-semibold">"{deletePlanConfirm?.name}"</span> และกระแสเงินสดทั้งหมดใช่หรือไม่?
          </p>
          <p className="text-xs text-gray-400">รายการ transaction ที่บันทึกไปแล้วจะไม่ถูกลบ</p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeletePlanConfirm(null)}>ยกเลิก</Button>
            <Button variant="danger" fullWidth onClick={async () => {
              await deleteSavingsPlan(deletePlanConfirm!.id)
              setDeletePlanConfirm(null)
              setSelectedPlanId(null)
            }}>ลบ</Button>
          </div>
        </div>
      </Modal>

      {/* ── DELETE CASHFLOW CONFIRM ── */}
      <Modal open={!!deleteCfConfirm} onClose={() => setDeleteCfConfirm(null)} title="ยืนยันการลบ">
        <div className="space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            ลบ <span className="font-semibold">"{deleteCfConfirm?.name}"</span> ออกจากแผนนี้ใช่หรือไม่?
          </p>
          <div className="flex gap-3">
            <Button variant="secondary" fullWidth onClick={() => setDeleteCfConfirm(null)}>ยกเลิก</Button>
            <Button variant="danger" fullWidth onClick={async () => {
              await deleteSavingsCashFlow(deleteCfConfirm!.id)
              setDeleteCfConfirm(null)
            }}>ลบ</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
