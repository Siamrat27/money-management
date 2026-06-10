import { format, subDays, startOfWeek } from 'date-fns'
import { db } from '../db/db'
import { addTransaction } from '../hooks/useTransactions'
import { executeScheduledPayment } from '../hooks/useScheduledPayments'
import { updateRecurring } from '../hooks/useRecurring'
import { saveUserSettings } from '../hooks/useSettings'
import { pushScheduledPayment } from './sync'
import { notifyScheduledPaymentUpcoming, sendDailySummary, sendWeeklySummary } from '../lib/discord'
import { nextDueDate, startOfDay } from '../utils/dateHelpers'

export interface AutoProcessResult {
  scheduledCount: number
  recurringCount: number
}

const REMINDER_WINDOW_MS = 24 * 60 * 60 * 1000 // remind within 24h of due

// Send a one-time Discord reminder for payments due within the next 24h
async function remindUpcoming(userId: string): Promise<void> {
  const now = new Date()
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS)
  const upcoming = await db.scheduledPayments
    .where('userId').equals(userId)
    .filter((p) => p.isActive && !p.remindedAt && p.dueDate > now && p.dueDate <= windowEnd)
    .toArray()
  for (const payment of upcoming) {
    try {
      await notifyScheduledPaymentUpcoming(payment)
      const updated = { ...payment, remindedAt: new Date() }
      await db.scheduledPayments.put(updated)
      pushScheduledPayment(updated).catch(console.error)
    } catch (e) {
      console.error('autoProcess: reminder failed', payment.id, e)
    }
  }
}

// Daily/weekly Discord summaries — sent on first open of a new day/week
async function sendSummaries(userId: string): Promise<void> {
  const settings = await db.userSettings.get(userId)
  if (!settings?.discordWebhook) return
  const now = new Date()

  if (settings.dailySummary) {
    const todayKey = format(now, 'yyyy-MM-dd')
    if (settings.lastDailySummary !== todayKey) {
      try {
        const ok = await sendDailySummary(userId, subDays(now, 1))
        if (ok) await saveUserSettings({ lastDailySummary: todayKey })
      } catch (e) {
        console.error('autoProcess: daily summary failed', e)
      }
    }
  }

  if (settings.weeklySummary) {
    const weekStart = startOfWeek(now, { weekStartsOn: 1 })
    const weekKey = format(weekStart, 'yyyy-MM-dd')
    if (settings.lastWeeklySummary !== weekKey) {
      try {
        const lastWeekStart = subDays(weekStart, 7)
        const lastWeekEnd = new Date(weekStart.getTime() - 1)
        const ok = await sendWeeklySummary(userId, lastWeekStart, lastWeekEnd)
        if (ok) await saveUserSettings({ lastWeeklySummary: weekKey })
      } catch (e) {
        console.error('autoProcess: weekly summary failed', e)
      }
    }
  }
}

// Execute all scheduled payments whose dueDate has passed (exact datetime comparison)
async function processScheduled(userId: string): Promise<number> {
  const now = new Date()
  const due = await db.scheduledPayments
    .where('userId').equals(userId)
    .filter((p) => p.isActive && p.dueDate <= now)
    .toArray()
  let count = 0
  for (const payment of due) {
    try {
      // Record the transaction on its scheduled date, not the catch-up time
      await executeScheduledPayment(payment, payment.dueDate)
      count++
    } catch (e) {
      console.error('autoProcess: scheduled payment failed', payment.id, e)
    }
  }
  return count
}

// Process all due recurring transactions, catching up on missed periods.
// Uses day-level comparison and caps at 60 iterations per recurring to prevent runaway.
async function processRecurring(userId: string): Promise<number> {
  const today = startOfDay(new Date())
  const due = await db.recurring
    .where('userId').equals(userId)
    .filter((r) => r.isActive && startOfDay(r.nextDueDate) <= today)
    .toArray()

  let count = 0
  for (const rec of due) {
    let dueAt = rec.nextDueDate
    let iterations = 0
    try {
      // Catch up on all missed periods up to today — but never past endDate
      while (
        startOfDay(dueAt) <= today &&
        (!rec.endDate || dueAt <= rec.endDate) &&
        iterations < 60
      ) {
        await addTransaction({
          type: rec.type,
          amount: rec.amount,
          accountId: rec.accountId,
          tagId: rec.tagId,
          note: rec.name,
          date: dueAt,
          isRecurring: true,
          recurringId: rec.id,
        })
        count++
        iterations++
        dueAt = nextDueDate(dueAt, rec.frequency)
      }
      // Advance nextDueDate; deactivate once the schedule passes endDate
      const isStillActive = !rec.endDate || dueAt <= rec.endDate
      await updateRecurring(rec.id, { nextDueDate: dueAt, isActive: isStillActive })
    } catch (e) {
      console.error('autoProcess: recurring failed', rec.id, e)
    }
  }
  return count
}

export async function runAutoProcess(userId: string): Promise<AutoProcessResult> {
  const scheduledCount = await processScheduled(userId)
  const recurringCount = await processRecurring(userId)
  // Discord side-effects are best-effort — never block or fail processing
  remindUpcoming(userId).catch(console.error)
  sendSummaries(userId).catch(console.error)
  return { scheduledCount, recurringCount }
}
