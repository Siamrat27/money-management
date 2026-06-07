import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db/db'
import type { Account, Transaction } from '../types'

export function useAccounts() {
  return useLiveQuery(() => db.accounts.toArray(), []) ?? []
}

export function useAccountBalance(accountId: number, transactions: Transaction[]): number {
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

export async function getAccountBalance(accountId: number): Promise<number> {
  const txns = await db.transactions.toArray()
  let balance = 0
  for (const t of txns) {
    if (t.type === 'income' && t.accountId === accountId) balance += t.amount
    if (t.type === 'expense' && t.accountId === accountId) balance -= t.amount
    if (t.type === 'transfer') {
      if (t.accountId === accountId) balance -= t.amount
      if (t.toAccountId === accountId) balance += t.amount
    }
  }
  return balance
}

export async function addAccount(data: Omit<Account, 'id'>) {
  return db.accounts.add(data)
}

export async function updateAccount(id: number, data: Partial<Account>) {
  return db.accounts.update(id, data)
}

export async function deleteAccount(id: number) {
  return db.accounts.delete(id)
}
