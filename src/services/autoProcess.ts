import { db } from '../db/db'
import { addTransaction } from '../hooks/useTransactions'
import { executeScheduledPayment } from '../hooks/useScheduledPayments'
import { updateRecurring } from '../hooks/useRecurring'
import { nextDueDate, startOfDay } from '../utils/dateHelpers'

export interface AutoProcessResult {
  scheduledCount: number
  recurringCount: number
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
  return { scheduledCount, recurringCount }
}
