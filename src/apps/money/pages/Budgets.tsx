import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Target, Wallet } from 'lucide-react'
import { db, LOCAL_USER_ID } from '@/db/db'
import { useAuthStore } from '@/stores/useAuthStore'
import { useTags, updateTag } from '@/apps/money/hooks/useTags'
import { useUserSettings, saveUserSettings } from '@/hooks/useSettings'
import Header from '@/components/layout/Header'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import IconDisplay from '@/components/ui/IconDisplay'
import CountUpAmount from '@/components/ui/CountUpAmount'
import { formatAmount } from '@/utils/formatters'
import { getMonthRange } from '@/utils/dateHelpers'
import { WEEKDAY_LABELS } from '@/apps/money/utils/allowance'
import { format } from 'date-fns'
import { th } from 'date-fns/locale'
import type { Tag } from '@/types'

function barColor(pct: number): string {
  if (pct > 100) return '#ef4444'
  if (pct >= 70) return '#f59e0b'
  return '#22c55e'
}

export default function Budgets() {
  const tags = useTags()
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  const now = new Date()
  const [from, to] = getMonthRange(now)

  const [budgetModal, setBudgetModal] = useState<Tag | null>(null)
  const [budgetInput, setBudgetInput] = useState('')
  const [dailyInput, setDailyInput] = useState('')

  // Overall daily allowance config
  const settings = useUserSettings()
  const [allowanceInput, setAllowanceInput] = useState('')
  useEffect(() => {
    setAllowanceInput(settings?.dailyAllowance ? String(settings.dailyAllowance) : '')
  }, [settings?.dailyAllowance])
  const rollover = settings?.allowanceRollover ?? false
  const resetWeekday = settings?.allowanceResetWeekday ?? 1

  const monthExpenses = useLiveQuery(
    () => db.transactions
      .where('date').between(from, to, true, true)
      .filter((t) => t.userId === userId && t.type === 'expense')
      .toArray(),
    [userId, from.getTime()]
  ) ?? []

  const spentByTag = new Map<string, number>()
  for (const t of monthExpenses) {
    if (t.tagId) spentByTag.set(t.tagId, (spentByTag.get(t.tagId) ?? 0) + t.amount)
  }

  const expenseTags = tags.filter((t) => t.type !== 'income')
  const budgeted = expenseTags
    .filter((t) => (t.monthlyBudget ?? 0) > 0)
    .map((tag) => {
      const spent = spentByTag.get(tag.id) ?? 0
      const budget = tag.monthlyBudget!
      return { tag, spent, budget, pct: (spent / budget) * 100 }
    })
    .sort((a, b) => b.pct - a.pct)
  const unbudgeted = expenseTags.filter((t) => !((t.monthlyBudget ?? 0) > 0))

  const totalBudget = budgeted.reduce((s, b) => s + b.budget, 0)
  const totalSpent = budgeted.reduce((s, b) => s + b.spent, 0)
  const totalPct = totalBudget > 0 ? (totalSpent / totalBudget) * 100 : 0

  function openSetBudget(tag: Tag) {
    setBudgetInput(tag.monthlyBudget ? String(tag.monthlyBudget) : '')
    setDailyInput(tag.dailyBudget ? String(tag.dailyBudget) : '')
    setBudgetModal(tag)
  }

  async function saveBudget() {
    if (!budgetModal) return
    const monthly = parseFloat(budgetInput)
    const daily = parseFloat(dailyInput)
    await updateTag(budgetModal.id, {
      monthlyBudget: monthly > 0 ? monthly : undefined,
      dailyBudget: daily > 0 ? daily : undefined,
    })
    setBudgetModal(null)
  }

  function saveAllowanceAmount() {
    const val = parseFloat(allowanceInput)
    saveUserSettings({ dailyAllowance: val > 0 ? val : undefined })
  }

  return (
    <div className="min-h-screen pb-nav">
      <Header title="งบประมาณ" showBack />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4 stagger">
        <p className="text-xs text-gray-400 text-center">{format(now, 'MMMM yyyy', { locale: th })}</p>

        {/* Daily allowance config */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Wallet size={18} className="text-indigo-500" />
            <p className="font-semibold text-sm">เงินใช้จ่ายต่อวัน</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">จำนวนต่อวัน (รวมทุกหมวด)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-gray-400">฿</span>
              <input
                type="number" inputMode="decimal" value={allowanceInput}
                onChange={(e) => setAllowanceInput(e.target.value)}
                onBlur={saveAllowanceAmount}
                placeholder="0 = ปิด"
                className="w-full pl-7 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
              />
            </div>
          </div>
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              onClick={() => saveUserSettings({ allowanceRollover: !rollover })}
              className={`w-11 h-6 rounded-full transition-colors flex items-center flex-shrink-0 ${rollover ? 'bg-indigo-500' : 'bg-gray-300 dark:bg-gray-600'}`}
            >
              <span className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${rollover ? 'translate-x-5' : ''}`} />
            </button>
            <div className="flex-1">
              <p className="text-sm font-medium">ทบยอดที่เหลือ</p>
              <p className="text-xs text-gray-400">เหลือจากวันก่อนสะสมไปวันถัดไป</p>
            </div>
          </label>
          {rollover && (
            <div>
              <label className="text-xs text-gray-500 block mb-1">เริ่มนับใหม่ทุกวัน</label>
              <div className="flex gap-1.5 flex-wrap">
                {WEEKDAY_LABELS.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => saveUserSettings({ allowanceResetWeekday: i })}
                    className={`w-9 h-9 rounded-xl text-sm border-2 ${resetWeekday === i ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950 text-indigo-600' : 'border-gray-200 dark:border-gray-700'}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          )}
        </Card>

        {budgeted.length > 0 && (
          <Card className="p-5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
            <p className="text-indigo-200 text-sm font-medium">งบประมาณรวมเดือนนี้</p>
            <div className="flex items-end justify-between mt-1">
              <p className="text-3xl font-bold">฿<CountUpAmount value={totalSpent} /></p>
              <p className="text-indigo-200 text-sm mb-1">/ ฿{formatAmount(totalBudget)}</p>
            </div>
            <div className="h-2.5 bg-white/25 rounded-full overflow-hidden mt-3">
              <div
                className="h-full rounded-full bg-white transition-all duration-500"
                style={{ width: `${Math.min(100, totalPct)}%` }}
              />
            </div>
            <p className="text-xs text-indigo-100 mt-2">
              {totalPct > 100
                ? `⚠️ เกินงบรวม ฿${formatAmount(totalSpent - totalBudget)}`
                : `เหลือใช้ได้อีก ฿${formatAmount(totalBudget - totalSpent)} (${(100 - totalPct).toFixed(0)}%)`}
            </p>
          </Card>
        )}

        {/* Budgeted tags */}
        {budgeted.length === 0 ? (
          <div className="text-center py-12">
            <Target size={40} className="mx-auto mb-3 text-gray-300" />
            <p className="text-gray-400 mb-1">ยังไม่ได้ตั้งงบประมาณ</p>
            <p className="text-xs text-gray-400">กดที่หมวดหมู่ด้านล่างเพื่อตั้งงบรายเดือน</p>
          </div>
        ) : (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-4">งบรายหมวด</p>
            <div className="space-y-4">
              {budgeted.map(({ tag, spent, budget, pct }) => {
                const color = barColor(pct)
                return (
                  <button key={tag.id} onClick={() => openSetBudget(tag)} className="block w-full text-left">
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden text-base flex-shrink-0"
                          style={{ backgroundColor: tag.color + '22' }}>
                          <IconDisplay icon={tag.icon} />
                        </div>
                        <span className="text-sm font-medium">{tag.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold" style={{ color }}>฿{formatAmount(spent)}</span>
                        <span className="text-xs text-gray-400"> / ฿{formatAmount(budget)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: color }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <p className="text-xs font-medium" style={{ color }}>
                        {pct > 100 ? `⚠️ เกินงบ ฿${formatAmount(spent - budget)}`
                          : pct >= 70 ? `⚡ ใช้ไป ${pct.toFixed(0)}%`
                          : `✓ ใช้ไป ${pct.toFixed(0)}%`}
                      </p>
                      {pct <= 100 && <p className="text-xs text-gray-400">เหลือ ฿{formatAmount(budget - spent)}</p>}
                    </div>
                  </button>
                )
              })}
            </div>
          </Card>
        )}

        {/* Tags without budget */}
        {unbudgeted.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">ยังไม่ตั้งงบ — แตะเพื่อตั้ง</p>
            <div className="flex gap-2 flex-wrap">
              {unbudgeted.map((tag) => {
                const spent = spentByTag.get(tag.id) ?? 0
                return (
                  <button key={tag.id} onClick={() => openSetBudget(tag)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500">
                    <span className="w-4 h-4 flex items-center justify-center overflow-hidden">
                      <IconDisplay icon={tag.icon} />
                    </span>
                    {tag.name}
                    {spent > 0 && <span className="text-xs text-gray-400">฿{formatAmount(spent)}</span>}
                  </button>
                )
              })}
            </div>
          </Card>
        )}
      </div>

      {/* Set budget modal */}
      <Modal open={!!budgetModal} onClose={() => setBudgetModal(null)} title={`ตั้งงบ — ${budgetModal?.name ?? ''}`}>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 block mb-1">งบประมาณต่อเดือน (฿)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-gray-400">฿</span>
              <input
                type="number"
                value={budgetInput}
                onChange={(e) => setBudgetInput(e.target.value)}
                placeholder="0 = ไม่ตั้งงบ"
                className="w-full pl-7 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">ใส่ 0 หรือเว้นว่างเพื่อยกเลิกงบของหมวดนี้</p>
          </div>
          <div>
            <label className="text-xs text-gray-500 block mb-1">เงินใช้จ่ายต่อวันของหมวดนี้ (฿)</label>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm text-gray-400">฿</span>
              <input
                type="number"
                value={dailyInput}
                onChange={(e) => setDailyInput(e.target.value)}
                placeholder="0 = ไม่กำหนด"
                className="w-full pl-7 pr-4 py-2.5 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none"
              />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">แสดงยอดเหลือรายวันของหมวดนี้บนหน้าหลัก</p>
          </div>
          <div className="flex gap-3">
            <Button variant="secondary" onClick={() => setBudgetModal(null)}>ยกเลิก</Button>
            <Button fullWidth onClick={saveBudget}>บันทึก</Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
