import { db } from '../db/db'
import { deleteAllCloudData, pushAllUserData } from '../services/sync'
import type {
  Account, Tag, Transaction, Recurring, Preset,
  SavingsPlan, SavingsCashFlow, ScheduledPayment, UserSettings,
  WeightEntry, FoodEntry, ExerciseEntry, WaterLog, HealthSettings,
} from '../types'

// ─── EXPORT ───────────────────────────────────────────────────────────────────

export async function exportData(): Promise<void> {
  const [accounts, tags, transactions, recurring, presets, savingsPlans, savingsCashFlows, scheduledPayments, userSettings, weightEntries, foodEntries, exerciseEntries, waterLogs, healthSettings] =
    await Promise.all([
      db.accounts.toArray(),
      db.tags.toArray(),
      db.transactions.toArray(),
      db.recurring.toArray(),
      db.presets.toArray(),
      db.savingsPlans.toArray(),
      db.savingsCashFlows.toArray(),
      db.scheduledPayments.toArray(),
      db.userSettings.toArray(),
      db.weightEntries.toArray(),
      db.foodEntries.toArray(),
      db.exerciseEntries.toArray(),
      db.waterLogs.toArray(),
      db.healthSettings.toArray(),
    ])

  const payload = {
    version: 4,
    exportedAt: new Date().toISOString(),
    accounts, tags, transactions, recurring, presets,
    savingsPlans, savingsCashFlows, scheduledPayments, userSettings,
    weightEntries, foodEntries, exerciseEntries, waterLogs, healthSettings,
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pocketflow-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── CSV EXPORT (transactions, for Excel/Sheets) ─────────────────────────────

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export async function exportCSV(): Promise<void> {
  const [transactions, accounts, tags] = await Promise.all([
    db.transactions.orderBy('date').reverse().toArray(),
    db.accounts.toArray(),
    db.tags.toArray(),
  ])
  const accName = (id?: string) => accounts.find((a) => a.id === id)?.name ?? ''
  const tagName = (id?: string) => tags.find((t) => t.id === id)?.name ?? ''
  const typeLabel: Record<string, string> = { income: 'รายรับ', expense: 'รายจ่าย', transfer: 'โอนเงิน' }

  const header = ['วันที่', 'เวลา', 'ประเภท', 'จำนวน', 'บัญชี', 'บัญชีปลายทาง', 'หมวดหมู่', 'บันทึก', 'รายการต่อเนื่อง']
  const rows = transactions.map((t) => {
    const d = new Date(t.date)
    return [
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
      typeLabel[t.type] ?? t.type,
      t.amount,
      accName(t.accountId),
      t.type === 'transfer' ? accName(t.toAccountId) : '',
      tagName(t.tagId),
      t.note ?? '',
      t.isRecurring ? 'ใช่' : '',
    ].map(csvCell).join(',')
  })

  // BOM so Excel reads UTF-8 Thai correctly
  const csv = '﻿' + [header.map(csvCell).join(','), ...rows].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pocketflow-transactions-${new Date().toISOString().slice(0, 10)}.csv`
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
  userSettings: number
  weightEntries: number
  foodEntries: number
  exerciseEntries: number
  waterLogs: number
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
      userSettings: count('userSettings'),
      weightEntries: count('weightEntries'),
      foodEntries: count('foodEntries'),
      exerciseEntries: count('exerciseEntries'),
      waterLogs: count('waterLogs'),
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
    remindedAt: r.remindedAt ? new Date(r.remindedAt as string) : undefined,
  })) as unknown as ScheduledPayment[]
  const weightEntries = coerce(g('weightEntries'), userId, () => ({})) as unknown as WeightEntry[]
  const foodEntries = coerce(g('foodEntries'), userId, (r) => ({ createdAt: new Date(r.createdAt as string) })) as unknown as FoodEntry[]
  const exerciseEntries = coerce(g('exerciseEntries'), userId, (r) => ({ createdAt: new Date(r.createdAt as string) })) as unknown as ExerciseEntry[]
  const waterLogs = coerce(g('waterLogs'), userId, () => ({})) as unknown as WaterLog[]

  // userSettings is keyed by userId (one row per user), not id. Collapse any
  // exported settings to the current user.
  const settingsRows = g('userSettings')
  const importedSettings = settingsRows.length
    ? ({ ...(settingsRows[0] as R), userId } as unknown as UserSettings)
    : null
  const healthRows = g('healthSettings')
  const importedHealthSettings = healthRows.length
    ? ({ ...(healthRows[0] as R), userId } as unknown as HealthSettings)
    : null

  const allTables = [
    db.accounts, db.tags, db.transactions, db.recurring, db.presets,
    db.savingsPlans, db.savingsCashFlows, db.scheduledPayments, db.userSettings,
    db.weightEntries, db.foodEntries, db.exerciseEntries, db.waterLogs, db.healthSettings,
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
      if (importedSettings) await db.userSettings.put(importedSettings)
      if (weightEntries.length) await db.weightEntries.bulkAdd(weightEntries)
      if (foodEntries.length) await db.foodEntries.bulkAdd(foodEntries)
      if (exerciseEntries.length) await db.exerciseEntries.bulkAdd(exerciseEntries)
      if (waterLogs.length) await db.waterLogs.bulkAdd(waterLogs)
      if (importedHealthSettings) await db.healthSettings.put(importedHealthSettings)
    })
  } else {
    // Merge: fetch existing IDs for each table, then only add records not yet present
    const [eA, eTg, eTx, eR, ePr, eSP, eSCF, eSch, eW, eF, eEx, eWa] = await Promise.all([
      db.accounts.toCollection().primaryKeys(),
      db.tags.toCollection().primaryKeys(),
      db.transactions.toCollection().primaryKeys(),
      db.recurring.toCollection().primaryKeys(),
      db.presets.toCollection().primaryKeys(),
      db.savingsPlans.toCollection().primaryKeys(),
      db.savingsCashFlows.toCollection().primaryKeys(),
      db.scheduledPayments.toCollection().primaryKeys(),
      db.weightEntries.toCollection().primaryKeys(),
      db.foodEntries.toCollection().primaryKeys(),
      db.exerciseEntries.toCollection().primaryKeys(),
      db.waterLogs.toCollection().primaryKeys(),
    ])
    const toSet = (pks: unknown[]) => new Set(pks.map(String))
    const sA = toSet(eA), sTg = toSet(eTg), sTx = toSet(eTx), sR = toSet(eR)
    const sPr = toSet(ePr), sSP = toSet(eSP), sSCF = toSet(eSCF), sSch = toSet(eSch)
    const sW = toSet(eW), sF = toSet(eF), sEx = toSet(eEx), sWa = toSet(eWa)

    await db.transaction('rw', allTables, async () => {
      const newA = accounts.filter((a) => !sA.has(a.id))
      const newTg = tags.filter((a) => !sTg.has(a.id))
      const newTx = transactions.filter((a) => !sTx.has(a.id))
      const newR = recurring.filter((a) => !sR.has(a.id))
      const newPr = presets.filter((a) => !sPr.has(a.id))
      const newSP = savingsPlans.filter((a) => !sSP.has(a.id))
      const newSCF = savingsCashFlows.filter((a) => !sSCF.has(a.id))
      const newSch = scheduledPayments.filter((a) => !sSch.has(a.id))
      const newW = weightEntries.filter((a) => !sW.has(a.id))
      const newF = foodEntries.filter((a) => !sF.has(a.id))
      const newEx = exerciseEntries.filter((a) => !sEx.has(a.id))
      const newWa = waterLogs.filter((a) => !sWa.has(a.id))

      if (newA.length) await db.accounts.bulkAdd(newA)
      if (newTg.length) await db.tags.bulkAdd(newTg)
      if (newTx.length) await db.transactions.bulkAdd(newTx)
      if (newR.length) await db.recurring.bulkAdd(newR)
      if (newPr.length) await db.presets.bulkAdd(newPr)
      if (newSP.length) await db.savingsPlans.bulkAdd(newSP)
      if (newSCF.length) await db.savingsCashFlows.bulkAdd(newSCF)
      if (newSch.length) await db.scheduledPayments.bulkAdd(newSch)
      if (newW.length) await db.weightEntries.bulkAdd(newW)
      if (newF.length) await db.foodEntries.bulkAdd(newF)
      if (newEx.length) await db.exerciseEntries.bulkAdd(newEx)
      if (newWa.length) await db.waterLogs.bulkAdd(newWa)
      // Only adopt imported settings if this user has none yet (don't clobber
      // an existing Discord webhook / summary prefs on merge)
      if (importedSettings && !(await db.userSettings.get(userId))) {
        await db.userSettings.put(importedSettings)
      }
      if (importedHealthSettings && !(await db.healthSettings.get(userId))) {
        await db.healthSettings.put(importedHealthSettings)
      }
    })
  }

  // Sync imported data up to the cloud — without this, the next pull
  // would clear local and the imported data would vanish.
  if (userId !== 'local') await pushAllUserData(userId)
}
