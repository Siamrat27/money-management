import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Transaction } from '../types'

export function useTransactions() {
  return useLiveQuery(() => db.transactions.orderBy('date').reverse().toArray(), []) ?? []
}

export function useTransactionsByRange(from: Date, to: Date) {
  return useLiveQuery(
    () => db.transactions.where('date').between(from, to, true, true).sortBy('date'),
    [from.getTime(), to.getTime()]
  ) ?? []
}

export async function addTransaction(data: Omit<Transaction, 'id'>) {
  return db.transactions.add(data)
}

export async function updateTransaction(id: number, data: Partial<Transaction>) {
  return db.transactions.update(id, data)
}

export async function deleteTransaction(id: number) {
  return db.transactions.delete(id)
}
