import { useState, useEffect } from 'react'
import { ArrowUpCircle, ArrowDownCircle, Wallet, ChevronRight, RefreshCw, X } from 'lucide-react'
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList } from 'recharts'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { useAppStore } from '../stores/useAppStore'
import { useAccounts, calcBalance } from '../hooks/useAccounts'
import { useTransactions } from '../hooks/useTransactions'
import { useTags } from '../hooks/useTags'
import { runAutoProcess } from '../services/autoProcess'
import type { AutoProcessResult } from '../services/autoProcess'
import { pullFromCloud } from '../services/sync'
import { isSupabaseConfigured } from '../lib/supabase'
import Card from '../components/ui/Card'
import Badge from '../components/ui/Badge'
import IconDisplay from '../components/ui/IconDisplay'
import Header from '../components/layout/Header'
import { formatCurrency, formatAmount } from '../utils/formatters'
import { formatDate, formatDateShort, getMonthRange, getYearRange, getDayRange, today, nextDueDate, startOfDay } from '../utils/dateHelpers'
import { format, eachDayOfInterval, subMonths, getMonth, addDays } from 'date-fns'
import { th } from 'date-fns/locale'
import type { Transaction } from '../types'

type Period = 'day' | 'month' | 'year'

function useRangeSummary(period: Period) {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  const now = new Date()
  const [from, to] = period === 'day' ? getDayRange(now) : period === 'month' ? getMonthRange(now) : getYearRange(now)
  return useLiveQuery(async () => {
    const txns = await db.transactions.where('date').between(from, to, true, true)
      .filter((t) => t.userId === userId)
      .toArray()
    let income = 0, expense = 0
    for (const t of txns) {
      if (t.type === 'income') income += t.amount
      if (t.type === 'expense') expense += t.amount
    }
    return { income, expense, net: income - expense }
  }, [period, userId]) ?? { income: 0, expense: 0, net: 0 }
}

function useMonthlyChart() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(async () => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i))
    const data = await Promise.all(
      months.map(async (m) => {
        const [from, to] = getMonthRange(m)
        const txns = await db.transactions.where('date').between(from, to, true, true)
          .filter((t) => t.userId === userId)
          .toArray()
        let income = 0, expense = 0
        for (const t of txns) {
          if (t.type === 'income') income += t.amount
          if (t.type === 'expense') expense += t.amount
        }
        return { name: format(m, 'MMM', { locale: th }), income, expense }
      })
    )
    return data
  }, [userId]) ?? []
}

function useSavingsSummary() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(async () => {
    const now = new Date()
    const months = Array.from({ length: 6 }, (_, i) => subMonths(now, 5 - i))
    const trend = await Promise.all(
      months.map(async (m) => {
        const [from, to] = getMonthRange(m)
        const txns = await db.transactions.where('date').between(from, to, true, true)
          .filter((t) => t.userId === userId)
          .toArray()
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
  }, [userId]) ?? { trend: [], thisMonth: 0, lastMonth: 0, changePercent: 0 }
}

function useNetWorthTrend() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(async () => {
    const now = new Date()
    // All non-transfer transactions (transfers don't change total net worth)
    const allTxns = await db.transactions
      .where('userId').equals(userId)
      .filter((t) => t.type !== 'transfer')
      .toArray()

    return Array.from({ length: 30 }, (_, i) => {
      const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - i), 23, 59, 59, 999)
      const balance = allTxns
        .filter((t) => t.date <= day)
        .reduce((sum, t) => t.type === 'income' ? sum + t.amount : sum - t.amount, 0)
      return {
        name: i % 7 === 0 || i === 29 ? format(day, 'd MMM', { locale: th }) : '',
        balance,
      }
    })
  }, [userId]) ?? []
}

// Project future balance from active recurring + scheduled payments
function useForecastEvents() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  const recurring = useLiveQuery(
    () => db.recurring.where('userId').equals(userId).filter((r) => r.isActive).toArray(),
    [userId]
  ) ?? []
  const scheduled = useLiveQuery(
    () => db.scheduledPayments.where('userId').equals(userId).filter((p) => p.isActive).toArray(),
    [userId]
  ) ?? []
  return { recurring, scheduled }
}

