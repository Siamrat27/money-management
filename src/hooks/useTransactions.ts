import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushTransaction, deleteCloudTransaction } from '../services/sync'
import { notifyNewTransaction } from '../lib/discord'
import type { Transaction } from '../types'

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

export function useTransactions() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(
    () => db.transactions.where('userId').equals(userId).reverse().sortBy('date'),
    [userId]
  ) ?? []
}

export function useTransactionsByRange(from: Date, to: Date) {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(
    () => db.transactions
      .where('userId').equals(userId)
      .filter((t) => t.date >= from && t.date <= to)
      .sortBy('date'),
    [userId, from.getTime(), to.getTime()]
  ) ?? []
}

export async function addTransaction(data: Omit<Transaction, 'id' | 'userId'>) {
  const record: Transaction = { ...data, id: crypto.randomUUID(), userId: currentUserId() }
  await db.transactions.add(record)
  pushTransaction(record).catch(console.error)
  notifyNewTransaction(record).catch(console.error)
  return record.id
}

export async function updateTransaction(id: string, data: Partial<Transaction>) {
  await db.transactions.update(id, data)
  const updated = await db.transactions.get(id)
  if (updated) pushTransaction(updated).catch(console.error)
}

export async function deleteTransaction(id: string) {
  await db.transactions.delete(id)
  deleteCloudTransaction(id).catch(console.error)
}
