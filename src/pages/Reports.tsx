import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAccounts } from '../hooks/useAccounts'
import { useTags } from '../hooks/useTags'
import Card from '../components/ui/Card'
import Header from '../components/layout/Header'
import IconDisplay from '../components/ui/IconDisplay'
import { formatAmount, formatCurrency } from '../utils/formatters'
import { isUrlIcon } from '../lib/storage'
import { useAuthStore } from '../stores/useAuthStore'
import { LOCAL_USER_ID } from '../db/db'
import { getDayRange, getMonthRange, getYearRange } from '../utils/dateHelpers'
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { format, eachDayOfInterval, eachMonthOfInterval } from 'date-fns'
import { th } from 'date-fns/locale'

type Period = 'day' | 'month' | 'year' | 'custom'

export default function Reports() {
  const now = new Date()
  const [period, setPeriod] = useState<Period>('month')
  const [accountFilter, setAccountFilter] = useState<string | null>(null)
  const [customFrom, setCustomFrom] = useState(format(getMonthRange(now)[0], 'yyyy-MM-dd'))
  const [customTo, setCustomTo] = useState(format(now, 'yyyy-MM-dd'))

  const accounts = useAccounts()
  const tags = useTags()
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)

  const [from, to] =
    period === 'day'    ? getDayRange(now) :
    period === 'month'  ? getMonthRange(now) :
    period === 'year'   ? getYearRange(now) :
    [new Date(customFrom + 'T00:00:00'), new Date(customTo + 'T23:59:59.999')]

  const diffDays = Math.max(0, Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)))

  const txns = useLiveQuery(
    () => db.transactions
      .where('date').between(from, to, true, true)
      .filter((t) => t.userId === userId && (accountFilter === null || t.accountId === accountFilter || t.toAccountId === accountFilter))
      .toArray(),
    [from.getTime(), to.getTime(), accountFilter, userId]
  ) ?? []

  const income = txns.reduce((s, t) => {
    if (t.type === 'income') return s + t.amount
    if (t.type === 'transfer' && accountFilter !== null && t.toAccountId === accountFilter) return s + t.amount
    return s
  }, 0)
  const expense = txns.reduce((s, t) => {
    if (t.type === 'expense') return s + t.amount
    if (t.type === 'transfer' && accountFilter !== null && t.accountId === accountFilter) return s + t.amount
    return s
  }, 0)

  type TagRow = { id: string; icon: string; name: string; label: string; value: number; color: string }

  const tagExpense: TagRow[] = tags
    .map((tag) => ({
      id: tag.id, icon: tag.icon, name: tag.name,
      label: isUrlIcon(tag.icon) ? tag.name : `${tag.icon} ${tag.name}`,
      value: txns.filter((t) => t.type === 'expense' && t.tagId === tag.id).reduce((s, t) => s + t.amount, 0),
      color: tag.color,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  const tagIncome: TagRow[] = tags
    .map((tag) => ({
      id: tag.id, icon: tag.icon, name: tag.name,
      label: isUrlIcon(tag.icon) ? tag.name : `${tag.icon} ${tag.name}`,
      value: txns.filter((t) => t.type === 'income' && t.tagId === tag.id).reduce((s, t) => s + t.amount, 0),
      color: tag.color,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  // Budget overview: all budgeted expense tags, sorted by % used (most urgent first)
  const budgetOverview = period === 'month'
    ? tags
        .filter((t) => (t.monthlyBudget ?? 0) > 0 && t.type !== 'income')
        .map((tag) => {
          const spent = txns.filter((t) => t.type === 'expense' && t.tagId === tag.id).reduce((s, t) => s + t.amount, 0)
          const budget = tag.monthlyBudget!
          return { tag, spent, budget, pct: (spent / budget) * 100 }
        })
        .sort((a, b) => b.pct - a.pct)
    : []

  const trendData = useLiveQuery(async () => {
    if (from > to) return []
    const byDay   = period === 'month' || (period === 'custom' && diffDays <= 62)
    const byMonth = period === 'year'  || (period === 'custom' && diffDays > 62)

    if (byMonth) {
      const months = eachMonthOfInterval({ start: from, end: to })
      return Promise.all(months.map(async (m) => {
        const [mFrom, mTo] = getMonthRange(m)
        const mt = await db.transactions.where('date').between(mFrom, mTo, true, true)
          .filter((t) => t.userId === userId).toArray()
        return {
          name: format(m, 'MMM', { locale: th }),
          income:  mt.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
          expense: mt.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
        }
      }))
    }
    if (byDay) {
      const days = eachDayOfInterval({ start: from, end: to })
      return Promise.all(days.map(async (d) => {
        const [dFrom, dTo] = getDayRange(d)
        const dt = await db.transactions.where('date').between(dFrom, dTo, true, true)
          .filter((t) => t.userId === userId).toArray()
        return {
          name: format(d, 'd'),
          income:  dt.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
          expense: dt.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
        }
      }))
    }
    return []
  }, [period, from.getTime(), to.getTime(), userId]) ?? []

  const barCatGap = period === 'day' ? '30%' : period === 'month' || (period === 'custom' && diffDays <= 62) ? '25%' : '20%'

  return (
    <div className="min-h-screen pb-nav">
      <Header title="รายงาน" />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">

        {/* Period selector */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
          {(['day', 'month', 'year', 'custom'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${period === p ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}>
              {p === 'day' ? 'วันนี้' : p === 'month' ? 'เดือนนี้' : p === 'year' ? 'ปีนี้' : 'กำหนดเอง'}
            </button>
          ))}
        </div>

        {/* Custom date range picker */}
        {period === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customFrom} max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-indigo-400" />
            <span className="text-gray-400 text-sm flex-shrink-0">–</span>
            <input type="date" value={customTo} min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="flex-1 px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-sm outline-none focus:border-indigo-400" />
          </div>
        )}

        {/* Account filter */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setAccountFilter(null)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 ${accountFilter === null ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
            ทุกบัญชี
          </button>
          {accounts.map((a) => (
            <button key={a.id} onClick={() => setAccountFilter(a.id)}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-sm font-medium border-2 ${accountFilter === a.id ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
              {isUrlIcon(a.icon)
                ? <img src={a.icon} className="w-4 h-4 rounded object-cover" alt="" />
                : a.icon} {a.name}
            </button>
          ))}
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3 text-center">
            <p className="text-xs text-green-500 font-medium">รายรับ</p>
            <p className="font-bold text-green-500 text-sm">฿{formatAmount(income)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-red-500 font-medium">รายจ่าย</p>
            <p className="font-bold text-red-500 text-sm">฿{formatAmount(expense)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-gray-500 font-medium">คงเหลือ</p>
            <p className={`font-bold text-sm ${income - expense >= 0 ? 'text-indigo-500' : 'text-red-500'}`}>
              ฿{formatAmount(income - expense)}
            </p>
          </Card>
        </div>

        {/* Budget Overview — only shown for current month */}
        {budgetOverview.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-4">งบประมาณเดือนนี้</p>
            <div className="space-y-4">
              {budgetOverview.map(({ tag, spent, budget, pct }) => {
                const isOver = spent > budget
                const isNear = !isOver && pct >= 80
                const barColor = isOver ? '#ef4444' : isNear ? '#f59e0b' : '#22c55e'
                return (
                  <div key={tag.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center overflow-hidden text-base flex-shrink-0"
                          style={{ backgroundColor: tag.color + '22' }}>
                          <IconDisplay icon={tag.icon} />
                        </div>
                        <span className="text-sm font-medium">{tag.name}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-bold" style={{ color: barColor }}>฿{formatAmount(spent)}</span>
                        <span className="text-xs text-gray-400"> / ฿{formatAmount(budget)}</span>
                      </div>
                    </div>
                    <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, pct)}%`, backgroundColor: barColor }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <p className="text-xs font-medium" style={{ color: barColor }}>
                        {isOver ? `⚠️ เกินงบ ฿${formatAmount(spent - budget)}`
                          : isNear ? `⚡ ใกล้ถึงงบ ${pct.toFixed(0)}%`
                          : `✓ ใช้ไป ${pct.toFixed(0)}%`}
                      </p>
                      {!isOver && <p className="text-xs text-gray-400">เหลือ ฿{formatAmount(budget - spent)}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* Trend bar chart */}
        {trendData.length > 1 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">แนวโน้ม</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={trendData} barCategoryGap={barCatGap} barGap={2} maxBarSize={18} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={(v: number) => v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 10_000 ? `${(v/1_000).toFixed(0)}k` : v >= 1_000 ? `${(v/1_000).toFixed(1)}k` : `${v}`}
                  tick={{ fontSize: 9 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="income"  name="รายรับ"  fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="รายจ่าย" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Expense pie */}
        {tagExpense.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">รายจ่ายแยกหมวด</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={tagExpense.map((d) => ({ ...d, name: d.label }))}
                  cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {tagExpense.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none' }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Income pie */}
        {tagIncome.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">รายรับแยกหมวด</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={tagIncome.map((d) => ({ ...d, name: d.label }))}
                  cx="50%" cy="50%" outerRadius={80} dataKey="value"
                  label={({ percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {tagIncome.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none' }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Tag summary list */}
        {(tagExpense.length > 0 || tagIncome.length > 0) && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">สรุปแยกหมวดหมู่</p>
            <div className="space-y-2">
              {[
                ...tagExpense.map((d) => ({ ...d, txnType: 'expense' as const })),
                ...tagIncome.map((d)  => ({ ...d, txnType: 'income'  as const })),
              ].map((d, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                  <div className="w-5 h-5 flex items-center justify-center overflow-hidden flex-shrink-0 text-sm">
                    <IconDisplay icon={d.icon} />
                  </div>
                  <span className="text-sm flex-1 truncate">{d.name}</span>
                  <span className={`text-sm font-semibold ${d.txnType === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                    {d.txnType === 'income' ? '+' : '-'}฿{formatAmount(d.value)}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}

        {txns.length === 0 && (
          <div className="text-center py-16">
            <p className="text-4xl mb-2">📊</p>
            <p className="text-gray-400">ยังไม่มีข้อมูล</p>
          </div>
        )}
      </div>
    </div>
  )
}
