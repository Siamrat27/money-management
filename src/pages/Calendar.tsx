import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import { useAccounts } from '../hooks/useAccounts'
import { useTags } from '../hooks/useTags'
import Card from '../components/ui/Card'
import Header from '../components/layout/Header'
import { formatAmount } from '../utils/formatters'
import { formatDate, getMonthRange } from '../utils/dateHelpers'
import { useAuthStore } from '../stores/useAuthStore'
import { LOCAL_USER_ID } from '../db/db'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, isSameMonth, getDay, startOfWeek, endOfWeek, addMonths, subMonths } from 'date-fns'
import { th } from 'date-fns/locale'
import type { Transaction } from '../types'

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

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => setSelected(isSelected ? null : day)}
                  className={`relative flex flex-col items-center py-1.5 rounded-xl transition-colors ${
                    isSelected ? 'bg-indigo-500 text-white' : isToday ? 'bg-indigo-50 dark:bg-indigo-950' : 'active:bg-gray-100 dark:active:bg-gray-800'
                  } ${!isCurrentMonth ? 'opacity-25' : ''}`}
                >
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
            {selectedTxns.length === 0 ? (
              <Card className="p-4 text-center text-gray-400 text-sm">ไม่มีรายการ</Card>
            ) : (
              <Card>
                {selectedTxns.map((t, i) => {
                  const tag = getTag(t.tagId)
                  const account = getAccount(t.accountId)
                  const isIncome = t.type === 'income'
                  return (
                    <div key={t.id} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? 'border-t border-gray-50 dark:border-gray-800' : ''}`}>
                      <div className="w-9 h-9 rounded-xl flex items-center justify-center text-lg flex-shrink-0"
                        style={{ backgroundColor: (tag?.color ?? '#6366f1') + '22' }}>
                        {tag?.icon ?? '💸'}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium">{t.note || tag?.name || '-'}</p>
                        <p className="text-xs text-gray-400">{account?.name}</p>
                      </div>
                      <p className={`text-sm font-bold ${isIncome ? 'text-green-500' : 'text-red-500'}`}>
                        {isIncome ? '+' : '-'}฿{formatAmount(t.amount)}
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
