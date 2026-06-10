import { useLiveQuery } from 'dexie-react-hooks'
import { db, LOCAL_USER_ID } from '../db/db'
import { useAuthStore } from '../stores/useAuthStore'
import { pushAccount, deleteCloudAccount, pushTransaction, pushRecurring, pushPreset, pushScheduledPayment } from '../services/sync'
import type { Account, Transaction, Recurring, Preset, ScheduledPayment } from '../types'

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

export interface AccountDeleteSnapshot {
  account: Account
  transactions: Transaction[]      // deleted (accountId === id)
  transferTargets: Transaction[]   // originals whose toAccountId was nulled
  recurring: Recurring[]
  presets: Preset[]
  scheduledPayments: ScheduledPayment[]
}

// Mirror the cloud's FK cascade locally so local and cloud stay consistent:
// transactions/recurring/presets/scheduledPayments referencing this account
// are deleted in the cloud via ON DELETE CASCADE; to_account_id is SET NULL.
// Returns a snapshot of everything removed so the caller can offer undo.
export async function deleteAccount(id: string): Promise<AccountDeleteSnapshot | null> {
  const account = await db.accounts.get(id)
  if (!account) return null
  const userId = currentUserId()

  const [transactions, transferTargets, recurring, presets, scheduledPayments] = await Promise.all([
    db.transactions.where('accountId').equals(id).toArray(),
    db.transactions.where('toAccountId').equals(id).toArray(),
    db.recurring.where('accountId').equals(id).toArray(),
    db.presets.where('accountId').equals(id).toArray(),
    db.scheduledPayments.where('userId').equals(userId).filter((p) => p.accountId === id).toArray(),
  ])

  await db.transaction('rw', [db.accounts, db.transactions, db.recurring, db.presets, db.scheduledPayments], async () => {
    await db.transactions.where('accountId').equals(id).delete()
    await db.transactions.where('toAccountId').equals(id).modify({ toAccountId: undefined })
    await db.recurring.where('accountId').equals(id).delete()
    await db.presets.where('accountId').equals(id).delete()
    await db.scheduledPayments.where('userId').equals(userId).filter((p) => p.accountId === id).delete()
    await db.accounts.delete(id)
  })
  deleteCloudAccount(id).catch(console.error)
  return { account, transactions, transferTargets, recurring, presets, scheduledPayments }
}

// Put a previously deleted account and everything that cascaded back (undo)
export async function restoreAccount(s: AccountDeleteSnapshot) {
  await db.transaction('rw', [db.accounts, db.transactions, db.recurring, db.presets, db.scheduledPayments], async () => {
    await db.accounts.put(s.account)
    if (s.transactions.length) await db.transactions.bulkPut(s.transactions)
    if (s.transferTargets.length) await db.transactions.bulkPut(s.transferTargets)
    if (s.recurring.length) await db.recurring.bulkPut(s.recurring)
    if (s.presets.length) await db.presets.bulkPut(s.presets)
    if (s.scheduledPayments.length) await db.scheduledPayments.bulkPut(s.scheduledPayments)
  })
  // push account first so FK references resolve in the cloud
  try {
    await pushAccount(s.account)
    await Promise.all([
      ...s.transactions.map(pushTransaction),
      ...s.transferTargets.map(pushTransaction),
      ...s.recurring.map(pushRecurring),
      ...s.presets.map(pushPreset),
      ...s.scheduledPayments.map(pushScheduledPayment),
    ])
  } catch (e) {
    console.error('restoreAccount cloud push failed', e)
  }
}
