import { useState, useEffect } from 'react'
import { ArrowUpCircle, ArrowDownCircle, Wallet, ChevronRight, Bell } from 'lucide-react'
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAppStore } from '../stores/useAppStore'
import { useAccounts } from '../hooks/useAccounts'
import { useTransactions } from '../hooks/useTransactions'
import { useTags } from '../hooks/useTags'
import { useRecurring, checkAndProcessRecurring, confirmRecurring, skipRecurring } from '../hooks/useRecurring'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import Modal from '../components/ui/Modal'
import Button from '../components/ui/Button'
import IconDisplay from '../components/ui/IconDisplay'
import Header from '../components/layout/Header'
import { formatCurrency, formatAmount } from '../utils/formatters'
import { formatDate, formatDateShort, getMonthRange, getYearRange, getDayRange, today } from '../utils/dateHelpers'
import { format, eachDayOfInterval, subMonths, getMonth } from 'date-fns'
import { th } from 'date-fns/locale'
import type { Transaction, Recurring } from '../types'

type Period = 'day' | 'month' | 'year'

function useRangeSummary(period: Period) {
  const now = new Date()
  const [from, to] = period === 'day' ? getDayRange(now) : period === 'month' ? getMonthRange(now) : getYearRange(now)
  return useLiveQuery(async () => {
    const txns = await db.transactions.where('date').between(from, to, true, true).toArray()
    let income = 0, expense = 0
    for (const t of txns) {
      if (t.type === 'income') income += t.amount
      if (t.type === 'expense') expense += t.amount
    }
    return { income, expense, net: income - expense }
  }, [period]) ?? { income: 0, expense: 0, net: 0 }
}

function useMonthlyChart() {
  return useLiveQuery(async () => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i))
    const data = await Promise.all(
      months.map(async (m) => {
        const [from, to] = getMonthRange(m)
        const txns = await db.transactions.where('date').between(from, to, true, true).toArray()
        let income = 0, expense = 0
        for (const t of txns) {
          if (t.type === 'income') income += t.amount
          if (t.type === 'expense') expense += t.amount
        }
        return { name: format(m, 'MMM', { locale: th }), income, expense }
      })
    )
    return data
  }, []) ?? []
}

