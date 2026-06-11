import { useState, useMemo } from 'react'
import { ChevronLeft, ChevronRight, CalendarClock, RefreshCcw } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAccounts } from '../hooks/useAccounts'
import { useTags } from '../hooks/useTags'
import Card from '../components/ui/Card'
import Header from '../components/layout/Header'
import { formatAmount } from '../utils/formatters'
import { formatDate, getMonthRange, nextDueDate, startOfDay } from '../utils/dateHelpers'
import { useAuthStore } from '../stores/useAuthStore'
import { LOCAL_USER_ID } from '../db/db'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, getDay, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import type { Transaction } from '../types'

interface UpcomingEvent {
  date: Date
  name: string
  amount: number
  type: 'income' | 'expense'
  kind: 'scheduled' | 'recurring'
}

const WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']

export default function Calendar() {
  const [current, setCurrent] = useState(new Date())
  const [selected, setSelected] = useState<Date | null>(null)

  const [from, to] = getMonthRange(current)
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)

  const monthTxns = useLiveQuery(
    () => db.transactions.where('date').between(from, to, true, true)
      .filter((t) => t.userId === userId)
      .toArray(),
    [from.getTime(), userId]
  ) ?? []

  const accounts = useAccounts()
  const tags = useTags()

  // Upcoming events (scheduled payments + projected recurring) in this month
  const activeScheduled = useLiveQuery(
    () => db.scheduledPayments.where('userId').equals(userId).filter((p) => p.isActive).toArray(),
    [userId]
  ) ?? []
  const activeRecurring = useLiveQuery(
    () => db.recurring.where('userId').equals(userId).filter((r) => r.isActive).toArray(),
    [userId]
  ) ?? []

  const monthEvents = useMemo<UpcomingEvent[]>(() => {
    const today = startOfDay(new Date())
    const events: UpcomingEvent[] = []
    for (const p of activeScheduled) {
      if (p.dueDate >= from && p.dueDate <= to) {
        events.push({ date: p.dueDate, name: p.note || (p.type === 'income' ? 'รายรับล่วงหน้า' : 'รายจ่ายล่วงหน้า'), amount: p.amount, type: p.type, kind: 'scheduled' })
      }
    }
    for (const r of activeRecurring) {
      let d = r.nextDueDate
      let guard = 0
      while (d <= to && (!r.endDate || d <= r.endDate) && guard < 62) {
        if (d >= from && startOfDay(d) >= today) {
          events.push({ date: d, name: r.name, amount: r.amount, type: r.type, kind: 'recurring' })
        }
        d = nextDueDate(d, r.frequency)
        guard++
      }
    }
    return events.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [activeScheduled, activeRecurring, from.getTime(), to.getTime()])

  function getTag(id?: string) { return tags.find((t) => t.id === id) }
  function getAccount(id?: string) { return accounts.find((a) => a.id === id) }

  function getDayNet(date: Date): number {
    return monthTxns
      .filter((t) => isSameDay(t.date, date))
      .reduce((sum, t) => {
        if (t.type === 'income') return sum + t.amount
        if (t.type === 'expense') return sum - t.amount
        return sum
      }, 0)
  }

  const startDay = startOfMonth(current)
  const endDay = endOfMonth(current)
  const calStart = startOfWeek(startDay, { weekStartsOn: 0 })
  const calEnd = endOfWeek(endDay, { weekStartsOn: 0 })
  const days = eachDayOfInterval({ start: calStart, end: calEnd })

  const selectedTxns = selected
    ? monthTxns.filter((t) => isSameDay(t.date, selected))
    : []
  const selectedEvents = selected
    ? monthEvents.filter((e) => isSameDay(e.date, selected))
    : []

  const monthIncome = monthTxns.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0)
  const monthExpense = monthTxns.filter((t) => t.type === 'expense').reduce((s, t) => s + t.amount, 0)

  return (
    <div className="min-h-screen pb-nav">
      <Header title="ปฏิทิน" />

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
            <p className="text-xs text-green-500 font-medium">รายรับ</p>
            <p className="font-bold text-green-500">฿{formatAmount(monthIncome)}</p>
          </Card>
          <Card className="p-3 text-center">
            <p className="text-xs text-red-500 font-medium">รายจ่าย</p>
            <p className="font-bold text-red-500">฿{formatAmount(monthExpense)}</p>
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
              const net = getDayNet(day)
              const isCurrentMonth = isSameMonth(day, current)
              const isSelected = selected && isSameDay(day, selected)
              const isToday = isSameDay(day, new Date())
              const hasTxn = monthTxns.some((t) => isSameDay(t.date, day))
              const hasEvent = monthEvents.some((e) => isSameDay(e.date, day))

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelected(isSelected ? null : day)}
                  className={`relative flex flex-col items-center py-1.5 rounded-xl transition-colors ${
                    isSelected ? 'bg-indigo-500 text-white' : isToday ? 'bg-indigo-50 dark:bg-indigo-950' : 'active:bg-gray-100 dark:active:bg-gray-800'
                  } ${!isCurrentMonth ? 'opacity-25' : ''}`}
                >
                  {hasEvent && (
                    <span className={`absolute top-1 right-1.5 w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-purple-500'}`} />
                  )}
                  <span className={`text-sm font-medium ${isToday && !isSelected ? 'text-indigo-500' : ''}`}>
                    {format(day, 'd')}
                  </span>
                  {hasTxn && (
                    <span className={`text-[9px] font-bold leading-tight ${
                      isSelected ? 'text-white/90' : net >= 0 ? 'text-green-500' : 'text-red-500'
                    }`}>
                      {net >= 0 ? '+' : ''}{net === 0 ? '·' : formatAmount(Math.abs(net)).split('.')[0]}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        </Card>

        {/* Selected Day Transactions */}
        {selected && (
          <div>
            <p className="font-semibold text-sm text-gray-500 mb-2">{formatDate(selected, 'd MMMM yyyy')}</p>
            {selectedEvents.length > 0 && (
              <Card className="mb-3">
                <p className="text-xs font-semibold text-purple-500 px-4 pt-3 pb-1">📌 กำหนดการ</p>
                {selectedEvents.map((e, i) => (
                  <div key={i} className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-800' : ''} ${i === selectedEvents.length - 1 ? 'pb-3' : ''}`}>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-purple-50 dark:bg-purple-950 text-purple-500">
                      {e.kind === 'scheduled' ? <CalendarClock size={16} /> : <RefreshCcw size={16} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{e.name}</p>
                      <p className="text-xs text-gray-400">
                        {e.kind === 'scheduled' ? `ล่วงหน้า · ${format(e.date, 'HH:mm')}` : 'รายการต่อเนื่อง'}
                      </p>
                    </div>
                    <p className={`text-sm font-bold ${e.type === 'income' ? 'text-green-500' : 'text-red-500'}`}>
                      {e.type === 'income' ? '+' : '-'}฿{formatAmount(e.amount)}
                    </p>
                  </div>
                ))}
              </Card>
            )}
            {selectedTxns.length === 0 ? (
              <Card className="p-4 text-center text-gray-400 text-sm">ไม่มีรายการ</Card>
            ) : (
              <Card>
                {selectedTxns.map((t, i) => {
                  const tag = getTag(t.tagId)
                  const account = getAccount(t.accountId)
                  const toAccount = getAccount(t.toAccountId)
                  const isIncome = t.type === 'income'
                  const isTransfer = t.type === 'transfer'
                  return (
                    <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-800' : ''}`}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                        style={{ backgroundColor: isTransfer ? '#3b82f622' : (tag?.color ?? '#6366f1') + '22' }}>
                        {isTransfer ? '↔️' : tag?.icon ?? '💸'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <p className="text-sm font-medium truncate">{t.note || tag?.name || (isTransfer ? 'โอนเงิน' : '-')}</p>
                          {isTransfer && <span className="flex-shrink-0 text-[9px] leading-none bg-blue-100 dark:bg-blue-950 text-blue-500 rounded-full px-1.5 py-0.5 font-semibold">โอน</span>}
                          {t.isRecurring && <span className="flex-shrink-0 text-[9px] leading-none bg-indigo-100 dark:bg-indigo-950 text-indigo-500 rounded-full px-1.5 py-0.5">🔄</span>}
                        </div>
                        <p className="text-xs text-gray-400 truncate">
                          {isTransfer ? `${account?.name ?? '?'} → ${toAccount?.name ?? '?'}` : account?.name}
                        </p>
                      </div>
                      <p className={`text-sm font-bold ${isIncome ? 'text-green-500' : isTransfer ? 'text-blue-500' : 'text-red-500'}`}>
                        {isIncome ? '+' : isTransfer ? '' : '-'}฿{formatAmount(t.amount)}
                      </p>
                    </div>
                  )
                })}
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
