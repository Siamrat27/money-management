import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushAccount, deleteCloudAccount } from '../services/sync'
import type { Account, Transaction } from '../types'

function currentUserId(): string {
  return useAuthStore.getState().user?.id ?? LOCAL_USER_ID
}

export function useAccounts() {
  const userId = useAuthStore((s) => s.user?.id ?? LOCAL_USER_ID)
  return useLiveQuery(() => db.accounts.where('userId').equals(userId).toArray(), [userId]) ?? []
}

export function useAccountBalance(accountId: string, transactions: Transaction[]): number {
  return calcBalance(accountId, transactions)
}

export function calcBalance(accountId: string, transactions: Transaction[]): number {
  let balance = 0
  for (const t of transactions) {
    if (t.type === 'income' && t.accountId === accountId) balance += t.amount
    if (t.type === 'expense' && t.accountId === accountId) balance -= t.amount
    if (t.type === 'transfer') {
      if (t.accountId === accountId) balance -= t.amount
      if (t.toAccountId === accountId) balance += t.amount
    }
  }
  return balance
}

export async function getAccountBalance(accountId: string): Promise<number> {
  const userId = currentUserId()
  const txns = await db.transactions.where('userId').equals(userId).toArray()
  return calcBalance(accountId, txns)
}

export async function addAccount(data: Omit<Account, 'id' | 'userId'>) {
  const record: Account = { ...data, id: crypto.randomUUID(), userId: currentUserId() }
  await db.accounts.add(record)
  pushAccount(record).catch(console.error)
  return record.id
}

export async function updateAccount(id: string, data: Partial<Account>) {
  await db.accounts.update(id, data)
  const updated = await db.accounts.get(id)
  if (updated) pushAccount(updated).catch(console.error)
}

export async function deleteAccount(id: string) {
  await db.accounts.delete(id)
  deleteCloudAccount(id).catch(console.error)
}
