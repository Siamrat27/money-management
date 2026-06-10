import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushScheduledPayment, deleteCloudScheduledPayment } from '../services/sync'
import { notifyScheduledPaymentExecuted } from '../lib/discord'
import { addTransaction } from './useTransactions'
import type { ScheduledPayment } from '../types'

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

export function useUpcomingPayments() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(
    () => db.scheduledPayments.where('userId').equals(userId).filter((p) => p.isActive).sortBy('dueDate'),
    [userId]
  ) ?? []
}

export function usePaymentLog() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(
    () => db.scheduledPayments
      .where('userId').equals(userId)
      .filter((p) => !p.isActive)
      .sortBy('dueDate')
      .then((arr) => [...arr].reverse()),
    [userId]
  ) ?? []
}

export async function addScheduledPayment(data: Omit<ScheduledPayment, 'id' | 'userId'>): Promise<string> {
  const record: ScheduledPayment = { ...data, id: crypto.randomUUID(), userId: currentUserId() }
  await db.scheduledPayments.add(record)
  pushScheduledPayment(record).catch(console.error)
  return record.id
}

export async function updateScheduledPayment(id: string, data: Partial<ScheduledPayment>) {
  await db.scheduledPayments.update(id, data)
  const updated = await db.scheduledPayments.get(id)
  if (updated) pushScheduledPayment(updated).catch(console.error)
}

// txnDate: when auto-processed late, pass payment.dueDate so the transaction
// lands on its scheduled date instead of "whenever the app was next opened".
export async function executeScheduledPayment(payment: ScheduledPayment, txnDate?: Date) {
  const now = new Date()
  const txnId = await addTransaction({
    type: payment.type,
    amount: payment.amount,
    accountId: payment.accountId,
    tagId: payment.tagId,
    note: payment.note,
    date: txnDate ?? now,
    isRecurring: false,
  })
  const updated: ScheduledPayment = { ...payment, isActive: false, executedAt: now, transactionId: txnId }
  await db.scheduledPayments.put(updated)
  pushScheduledPayment(updated).catch(console.error)
  notifyScheduledPaymentExecuted(updated).catch(console.error)
}

export async function cancelScheduledPayment(payment: ScheduledPayment) {
  const updated: ScheduledPayment = { ...payment, isActive: false }
  await db.scheduledPayments.put(updated)
  pushScheduledPayment(updated).catch(console.error)
}

export async function reactivateScheduledPayment(payment: ScheduledPayment, newDueDate: Date) {
  const reactivated: ScheduledPayment = {
    id: payment.id,
    userId: payment.userId,
    type: payment.type,
    amount: payment.amount,
    accountId: payment.accountId,
    tagId: payment.tagId,
    note: payment.note,
    dueDate: newDueDate,
    isActive: true,
  }
  await db.scheduledPayments.put(reactivated)
  pushScheduledPayment(reactivated).catch(console.error)
}

export async function deleteScheduledPayment(id: string) {
  await db.scheduledPayments.delete(id)
  deleteCloudScheduledPayment(id).catch(console.error)
}
