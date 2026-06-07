import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAccounts } from '../hooks/useAccounts'
import { useTags } from '../hooks/useTags'
import Card from '../components/ui/Card'
import Header from '../components/layout/Header'
import { formatAmount, formatCurrency } from '../utils/formatters'
import { getDayRange, getMonthRange, getYearRange, formatDate } from '../utils/dateHelpers'
import { PieChart, Pie, Cell, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid, ResponsiveContainer } from 'recharts'
import { format, eachDayOfInterval, eachMonthOfInterval } from 'date-fns'
import { th } from 'date-fns/locale'

type Period = 'day' | 'month' | 'year'

export default function Reports() {
  const [period, setPeriod] = useState<Period>('month')
  const [accountFilter, setAccountFilter] = useState<string | null>(null)

  const now = new Date()
  const [from, to] = period === 'day' ? getDayRange(now) : period === 'month' ? getMonthRange(now) : getYearRange(now)

  const accounts = useAccounts()
  const tags = useTags()

  const txns = useLiveQuery(
    () => db.transactions
      .where('date').between(from, to, true, true)
      .filter((t) => accountFilter === null || t.accountId === accountFilter || t.toAccountId === accountFilter)
      .toArray(),
    [from.getTime(), to.getTime(), accountFilter]
  ) ?? []

  // When filtering by a specific account, transfers to/from that account count as income/expense.
  // When showing all accounts, transfers cancel out (net zero) so exclude them.
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

  // Pie data by tag
  const tagExpense = tags
    .map((tag) => ({
      name: `${tag.icon} ${tag.name}`,
      value: txns.filter((t) => t.type === 'expense' && t.tagId === tag.id).reduce((s, t) => s + t.amount, 0),
      color: tag.color,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  const tagIncome = tags
    .map((tag) => ({
      name: `${tag.icon} ${tag.name}`,
      value: txns.filter((t) => t.type === 'income' && t.tagId === tag.id).reduce((s, t) => s + t.amount, 0),
      color: tag.color,
    }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)

  // Bar trend data
  const trendData = useLiveQuery(async () => {
    if (period === 'year') {
      const months = eachMonthOfInterval({ start: from, end: to })
      return Promise.all(months.map(async (m) => {
        const [mFrom, mTo] = getMonthRange(m)
        const mt = await db.transactions.where('date').between(mFrom, mTo, true, true).toArray()
        return {
          name: format(m, 'MMM', { locale: th }),
          income: mt.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
          expense: mt.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
        }
      }))
    } else if (period === 'month') {
      const days = eachDayOfInterval({ start: from, end: to })
      return Promise.all(days.map(async (d) => {
        const [dFrom, dTo] = getDayRange(d)
        const dt = await db.transactions.where('date').between(dFrom, dTo, true, true).toArray()
        return {
          name: format(d, 'd'),
          income: dt.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0),
          expense: dt.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0),
        }
      }))
    }
    return []
  }, [period]) ?? []

  return (
    <div className="min-h-screen pb-nav">
      <Header title="รายงาน" />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Period */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
          {(['day', 'month', 'year'] as Period[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${period === p ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}>
              {p === 'day' ? 'วันนี้' : p === 'month' ? 'เดือนนี้' : 'ปีนี้'}
            </button>
          ))}
        </div>

        {/* Account Filter */}
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setAccountFilter(null)}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 ${accountFilter === null ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
            ทุกบัญชี
          </button>
          {accounts.map((a) => (
            <button key={a.id} onClick={() => setAccountFilter(a.id)}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium border-2 ${accountFilter === a.id ? 'border-indigo-500 text-indigo-600 bg-indigo-50 dark:bg-indigo-950' : 'border-gray-200 dark:border-gray-700'}`}>
              {a.icon} {a.name}
            </button>
          ))}
        </div>

        {/* Summary Cards */}
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

        {/* Trend Bar Chart */}
        {trendData.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">แนวโน้ม</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={trendData} barSize={period === 'month' ? 6 : 14} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
                <Bar dataKey="income" name="รายรับ" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="รายจ่าย" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Expense Pie */}
        {tagExpense.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">รายจ่ายแยกหมวด</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={tagExpense} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {tagExpense.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none' }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Income Pie */}
        {tagIncome.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">รายรับแยกหมวด</p>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={tagIncome} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {tagIncome.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                </Pie>
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none' }} />
                <Legend iconType="circle" iconSize={8} formatter={(v) => <span className="text-xs">{v}</span>} />
              </PieChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Tag Summary Table */}
        {(tagExpense.length > 0 || tagIncome.length > 0) && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 mb-3">สรุปแยกหมวดหมู่</p>
            <div className="space-y-2">
              {[...tagExpense.map((d) => ({ ...d, type: 'expense' })), ...tagIncome.map((d) => ({ ...d, type: 'income' }))].map((d, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                    <span className="text-sm">{d.name}</span>
                  </div>
                  <span className={`text-sm font-semibold ${d.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                    {d.type === 'income' ? '+' : '-'}฿{formatAmount(d.value)}
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
