import { startOfDay, differenceInDays, subDays } from 'date-fns'
import type { Transaction } from '../types'

// Most recent reset weekday on or before today. weekday: 0=Sun..6=Sat
export function periodStart(resetWeekday: number, today = new Date()): Date {
  const t = startOfDay(today)
  const diff = (t.getDay() - resetWeekday + 7) % 7
  return subDays(t, diff)
}

export interface AllowanceResult {
  remaining: number
  perDay: number
  spentToday: number
  daysElapsed: number
}

// With rollover ON, unused allowance accumulates from periodStart:
//   remaining = perDay × daysElapsed(this period) − spent(this period)
// With rollover OFF, it's just today:
//   remaining = perDay − spentToday
export function computeAllowance(
  perDay: number,
  rollover: boolean,
  resetWeekday: number,
  expenses: Transaction[],
  predicate?: (t: Transaction) => boolean,
): AllowanceResult {
  const today = startOfDay(new Date())
  const start = rollover ? periodStart(resetWeekday, today) : today
  const daysElapsed = rollover ? differenceInDays(today, start) + 1 : 1

  let spentPeriod = 0
  let spentToday = 0
  for (const t of expenses) {
    if (t.type !== 'expense') continue
    if (predicate && !predicate(t)) continue
    const d = startOfDay(t.date)
    if (d >= start && d <= today) spentPeriod += t.amount
    if (d.getTime() === today.getTime()) spentToday += t.amount
  }

  return { remaining: perDay * daysElapsed - spentPeriod, perDay, spentToday, daysElapsed }
}

export const WEEKDAY_LABELS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส']