function useSavingsSummary() {
  return useLiveQuery(async () => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i))
    const trend = await Promise.all(
      months.map(async (m) => {
        const [from, to] = getMonthRange(m)
        const txns = await db.transactions.where('date').between(from, to, true, true).toArray()
        let inc = 0, exp = 0
        for (const t of txns) {
          if (t.type === 'income') inc += t.amount
          if (t.type === 'expense') exp += t.amount
        }
        return { name: format(m, 'MMM', { locale: th }), net: inc - exp }
      })
    )
    const thisMonth = trend[5].net
    const lastMonth = trend[4].net
    const changePercent = lastMonth !== 0 ? ((thisMonth - lastMonth) / Math.abs(lastMonth)) * 100 : 0
    return { trend, thisMonth, lastMonth, changePercent }
  }, []) ?? { trend: [], thisMonth: 0, lastMonth: 0, changePercent: 0 }
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('month')
  const { setPage, setSubPage } = useAppStore()
  const summary = useRangeSummary(period)
  const chartData = useMonthlyChart()
  const accounts = useAccounts()
  const allTxns = useTransactions()
  const tags = useTags()
  const recurring = useRecurring()
  const [dueItems, setDueItems] = useState<Recurring[]>([])
  const [dueModal, setDueModal] = useState(false)
  const recent = allTxns.slice(0, 5)

  useEffect(() => {
    checkAndProcessRecurring().then((items) => {
      if (items.length > 0) { setDueItems(items); setDueModal(true) }
    })
  }, [recurring.length])

  const savings = useSavingsSummary()
  const totalBalance = accounts.reduce((sum, acc) => sum + useAccountBalanceStatic(acc.id, allTxns), 0)

  function getTag(id?: string) { return tags.find((t) => t.id === id) }
  function getAccount(id?: string) { return accounts.find((a) => a.id === id) }

  return (
    <div className="min-h-screen pb-nav">
      <Header
        title="PocketFlow 💰"
        right={
          dueItems.length > 0 ? (
            <button onClick={() => setDueModal(true)} className="relative p-2">
              <Bell size={20} className="text-orange-500" />
              <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
            </button>
          ) : undefined
        }
      />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Total Balance */}
        <Card className="p-5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
          <p className="text-indigo-200 text-sm font-medium">ยอดรวมทั้งหมด</p>
          <p className="text-4xl font-bold mt-1">฿{formatAmount(totalBalance)}</p>
          <div className="mt-3 flex gap-3 flex-wrap">
            {accounts.map((acc) => (
              <div key={acc.id} className="flex items-center gap-1.5">
                <span>{acc.icon}</span>
                <div>
                  <p className="text-xs text-indigo-200">{acc.name}</p>
                  <p className="text-sm font-semibold">฿{formatAmount(useAccountBalanceStatic(acc.id, allTxns))}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Period Selector */}
        <div className="flex bg-gray-100 dark:bg-gray-800 rounded-2xl p-1">
          {(['day', 'month', 'year'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                period === p ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500'
              }`}
            >
              {p === 'day' ? 'วันนี้' : p === 'month' ? 'เดือนนี้' : 'ปีนี้'}
            </button>
          ))}
        </div>

        {/* Income / Expense Summary */}
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <div className="flex items-center gap-2 text-green-500 mb-1">
              <ArrowUpCircle size={18} />
              <span className="text-sm font-medium">รายรับ</span>
            </div>
            <p className="text-xl font-bold text-green-500">฿{formatAmount(summary.income)}</p>
          </Card>
          <Card className="p-4">
            <div className="flex items-center gap-2 text-red-500 mb-1">
              <ArrowDownCircle size={18} />
              <span className="text-sm font-medium">รายจ่าย</span>
            </div>
            <p className="text-xl font-bold text-red-500">฿{formatAmount(summary.expense)}</p>
          </Card>
        </div>

        {/* Savings Card */}
        <Card className="p-4">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">ออมได้เดือนนี้</p>
            {savings.lastMonth !== 0 && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${savings.changePercent >= 0 ? 'bg-green-100 dark:bg-green-950 text-green-600' : 'bg-red-100 dark:bg-red-950 text-red-500'}`}>
                {savings.changePercent >= 0 ? '+' : ''}{savings.changePercent.toFixed(1)}%
              </span>
            )}
          </div>
          <p className={`text-2xl font-bold mb-2 ${savings.thisMonth >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {savings.thisMonth >= 0 ? '+' : ''}฿{formatAmount(Math.abs(savings.thisMonth))}
          </p>
          {savings.trend.length > 0 && (
            <ResponsiveContainer width="100%" height={64}>
              <AreaChart data={savings.trend} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="savingsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="net" stroke="#6366f1" strokeWidth={2} fill="url(#savingsGrad)" dot={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 11, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
          <p className="text-xs text-gray-400 mt-1">เดือนก่อน: {savings.lastMonth >= 0 ? '+' : ''}฿{formatAmount(Math.abs(savings.lastMonth))}</p>
        </Card>

        {/* Bar Chart */}
        {chartData.length > 0 && (
          <Card className="p-4">
            <p className="text-sm font-semibold text-gray-500 dark:text-gray-400 mb-3">รายรับ/รายจ่าย 6 เดือน</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} barSize={10} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="income" name="รายรับ" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="expense" name="รายจ่าย" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Recent Transactions */}
        <Card>
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <p className="font-semibold">รายการล่าสุด</p>
            <button
              onClick={() => { setPage('settings'); setSubPage('transactions') }}
              className="text-sm text-indigo-500 flex items-center gap-0.5"
            >
              ดูทั้งหมด <ChevronRight size={16} />
            </button>
          </div>
          {recent.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">ยังไม่มีรายการ</p>
          ) : (
            <div>
              {recent.map((t) => (
                <TransactionRow key={t.id} t={t} tag={getTag(t.tagId)} account={getAccount(t.accountId)} toAccount={getAccount(t.toAccountId)} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Due Recurring Modal */}
      <Modal open={dueModal} onClose={() => setDueModal(false)} title={`รายการครบกำหนด (${dueItems.length})`}>
        <div className="space-y-3">
          {dueItems.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-2xl">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className={`text-sm font-semibold ${r.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                  {r.type === 'income' ? '+' : '-'}฿{formatAmount(r.amount)}
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => skipRecurring(r).then(() => setDueItems((d) => d.filter((x) => x.id !== r.id)))}>ข้าม</Button>
                <Button size="sm" onClick={() => confirmRecurring(r).then(() => setDueItems((d) => d.filter((x) => x.id !== r.id)))}>บันทึก</Button>
              </div>
            </div>
          ))}
          {dueItems.length === 0 && <p className="text-center text-gray-400 py-4">เสร็จสิ้น ✓</p>}
        </div>
      </Modal>
    </div>
  )
}

function useAccountBalanceStatic(accountId: string, transactions: Transaction[]): number {
  let balance = 0
  for (const t of transactions) {
    if (t.type === 'income' && t.accountId === accountId) balance += t.amount
    if (t.type === 'expense' && t.accountId === accountId) balance -= t.amount
    if (t.type === 'transfer') {
      if (t.accountId === accountId) balance -= t.amount
      if (t.toAccountId === accountId) balance += t.amount
    }
  }
  return balance
}

function TransactionRow({ t, tag, account, toAccount }: { t: Transaction; tag?: { icon: string; name: string; color: string }; account?: { icon: string; name: string }; toAccount?: { icon: string; name: string } }) {
  const isIncome = t.type === 'income'
  const isTransfer = t.type === 'transfer'
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-50 dark:border-gray-800">
      <div className="w-10 h-10 rounded-2xl flex items-center justify-center text-xl flex-shrink-0 overflow-hidden"
        style={{ backgroundColor: (tag?.color ?? '#6366f1') + '22' }}>
        <IconDisplay icon={isTransfer ? '↔️' : tag?.icon ?? '💸'} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{t.note || tag?.name || (isTransfer ? 'โอนเงิน' : '-')}</p>
        <p className="text-xs text-gray-400">
          {isTransfer ? `${account?.name} → ${toAccount?.name}` : account?.name} · {formatDate(t.date, 'd MMM HH:mm')}
        </p>
      </div>
      <p className={`font-semibold text-sm ${isIncome ? 'text-green-500' : isTransfer ? 'text-blue-500' : 'text-red-500'}`}>
        {isIncome ? '+' : isTransfer ? '' : '-'}฿{formatAmount(t.amount)}
      </p>
    </div>
  )
}
