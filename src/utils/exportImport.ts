import { db } from '../db/db'
import { deleteAllCloudData, pushAllUserData } from '../services/sync'
import type {
  Account, Tag, Transaction, Recurring, Preset,
  SavingsPlan, SavingsCashFlow, ScheduledPayment,
} from '../types'

// ─── EXPORT ───────────────────────────────────────────────────────────────────

export async function exportData(): Promise<void> {
  const [accounts, tags, transactions, recurring, presets, savingsPlans, savingsCashFlows, scheduledPayments] =
    await Promise.all([
      db.accounts.toArray(),
      db.tags.toArray(),
      db.transactions.toArray(),
      db.recurring.toArray(),
      db.presets.toArray(),
      db.savingsPlans.toArray(),
      db.savingsCashFlows.toArray(),
      db.scheduledPayments.toArray(),
    ])

  const payload = {
    version: 2,
    exportedAt: new Date().toISOString(),
    accounts, tags, transactions, recurring, presets,
    savingsPlans, savingsCashFlows, scheduledPayments,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pocketflow-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── PREVIEW ──────────────────────────────────────────────────────────────────

export interface ImportPreview {
  accounts: number
  tags: number
  transactions: number
  recurring: number
  presets: number
  savingsPlans: number
  savingsCashFlows: number
  scheduledPayments: number
}

export interface ImportPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any[]>
  preview: ImportPreview
  exportedAt?: string
}

export async function parseImportFile(file: File): Promise<ImportPayload> {
  const text = await file.text()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw = JSON.parse(text) as Record<string, any>
  const count = (k: string): number => (Array.isArray(raw[k]) ? (raw[k] as unknown[]).length : 0)
  return {
    raw,
    exportedAt: typeof raw.exportedAt === 'string' ? raw.exportedAt : undefined,
    preview: {
      accounts: count('accounts'),
      tags: count('tags'),
      transactions: count('transactions'),
      recurring: count('recurring'),
      presets: count('presets'),
      savingsPlans: count('savingsPlans'),
      savingsCashFlows: count('savingsCashFlows'),
      scheduledPayments: count('scheduledPayments'),
    },
  }
}

// ─── IMPORT ───────────────────────────────────────────────────────────────────

type R = Record<string, unknown>

function coerce(raw: R[], uid: string, transform: (r: R) => R): R[] {
  return raw.map((r) => ({ ...r, userId: uid, ...transform(r) }))
}

export async function importData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: Record<string, any[]>,
  mode: 'overwrite' | 'merge',
  userId: string,
): Promise<void> {
  const g = (k: string): R[] => (Array.isArray(raw[k]) ? (raw[k] as R[]) : [])

  const accounts = coerce(g('accounts'), userId, (r) => ({ createdAt: new Date(r.createdAt as string) })) as unknown as Account[]
  const tags = coerce(g('tags'), userId, () => ({})) as unknown as Tag[]
  const transactions = coerce(g('transactions'), userId, (r) => ({ date: new Date(r.date as string) })) as unknown as Transaction[]
  const recurring = coerce(g('recurring'), userId, (r) => ({
    startDate: new Date(r.startDate as string),
    nextDueDate: new Date(r.nextDueDate as string),
    endDate: r.endDate ? new Date(r.endDate as string) : undefined,
  })) as unknown as Recurring[]
  const presets = coerce(g('presets'), userId, () => ({})) as unknown as Preset[]
  const savingsPlans = coerce(g('savingsPlans'), userId, (r) => ({
    targetDate: new Date(r.targetDate as string),
  })) as unknown as SavingsPlan[]
  const savingsCashFlows = coerce(g('savingsCashFlows'), userId, () => ({})) as unknown as SavingsCashFlow[]
  const scheduledPayments = coerce(g('scheduledPayments'), userId, (r) => ({
    dueDate: new Date(r.dueDate as string),
    executedAt: r.executedAt ? new Date(r.executedAt as string) : undefined,
  })) as unknown as ScheduledPayment[]

  const allTables = [
    db.accounts, db.tags, db.transactions, db.recurring, db.presets,
    db.savingsPlans, db.savingsCashFlows, db.scheduledPayments,
  ]

  if (mode === 'overwrite') {
    // Clear ONLY this user's rows (other users' local data must survive),
    // and clear the cloud too — otherwise the next pull restores old data.
    if (userId !== 'local') await deleteAllCloudData(userId)
    await db.transaction('rw', allTables, async () => {
      for (const t of allTables) await t.where('userId').equals(userId).delete()
      if (accounts.length) await db.accounts.bulkAdd(accounts)
      if (tags.length) await db.tags.bulkAdd(tags)
      if (transactions.length) await db.transactions.bulkAdd(transactions)
      if (recurring.length) await db.recurring.bulkAdd(recurring)
      if (presets.length) await db.presets.bulkAdd(presets)
      if (savingsPlans.length) await db.savingsPlans.bulkAdd(savingsPlans)
      if (savingsCashFlows.length) await db.savingsCashFlows.bulkAdd(savingsCashFlows)
      if (scheduledPayments.length) await db.scheduledPayments.bulkAdd(scheduledPayments)
    })
  } else {
    // Merge: fetch existing IDs for each table, then only add records not yet present
    const [eA, eTg, eTx, eR, ePr, eSP, eSCF, eSch] = await Promise.all([
      db.accounts.toCollection().primaryKeys(),
      db.tags.toCollection().primaryKeys(),
      db.transactions.toCollection().primaryKeys(),
      db.recurring.toCollection().primaryKeys(),
      db.presets.toCollection().primaryKeys(),
      db.savingsPlans.toCollection().primaryKeys(),
      db.savingsCashFlows.toCollection().primaryKeys(),
      db.scheduledPayments.toCollection().primaryKeys(),
    ])
    const toSet = (pks: unknown[]) => new Set(pks.map(String))
    const sA = toSet(eA), sTg = toSet(eTg), sTx = toSet(eTx), sR = toSet(eR)
    const sPr = toSet(ePr), sSP = toSet(eSP), sSCF = toSet(eSCF), sSch = toSet(eSch)

    await db.transaction('rw', allTables, async () => {
      const newA = accounts.filter((a) => !sA.has(a.id))
      const newTg = tags.filter((a) => !sTg.has(a.id))
      const newTx = transactions.filter((a) => !sTx.has(a.id))
      const newR = recurring.filter((a) => !sR.has(a.id))
      const newPr = presets.filter((a) => !sPr.has(a.id))
      const newSP = savingsPlans.filter((a) => !sSP.has(a.id))
      const newSCF = savingsCashFlows.filter((a) => !sSCF.has(a.id))
      const newSch = scheduledPayments.filter((a) => !sSch.has(a.id))

      if (newA.length) await db.accounts.bulkAdd(newA)
      if (newTg.length) await db.tags.bulkAdd(newTg)
      if (newTx.length) await db.transactions.bulkAdd(newTx)
      if (newR.length) await db.recurring.bulkAdd(newR)
      if (newPr.length) await db.presets.bulkAdd(newPr)
      if (newSP.length) await db.savingsPlans.bulkAdd(newSP)
      if (newSCF.length) await db.savingsCashFlows.bulkAdd(newSCF)
      if (newSch.length) await db.scheduledPayments.bulkAdd(newSch)
    })
  }

  // Sync imported data up to the cloud — without this, the next pull
  // would clear local and the imported data would vanish.
  if (userId !== 'local') await pushAllUserData(userId)
}
