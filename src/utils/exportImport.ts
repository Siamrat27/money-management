import { db } from '../db/db'

export async function exportData(): Promise<void> {
  const [accounts, tags, transactions, recurring] = await Promise.all([
    db.accounts.toArray(),
    db.tags.toArray(),
    db.transactions.toArray(),
    db.recurring.toArray(),
  ])
  const data = { accounts, tags, transactions, recurring, exportedAt: new Date().toISOString() }
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `pocketflow-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importData(file: File): Promise<void> {
  const text = await file.text()
  const data = JSON.parse(text)
  await db.transaction('rw', db.accounts, db.tags, db.transactions, db.recurring, async () => {
    await db.accounts.clear()
    await db.tags.clear()
    await db.transactions.clear()
    await db.recurring.clear()
    if (data.accounts?.length) await db.accounts.bulkAdd(data.accounts.map((a: Record<string,unknown>) => ({ ...a, createdAt: new Date(a.createdAt as string) })))
    if (data.tags?.length) await db.tags.bulkAdd(data.tags)
    if (data.transactions?.length) await db.transactions.bulkAdd(data.transactions.map((t: Record<string,unknown>) => ({ ...t, date: new Date(t.date as string) })))
    if (data.recurring?.length) await db.recurring.bulkAdd(data.recurring.map((r: Record<string,unknown>) => ({
      ...r,
      startDate: new Date(r.startDate as string),
      nextDueDate: new Date(r.nextDueDate as string),
      endDate: r.endDate ? new Date(r.endDate as string) : undefined,
    })))
  })
}