function buildForecast(
  startBalance: number,
  days: number,
  recurring: ReturnType<typeof useForecastEvents>['recurring'],
  scheduled: ReturnType<typeof useForecastEvents>['scheduled'],
) {
  const start = startOfDay(new Date())
  const end = addDays(start, days)
  const deltas = new Map<string, number>()
  const addDelta = (d: Date, amt: number) => {
    // anything overdue lands today
    const day = d < start ? start : startOfDay(d)
    const key = format(day, 'yyyy-MM-dd')
    deltas.set(key, (deltas.get(key) ?? 0) + amt)
  }

  for (const p of scheduled) {
    if (p.dueDate <= end) addDelta(p.dueDate, p.type === 'income' ? p.amount : -p.amount)
  }
  for (const r of recurring) {
    let d = r.nextDueDate
    let guard = 0
    while (d <= end && (!r.endDate || d <= r.endDate) && guard < 200) {
      addDelta(d, r.type === 'income' ? r.amount : -r.amount)
      d = nextDueDate(d, r.frequency)
      guard++
    }
  }

  let balance = startBalance
  const points: { name: string; balance: number }[] = []
  for (let i = 0; i <= days; i++) {
    const day = addDays(start, i)
    balance += deltas.get(format(day, 'yyyy-MM-dd')) ?? 0
    points.push({
      name: i === 0 ? 'วันนี้' : (i % Math.ceil(days / 5) === 0 || i === days) ? format(day, 'd MMM', { locale: th }) : '',
      balance: Math.round(balance),
    })
  }
  const min = points.reduce((m, p) => (p.balance < m.balance ? p : m), points[0])
  const minDay = points.indexOf(min)
  return { points, min, minDate: addDays(start, minDay), endBalance: points[points.length - 1].balance }
}

