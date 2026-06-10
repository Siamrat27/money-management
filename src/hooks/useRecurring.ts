import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushRecurring, deleteCloudRecurring } from '../services/sync'
import { nextDueDate } from '../utils/dateHelpers'
import { addTransaction } from './useTransactions'
import type { Recurring } from '../types'

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

export function useRecurring() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(() => db.recurring.where('userId').equals(userId).toArray(), [userId]) ?? []
}

export async function addRecurring(data: Omit<Recurring, 'id' | 'userId'>) {
  const record: Recurring = { ...data, id: crypto.randomUUID(), userId: currentUserId() }
  await db.recurring.add(record)
  pushRecurring(record).catch(console.error)
  return record.id
}

export async function updateRecurring(id: string, data: Partial<Recurring>) {
  await db.recurring.update(id, data)
  const updated = await db.recurring.get(id)
  if (updated) pushRecurring(updated).catch(console.error)
}

export async function deleteRecurring(id: string) {
  await db.recurring.delete(id)
  deleteCloudRecurring(id).catch(console.error)
}

export async function confirmRecurring(r: Recurring) {
  await addTransaction({
    type: r.type, amount: r.amount, accountId: r.accountId,
    tagId: r.tagId, note: r.name, date: new Date(),
    isRecurring: true, recurringId: r.id,
  })
  await updateRecurring(r.id, { nextDueDate: nextDueDate(r.nextDueDate, r.frequency) })
}

export async function skipRecurring(r: Recurring) {
  await updateRecurring(r.id, { nextDueDate: nextDueDate(r.nextDueDate, r.frequency) })
}
