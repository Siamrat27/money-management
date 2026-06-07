import {
  format,
  startOfDay,
  endOfDay,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  addDays,
  addWeeks,
  addMonths,
  addYears,
  isSameDay,
  parseISO,
} from 'date-fns'
import { th } from 'date-fns/locale'
import type { Frequency } from '../types'

export { isSameDay, parseISO, startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear }

export function formatDate(date: Date | string, fmt = 'd MMM yyyy'): string {
  const d = typeof date === 'string' ? parseISO(date) : date
  return format(d, fmt, { locale: th })
}

export function formatDateShort(date: Date): string {
  return format(date, 'd MMM', { locale: th })
}

export function formatMonthYear(date: Date): string {
  return format(date, 'MMMM yyyy', { locale: th })
}

export function getDayRange(date: Date): [Date, Date] {
  return [startOfDay(date), endOfDay(date)]
}

export function getMonthRange(date: Date): [Date, Date] {
  return [startOfMonth(date), endOfMonth(date)]
}

export function getYearRange(date: Date): [Date, Date] {
  return [startOfYear(date), endOfYear(date)]
}

export function nextDueDate(current: Date, frequency: Frequency): Date {
  switch (frequency) {
    case 'daily': return addDays(current, 1)
    case 'weekly': return addWeeks(current, 1)
    case 'monthly': return addMonths(current, 1)
    case 'yearly': return addYears(current, 1)
  }
}

export function frequencyLabel(f: Frequency): string {
  const map: Record<Frequency, string> = {
    daily: 'รายวัน',
    weekly: 'รายสัปดาห์',
    monthly: 'รายเดือน',
    yearly: 'รายปี',
  }
  return map[f]
}

export function today(): Date {
  return startOfDay(new Date())
}