export default function Dashboard() {
  const [period, setPeriod] = useState<Period>('month')
  const { setPage, setSubPage } = useAppStore()
  const { user } = useAuthStore()
  const userId = user?.id ?? LOCAL_USER_ID
  const summary = useRangeSummary(period)
  const chartData = useMonthlyChart()
  const accounts = useAccounts()
  const allTxns = useTransactions()
  const tags = useTags()
  const recent = allTxns.slice(0, 5)

  const [autoResult, setAutoResult] = useState<AutoProcessResult | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // On login/mount: pull cloud first so Dexie is populated, then auto-process
  useEffect(() => {
    async function init() {
      if (user && isSupabaseConfigured) {
        await pullFromCloud(user.id).catch(console.error)
      }
      const result = await runAutoProcess(userId)
      if (result.scheduledCount + result.recurringCount > 0) setAutoResult(result)
    }
    init()
  }, [userId])

  // Auto-dismiss the result banner after 5s
  useEffect(() => {
    if (!autoResult) return
    const t = setTimeout(() => setAutoResult(null), 5000)
    return () => clearTimeout(t)
  }, [autoResult])

  async function handleRefresh() {
    setRefreshing(true)
    try {
      if (user && isSupabaseConfigured) await pullFromCloud(user.id)
      const result = await runAutoProcess(userId)
      if (result.scheduledCount + result.recurringCount > 0) setAutoResult(result)
    } catch (e) {
      useAuthStore.getState().setSyncError(String(e))
    } finally {
      setRefreshing(false)
    }
  }

  const savings = useSavingsSummary()
  const netWorthData = useNetWorthTrend()
  const totalBalance = accounts.reduce((sum, acc) => sum + calcBalance(acc.id, allTxns), 0)

  // Cash flow forecast
  const [forecastDays, setForecastDays] = useState<30 | 60 | 90>(30)
  const { recurring: fcRecurring, scheduled: fcScheduled } = useForecastEvents()
  const forecast = buildForecast(totalBalance, forecastDays, fcRecurring, fcScheduled)
  const hasForecastEvents = fcRecurring.length > 0 || fcScheduled.length > 0

  function getTag(id?: string) { return tags.find((t) => t.id === id) }
  function getAccount(id?: string) { return accounts.find((a) => a.id === id) }

  return (
    <div className="min-h-screen pb-nav">
      <Header
        title="PocketFlow 💰"
        right={
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="p-2 rounded-full active:bg-gray-100 dark:active:bg-gray-800 disabled:opacity-50"
          >
            <RefreshCw size={20} className={refreshing ? 'animate-spin text-indigo-500' : ''} />
          </button>
        }
      />

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        {/* Auto-process result banner */}
        {autoResult && (autoResult.scheduledCount + autoResult.recurringCount) > 0 && (
          <div className="flex items-center justify-between bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-2xl px-4 py-3">
            <div className="flex items-start gap-2">
              <span className="text-green-500 mt-0.5">✅</span>
              <div>
                <p className="text-sm font-semibold text-green-700 dark:text-green-300">ดำเนินการอัตโนมัติแล้ว</p>
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  {[
                    autoResult.recurringCount > 0 && `รายการต่อเนื่อง ${autoResult.recurringCount} ครั้ง`,
                    autoResult.scheduledCount > 0 && `ล่วงหน้า ${autoResult.scheduledCount} รายการ`,
                  ].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <button onClick={() => setAutoResult(null)} className="p-1 text-green-400">
              <X size={15} />
            </button>
          </div>
        )}
        {/* Total Balance */}
        <Card className="p-5 bg-gradient-to-br from-indigo-500 to-purple-600 text-white">
          <p className="text-indigo-200 text-sm font-medium">ยอดรวมทั้งหมด</p>
          <p className="text-4xl font-bold mt-1">฿{formatAmount(totalBalance)}</p>
          <div className="mt-3 flex gap-3 flex-wrap">
            {accounts.map((acc) => (
              <div key={acc.id} className="flex items-center gap-1.5">
                <span className="w-5 h-5 rounded overflow-hidden inline-flex items-center justify-center flex-shrink-0">
                  <IconDisplay icon={acc.icon} />
                </span>
                <div>
                  <p className="text-xs text-indigo-200">{acc.name}</p>
                  <p className="text-sm font-semibold">฿{formatAmount(calcBalance(acc.id, allTxns))}</p>
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
            <ResponsiveContainer width="100%" height={185}>
              <BarChart data={chartData} barCategoryGap="22%" barGap={4} margin={{ top: 16, right: 4, left: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={{ borderRadius: 12, fontSize: 12, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }}
                />
                <Bar dataKey="income" name="รายรับ" fill="#22c55e" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="income" position="top" style={{ fontSize: 8.5, fill: '#16a34a', fontWeight: 600 }}
                    formatter={(v: number) => v > 0 ? (v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 10_000 ? `${(v/1_000).toFixed(0)}k` : v >= 1_000 ? `${(v/1_000).toFixed(1)}k` : `${Math.round(v)}`) : ''} />
                </Bar>
                <Bar dataKey="expense" name="รายจ่าย" fill="#ef4444" radius={[4, 4, 0, 0]}>
                  <LabelList dataKey="expense" position="top" style={{ fontSize: 8.5, fill: '#dc2626', fontWeight: 600 }}
                    formatter={(v: number) => v > 0 ? (v >= 1_000_000 ? `${(v/1_000_000).toFixed(1)}M` : v >= 10_000 ? `${(v/1_000).toFixed(0)}k` : v >= 1_000 ? `${(v/1_000).toFixed(1)}k` : `${Math.round(v)}`) : ''} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* Net Worth History — 30 days */}
        {netWorthData.length > 0 && netWorthData.some((d) => d.balance !== 0) && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">Net Worth ย้อนหลัง 30 วัน</p>
              <div className="text-right">
                {(() => {
                  const first = netWorthData[0]?.balance ?? 0
                  const last  = netWorthData[netWorthData.length - 1]?.balance ?? 0
                  const diff  = last - first
                  return diff !== 0 ? (
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${diff >= 0 ? 'bg-green-100 dark:bg-green-950 text-green-600' : 'bg-red-100 dark:bg-red-950 text-red-500'}`}>
                      {diff >= 0 ? '+' : ''}฿{formatAmount(Math.abs(diff))}
                    </span>
                  ) : null
                })()}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={100}>
              <AreaChart data={netWorthData} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#14b8a6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="monotone" dataKey="balance" stroke="#14b8a6" strokeWidth={2} fill="url(#netWorthGrad)" dot={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 11, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex justify-between mt-1 text-xs text-gray-400">
              <span>30 วันที่แล้ว: ฿{formatAmount(netWorthData[0]?.balance ?? 0)}</span>
              <span className="text-teal-500 font-medium">วันนี้: ฿{formatAmount(netWorthData[netWorthData.length - 1]?.balance ?? 0)}</span>
            </div>
          </Card>
        )}

        {/* Cash Flow Forecast */}
        {hasForecastEvents && (
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">พยากรณ์เงินคงเหลือ</p>
              <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-0.5 gap-0.5">
                {([30, 60, 90] as const).map((d) => (
                  <button key={d} onClick={() => setForecastDays(d)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold ${forecastDays === d ? 'bg-white dark:bg-gray-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}`}>
                    {d}วัน
                  </button>
                ))}
              </div>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={forecast.points} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area type="stepAfter" dataKey="balance" stroke="#8b5cf6" strokeWidth={2} fill="url(#forecastGrad)" dot={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis hide domain={['auto', 'auto']} />
                <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={{ borderRadius: 12, fontSize: 11, border: 'none', boxShadow: '0 4px 20px rgba(0,0,0,0.1)' }} />
              </AreaChart>
            </ResponsiveContainer>
            <div className="flex justify-between mt-1 text-xs">
              <span className={forecast.min.balance < 0 ? 'text-red-500 font-semibold' : 'text-gray-400'}>
                {forecast.min.balance < 0 ? '⚠️ ' : ''}ต่ำสุด ฿{formatAmount(forecast.min.balance)} ({format(forecast.minDate, 'd MMM', { locale: th })})
              </span>
              <span className={`font-medium ${forecast.endBalance >= totalBalance ? 'text-green-500' : 'text-orange-500'}`}>
                สิ้นช่วง: ฿{formatAmount(forecast.endBalance)}
              </span>
            </div>
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

    </div>
  )
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
        <div className="flex items-center gap-1">
          <p className="font-medium text-sm truncate">{t.note || tag?.name || (isTransfer ? 'โอนเงิน' : '-')}</p>
          {t.isRecurring && <span className="flex-shrink-0 text-[9px] leading-none bg-indigo-100 dark:bg-indigo-950 text-indigo-500 rounded-full px-1.5 py-0.5">🔄</span>}
        </div>
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
