import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Recurring } from '../types'
import { nextDueDate } from '../utils/dateHelpers'
import { addTransaction } from './useTransactions'
import { startOfDay } from '../utils/dateHelpers'

export function useRecurring() {
  return useLiveQuery(() => db.recurring.toArray(), []) ?? []
}

export async function addRecurring(data: Omit<Recurring, 'id'>) {
  return db.recurring.add(data)
}

export async function updateRecurring(id: number, data: Partial<Recurring>) {
  return db.recurring.update(id, data)
}

export async function deleteRecurring(id: number) {
  return db.recurring.delete(id)
}

export async function checkAndProcessRecurring(): Promise<Recurring[]> {
  const today = startOfDay(new Date())
  const due = await db.recurring
    .filter((r) => r.isActive && startOfDay(r.nextDueDate) <= today)
    .toArray()
  return due
}

export async function confirmRecurring(r: Recurring) {
  await addTransaction({
    type: r.type,
    amount: r.amount,
    accountId: r.accountId,
    tagId: r.tagId,
    note: r.name,
    date: new Date(),
    isRecurring: true,
    recurringId: r.id,
  })
  await db.recurring.update(r.id!, { nextDueDate: nextDueDate(r.nextDueDate, r.frequency) })
}

export async function skipRecurring(r: Recurring) {
  await db.recurring.update(r.id!, { nextDueDate: nextDueDate(r.nextDueDate, r.frequency) })
}
